<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Db\Transaction;
use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Organization\OrganizationRecord;
use UecTst\Organization\OrgAuthContext;
use UecTst\Organization\OrgView;
use UecTst\Support\Time;
use UecTst\Validation\Input;
use UecTst\Validation\Params;

/**
 * 組織の管理（ApiSpec_Organization.md 6.）。運用担当者の組織だけが呼べる。運用担当者の組織自身は、
 * 一覧には表示されるが、名前の変更・パスワードの再発行・削除の対象外（409 SUPER_ORGANIZATION_PROTECTED）。
 *   O17 一覧 GET /org/organizations
 *   O18 登録 POST /org/organizations
 *   O19 組織名・読み仮名の変更 PATCH /org/organizations/{organizationId}
 *   O20 パスワードの再発行 POST /org/organizations/{organizationId}/password-reset（確認が必要）
 *   O21 削除 DELETE /org/organizations/{organizationId}（確認が必要）
 */
final class OrgAdminController extends OrgController
{
    /** O17 組織の一覧 */
    public function list(Request $request): Response
    {
        return $this->guarded($request, function (OrgAuthContext $c): Response {
            $items = array_map(static fn (array $row): array => [
                'id' => Uuid7::toString($row['organization']->id),
                'name' => $row['organization']->name,
                'nameKana' => $row['organization']->nameKana,
                'loginId' => $row['organization']->loginId,
                'isSuper' => $row['organization']->isSuper,
                'memberFamilyCount' => $row['memberFamilyCount'],
                'createdAt' => Time::toIso($row['organization']->createdAt),
            ], $this->services->organizations->listWithMemberCounts());
            return Response::json(200, ['organizations' => $items]);
        }, superOnly: true);
    }

    /** O18 組織の登録（ログインアカウントの発行。初期パスワードは、このレスポンスでのみ返す） */
    public function create(Request $request): Response
    {
        $data = $request->json();
        $nameInput = Params::string($data, 'name');
        $loginIdInput = Params::string($data, 'loginId');
        $kanaInput = Params::optionalString($data, 'nameKana');

        return $this->guarded($request, function (OrgAuthContext $c) use ($nameInput, $loginIdInput, $kanaInput): Response {
            $services = $this->services;
            $name = Input::normalizeText($nameInput);
            $loginId = strtolower(trim($loginIdInput));
            $kana = Input::normalizeKana($kanaInput ?? '');
            $details = [];
            if (($error = Input::organizationNameError($name)) !== null) {
                $details[] = ['field' => 'name', 'code' => $error];
            }
            if (($error = Input::kanaError($kana)) !== null) {
                $details[] = ['field' => 'nameKana', 'code' => $error];
            }
            if (($error = Input::loginIdError($loginId)) !== null) {
                $details[] = ['field' => 'loginId', 'code' => $error];
            }
            if ($details !== []) {
                throw ApiException::validationFailed('組織名とログインIDを確認してください。', $details);
            }
            if ($services->organizations->loginIdTaken($loginId)) {
                throw self::duplicateLoginId();
            }
            if ($services->organizations->nameTaken($name)) {
                throw self::duplicateName();
            }

            $password = $services->orgPasswords->generateInitialPassword();
            $id = Uuid7::generateBinary();
            $duplicate = $services->organizations->insert($id, $name, $kana === '' ? null : $kana, $loginId, $services->orgPasswords->hash($password), $services->clock->now());
            if ($duplicate !== null) {
                // 同時の登録で、事前の確認をすり抜けた場合。
                throw $duplicate === 'login_id' ? self::duplicateLoginId() : self::duplicateName();
            }
            $created = $services->organizations->find($id) ?? throw ApiException::internal();
            $this->audit('organization.create', $c->organizationId(), 'success', ['targetId' => Uuid7::toString($id)]);

            return Response::json(201, ['organization' => OrgView::organization($created), 'initialPassword' => $password]);
        }, superOnly: true);
    }

    /** O19 組織名・読み仮名の変更（送った項目だけを変更する。nameKana が空文字または null なら、読み仮名を未登録にする） */
    public function rename(Request $request, array $params): Response
    {
        $data = $request->json();
        $nameInput = Params::optionalString($data, 'name');
        $hasKana = array_key_exists('nameKana', $data);
        $kanaInput = Params::optionalString($data, 'nameKana');
        if ($nameInput === null && !$hasKana) {
            throw ApiException::badRequest('「name」または「nameKana」を指定してください。');
        }

        return $this->guarded($request, function (OrgAuthContext $c) use ($params, $nameInput, $hasKana, $kanaInput): Response {
            $services = $this->services;
            $target = $this->targetOrganization($params);
            $this->assertNotSuper($target);

            $name = $nameInput === null ? $target->name : Input::normalizeText($nameInput);
            $kana = $hasKana ? Input::normalizeKana($kanaInput ?? '') : ($target->nameKana ?? '');
            $details = [];
            if (($error = Input::organizationNameError($name)) !== null) {
                $details[] = ['field' => 'name', 'code' => $error];
            }
            if (($error = Input::kanaError($kana)) !== null) {
                $details[] = ['field' => 'nameKana', 'code' => $error];
            }
            if ($details !== []) {
                throw ApiException::validationFailed('組織名と読み仮名を確認してください。', $details);
            }
            if ($services->organizations->nameTakenByOther($name, $target->id) || $services->organizations->rename($target->id, $name, $kana === '' ? null : $kana) !== null) {
                throw self::duplicateName();
            }
            $this->audit('organization.rename', $c->organizationId(), 'success', ['targetId' => Uuid7::toString($target->id)]);

            $updated = $services->organizations->find($target->id) ?? throw ApiException::notFound('組織が見つかりません。');
            return Response::json(200, ['organization' => OrgView::organization($updated)]);
        }, superOnly: true);
    }

    /** O20 パスワードの再発行（確認が必要。その組織のすべてのセッションを削除する） */
    public function resetPassword(Request $request, array $params): Response
    {
        return $this->guarded($request, function (OrgAuthContext $c) use ($params): Response {
            $this->requireElevation($c);
            $services = $this->services;
            $target = $this->targetOrganization($params);
            $this->assertNotSuper($target);

            $password = $services->orgPasswords->generateInitialPassword();
            $hash = $services->orgPasswords->hash($password);
            Transaction::run($services->pdo, function () use ($services, $target, $hash): void {
                $services->organizations->lock($target->id) ?? throw ApiException::notFound('組織が見つかりません。');
                $services->organizations->setPassword($target->id, $hash, true);
                $services->orgSessions->deleteAll($target->id);
            });
            $this->audit('password.reset', $c->organizationId(), 'success', ['targetId' => Uuid7::toString($target->id)]);

            return Response::json(200, ['initialPassword' => $password]);
        }, superOnly: true);
    }

    /** O21 組織の削除（確認が必要。所属していた家族は、個人ユーザになる。利用データは削除しない） */
    public function delete(Request $request, array $params): Response
    {
        return $this->guarded($request, function (OrgAuthContext $c) use ($params): Response {
            $this->requireElevation($c);
            $services = $this->services;
            $target = $this->targetOrganization($params);
            $this->assertNotSuper($target);

            $released = Transaction::run($services->pdo, function () use ($services, $target): int {
                $services->organizations->lock($target->id) ?? throw ApiException::notFound('組織が見つかりません。');
                // 外部キーの ON DELETE SET NULL は organization_joined_at を NULL にしないため、先に、所属を解除する。
                $count = $services->organizations->releaseMembers($target->id);
                $services->organizations->delete($target->id);
                return $count;
            });
            $this->audit('organization.delete', $c->organizationId(), 'success', ['targetId' => Uuid7::toString($target->id), 'releasedFamilyCount' => $released]);

            return Response::json(200, ['releasedFamilyCount' => $released]);
        }, superOnly: true);
    }

    /** @param array<string, string> $params */
    private function targetOrganization(array $params): OrganizationRecord
    {
        $id = self::idParam($params, 'organizationId');
        return ($id === null ? null : $this->services->organizations->find($id)) ?? throw ApiException::notFound('組織が見つかりません。');
    }

    private function assertNotSuper(OrganizationRecord $target): void
    {
        if ($target->isSuper) {
            throw ApiException::conflict('SUPER_ORGANIZATION_PROTECTED', '運用担当者の組織は、名前の変更・パスワードの再発行・削除はできません。');
        }
    }

    private static function duplicateName(): ApiException
    {
        return ApiException::conflict('DUPLICATE_ORGANIZATION_NAME', '同じ名前の組織が、すでにあります。');
    }

    private static function duplicateLoginId(): ApiException
    {
        return ApiException::conflict('DUPLICATE_LOGIN_ID', '同じログインIDが、すでにあります。');
    }
}
