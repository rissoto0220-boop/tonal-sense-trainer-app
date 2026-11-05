<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Organization\OrganizationRecord;
use UecTst\Organization\OrgAuthContext;
use UecTst\Organization\OrgPasswordService;
use UecTst\Support\Time;
use UecTst\Validation\Params;

/**
 * 組織のパスワードと、破壊的な操作の確認（ApiSpec_Organization.md 2.）。
 *   O6 パスワードの変更 PUT /org/password
 *   O7 破壊的な操作の確認 POST /org/elevation
 */
final class OrgAccountController extends OrgController
{
    /** O6 パスワードの変更（段階0でも、パスワードの変更が必要な間でも呼べる） */
    public function changePassword(Request $request): Response
    {
        $data = $request->json();
        $current = Params::string($data, 'currentPassword');
        $new = Params::string($data, 'newPassword');

        return $this->guarded($request, function (OrgAuthContext $c) use ($current, $new): Response {
            OrgPasswordService::assertValidFormat($new, 'newPassword');
            if ($new === $current) {
                throw ApiException::validationFailed('現在のパスワードとは別のパスワードにしてください。', [['field' => 'newPassword', 'code' => 'SAME_PASSWORD']]);
            }

            $services = $this->services;
            $orgId = $c->organizationId();
            $newHash = $services->orgPasswords->hash($new);
            // 一致したときだけ、同じトランザクションの中で、新しいパスワードの保存と、他の端末のセッションの削除を行う。
            $outcome = $services->orgPasswords->attempt($orgId, $current, function (OrganizationRecord $o) use ($services, $newHash, $c): void {
                $services->organizations->setPassword($o->id, $newHash, false);
                $services->orgSessions->deleteOthers($o->id, $c->session->id);
            });
            $this->assertPasswordOutcome($outcome, $orgId, 'password.change');
            $this->audit('password.change', $orgId);

            return Response::noContent();
        }, requireLoginComplete: false, allowPasswordChangeRequired: true);
    }

    /** O7 破壊的な操作の確認（パスワードの再入力。この端末で5分間） */
    public function elevate(Request $request): Response
    {
        $password = Params::string($request->json(), 'password');

        return $this->guarded($request, function (OrgAuthContext $c) use ($password): Response {
            if ($password === '') {
                throw ApiException::validationFailed('パスワードを入力してください。', [['field' => 'password', 'code' => 'REQUIRED']]);
            }
            $orgId = $c->organizationId();
            $until = null;
            $outcome = $this->services->orgPasswords->attempt($orgId, $password, function () use ($c, &$until): void {
                $until = $this->services->orgSessions->elevate($c->session->id);
            });
            $this->assertPasswordOutcome($outcome, $orgId, 'elevation');

            return Response::json(200, ['elevatedUntil' => Time::toIso($until)]);
        });
    }
}
