<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Belonging\BelongingRecord;
use UecTst\Belonging\BlgAuthContext;
use UecTst\Belonging\BlgPasswordService;
use UecTst\Support\Time;
use UecTst\Validation\Params;

/**
 * 所属のパスワードと、破壊的な操作の確認（ApiSpec_Belonging.md 2.）。
 *   B6 パスワードの変更 PUT /blg/password
 *   B7 破壊的な操作の確認 POST /blg/elevation
 */
final class BlgAccountController extends BlgController
{
    /** B6 パスワードの変更（段階0でも、パスワードの変更が必要な間でも呼べる） */
    public function changePassword(Request $request): Response
    {
        $data = $request->json();
        $current = Params::string($data, 'currentPassword');
        $new = Params::string($data, 'newPassword');

        return $this->guarded($request, function (BlgAuthContext $c) use ($current, $new): Response {
            BlgPasswordService::assertValidFormat($new, 'newPassword');
            if ($new === $current) {
                throw ApiException::validationFailed('現在のパスワードとは別のパスワードにしてください。', [['field' => 'newPassword', 'code' => 'SAME_PASSWORD']]);
            }

            $services = $this->services;
            $blgId = $c->belongingId();
            $newHash = $services->blgPasswords->hash($new);
            // 一致したときだけ、同じトランザクションの中で、新しいパスワードの保存と、他の端末のセッションの削除を行う。
            $outcome = $services->blgPasswords->attempt($blgId, $current, function (BelongingRecord $o) use ($services, $newHash, $c): void {
                $services->belongings->setPassword($o->id, $newHash, false);
                $services->blgSessions->deleteOthers($o->id, $c->session->id);
            });
            $this->assertPasswordOutcome($outcome, $blgId, 'password.change');
            $this->audit('password.change', $blgId);

            return Response::noContent();
        }, requireLoginComplete: false, allowPasswordChangeRequired: true);
    }

    /** B7 破壊的な操作の確認（パスワードの再入力。この端末で5分間） */
    public function elevate(Request $request): Response
    {
        $password = Params::string($request->json(), 'password');

        return $this->guarded($request, function (BlgAuthContext $c) use ($password): Response {
            if ($password === '') {
                throw ApiException::validationFailed('パスワードを入力してください。', [['field' => 'password', 'code' => 'REQUIRED']]);
            }
            $blgId = $c->belongingId();
            $until = null;
            $outcome = $this->services->blgPasswords->attempt($blgId, $password, function () use ($c, &$until): void {
                $until = $this->services->blgSessions->elevate($c->session->id);
            });
            $this->assertPasswordOutcome($outcome, $blgId, 'elevation');

            return Response::json(200, ['elevatedUntil' => Time::toIso($until)]);
        });
    }
}
