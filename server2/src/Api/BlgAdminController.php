<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Db\Transaction;
use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Belonging\BelongingRecord;
use UecTst\Belonging\BlgAuthContext;
use UecTst\Belonging\BlgView;
use UecTst\Support\Time;
use UecTst\Validation\Input;
use UecTst\Validation\Params;

/**
 * 所属の管理（ApiSpec_Belonging.md 6.）。運用担当者の所属だけが呼べる。運用担当者の所属自身は、
 * 一覧には表示されるが、名前の変更・パスワードの再発行・削除の対象外（409 SUPER_BELONGING_PROTECTED）。
 *   B17 一覧 GET /blg/belongings
 *   B18 登録 POST /blg/belongings
 *   B19 所属名・読み仮名の変更 PATCH /blg/belongings/{belongingId}
 *   B20 パスワードの再発行 POST /blg/belongings/{belongingId}/password-reset（確認が必要）
 *   B21 削除 DELETE /blg/belongings/{belongingId}（確認が必要）
 */
final class BlgAdminController extends BlgController
{
    /** B17 所属の一覧 */
    public function list(Request $request): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c): Response {
            $items = array_map(static fn (array $row): array => [
                'id' => Uuid7::toString($row['belonging']->id),
                'name' => $row['belonging']->name,
                'nameKana' => $row['belonging']->nameKana,
                'loginId' => $row['belonging']->loginId,
                'isSuper' => $row['belonging']->isSuper,
                'memberFamilyCount' => $row['memberFamilyCount'],
                'createdAt' => Time::toIso($row['belonging']->createdAt),
            ], $this->services->belongings->listWithMemberCounts());
            return Response::json(200, ['belongings' => $items]);
        }, superOnly: true);
    }

    /** B18 所属の登録（ログインアカウントの発行。初期パスワードは、このレスポンスでのみ返す） */
    public function create(Request $request): Response
    {
        $data = $request->json();
        $nameInput = Params::string($data, 'name');
        $loginIdInput = Params::string($data, 'loginId');
        $kanaInput = Params::optionalString($data, 'nameKana');

        return $this->guarded($request, function (BlgAuthContext $c) use ($nameInput, $loginIdInput, $kanaInput): Response {
            $services = $this->services;
            $name = Input::normalizeText($nameInput);
            $loginId = strtolower(trim($loginIdInput));
            $kana = Input::normalizeKana($kanaInput ?? '');
            $details = [];
            if (($error = Input::belongingNameError($name)) !== null) {
                $details[] = ['field' => 'name', 'code' => $error];
            }
            if (($error = Input::kanaError($kana)) !== null) {
                $details[] = ['field' => 'nameKana', 'code' => $error];
            }
            if (($error = Input::loginIdError($loginId)) !== null) {
                $details[] = ['field' => 'loginId', 'code' => $error];
            }
            if ($details !== []) {
                throw ApiException::validationFailed('所属名とログインIDを確認してください。', $details);
            }
            if ($services->belongings->loginIdTaken($loginId)) {
                throw self::duplicateLoginId();
            }
            if ($services->belongings->nameTaken($name)) {
                throw self::duplicateName();
            }

            $password = $services->blgPasswords->generateInitialPassword();
            $id = Uuid7::generateBinary();
            $duplicate = $services->belongings->insert($id, $name, $kana === '' ? null : $kana, $loginId, $services->blgPasswords->hash($password), $services->clock->now());
            if ($duplicate !== null) {
                // 同時の登録で、事前の確認をすり抜けた場合。
                throw $duplicate === 'login_id' ? self::duplicateLoginId() : self::duplicateName();
            }
            $created = $services->belongings->find($id) ?? throw ApiException::internal();
            $this->audit('belonging.create', $c->belongingId(), 'success', ['targetId' => Uuid7::toString($id)]);

            return Response::json(201, ['belonging' => BlgView::belonging($created), 'initialPassword' => $password]);
        }, superOnly: true);
    }

    /** B19 所属名・読み仮名の変更（送った項目だけを変更する。nameKana が空文字または null なら、読み仮名を未登録にする） */
    public function rename(Request $request, array $params): Response
    {
        $data = $request->json();
        $nameInput = Params::optionalString($data, 'name');
        $hasKana = array_key_exists('nameKana', $data);
        $kanaInput = Params::optionalString($data, 'nameKana');
        if ($nameInput === null && !$hasKana) {
            throw ApiException::badRequest('「name」または「nameKana」を指定してください。');
        }

        return $this->guarded($request, function (BlgAuthContext $c) use ($params, $nameInput, $hasKana, $kanaInput): Response {
            $services = $this->services;
            $target = $this->targetBelonging($params);
            $this->assertNotSuper($target);

            $name = $nameInput === null ? $target->name : Input::normalizeText($nameInput);
            $kana = $hasKana ? Input::normalizeKana($kanaInput ?? '') : ($target->nameKana ?? '');
            $details = [];
            if (($error = Input::belongingNameError($name)) !== null) {
                $details[] = ['field' => 'name', 'code' => $error];
            }
            if (($error = Input::kanaError($kana)) !== null) {
                $details[] = ['field' => 'nameKana', 'code' => $error];
            }
            if ($details !== []) {
                throw ApiException::validationFailed('所属名と読み仮名を確認してください。', $details);
            }
            if ($services->belongings->nameTakenByOther($name, $target->id) || $services->belongings->rename($target->id, $name, $kana === '' ? null : $kana) !== null) {
                throw self::duplicateName();
            }
            $this->audit('belonging.rename', $c->belongingId(), 'success', ['targetId' => Uuid7::toString($target->id)]);

            $updated = $services->belongings->find($target->id) ?? throw ApiException::notFound('所属が見つかりません。');
            return Response::json(200, ['belonging' => BlgView::belonging($updated)]);
        }, superOnly: true);
    }

    /** B20 パスワードの再発行（確認が必要。その所属のすべてのセッションを削除する） */
    public function resetPassword(Request $request, array $params): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c) use ($params): Response {
            $this->requireElevation($c);
            $services = $this->services;
            $target = $this->targetBelonging($params);
            $this->assertNotSuper($target);

            $password = $services->blgPasswords->generateInitialPassword();
            $hash = $services->blgPasswords->hash($password);
            Transaction::run($services->pdo, function () use ($services, $target, $hash): void {
                $services->belongings->lock($target->id) ?? throw ApiException::notFound('所属が見つかりません。');
                $services->belongings->setPassword($target->id, $hash, true);
                $services->blgSessions->deleteAll($target->id);
            });
            $this->audit('password.reset', $c->belongingId(), 'success', ['targetId' => Uuid7::toString($target->id)]);

            return Response::json(200, ['initialPassword' => $password]);
        }, superOnly: true);
    }

    /** B21 所属の削除（確認が必要。所属していた家族は、個人ユーザになる。利用データは削除しない） */
    public function delete(Request $request, array $params): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c) use ($params): Response {
            $this->requireElevation($c);
            $services = $this->services;
            $target = $this->targetBelonging($params);
            $this->assertNotSuper($target);

            $released = Transaction::run($services->pdo, function () use ($services, $target): int {
                $services->belongings->lock($target->id) ?? throw ApiException::notFound('所属が見つかりません。');
                // 外部キーの ON DELETE SET NULL は belonging_joined_at を NULL にしないため、先に、所属を解除する。
                $count = $services->belongings->releaseMembers($target->id);
                $services->belongings->delete($target->id);
                return $count;
            });
            $this->audit('belonging.delete', $c->belongingId(), 'success', ['targetId' => Uuid7::toString($target->id), 'releasedFamilyCount' => $released]);

            return Response::json(200, ['releasedFamilyCount' => $released]);
        }, superOnly: true);
    }

    /** @param array<string, string> $params */
    private function targetBelonging(array $params): BelongingRecord
    {
        $id = self::idParam($params, 'belongingId');
        return ($id === null ? null : $this->services->belongings->find($id)) ?? throw ApiException::notFound('所属が見つかりません。');
    }

    private function assertNotSuper(BelongingRecord $target): void
    {
        if ($target->isSuper) {
            throw ApiException::conflict('SUPER_BELONGING_PROTECTED', '運用担当者の所属は、名前の変更・パスワードの再発行・削除はできません。');
        }
    }

    private static function duplicateName(): ApiException
    {
        return ApiException::conflict('DUPLICATE_BELONGING_NAME', '同じ名前の所属が、すでにあります。');
    }

    private static function duplicateLoginId(): ApiException
    {
        return ApiException::conflict('DUPLICATE_LOGIN_ID', '同じログインIDが、すでにあります。');
    }
}
