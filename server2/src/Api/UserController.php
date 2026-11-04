<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Auth\AuthContext;
use UecTst\Db\Transaction;
use UecTst\Db\Uuid7;
use UecTst\Family\FamilyView;
use UecTst\Family\UserRecord;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Validation\Input;
use UecTst\Validation\Params;

/**
 * ユーザの管理（ApiSpec_Auth.md 5.）。
 *   #10 一覧 GET /users
 *   #11 追加 POST /users
 *   #12 ユーザ名の変更 PATCH /users/{userId}
 *   #13 並べ替え PUT /users/order
 *   #14 削除 DELETE /users/{userId}（確認が必要）
 *
 * ユーザ数（1〜4名）の確認は、家族の行を SELECT ... FOR UPDATE でロックした上で行う（同時操作で上限を超えたり、0名になったりしない）。
 */
final class UserController extends AuthenticatedController
{
    public const MAX_USERS = 4;

    /** #10 ユーザ一覧 */
    public function list(Request $request): Response
    {
        return $this->authenticated($request, fn (AuthContext $c): Response => Response::json(200, [
            'users' => FamilyView::users($this->services->users->listByFamily($c->familyId())),
        ]));
    }

    /** #11 ユーザの追加 */
    public function add(Request $request): Response
    {
        $name = $this->validName(Params::string($request->json(), 'name'), 'name');

        return $this->authenticated($request, function (AuthContext $c) use ($name): Response {
            $familyId = $c->familyId();
            $user = Transaction::run($this->services->pdo, function () use ($familyId, $name): UserRecord {
                $this->services->families->lock($familyId);
                $users = $this->services->users->listByFamily($familyId);
                if (count($users) >= self::MAX_USERS) {
                    throw ApiException::conflict('USER_LIMIT_REACHED', 'ユーザは、4名までです。');
                }
                $this->assertNameAvailable($users, $name, null);

                // 空いている最小の枠番号と、末尾の表示順（現在の人数＋1）を割り当てる。
                $usedSlots = array_map(static fn (UserRecord $u): int => $u->slot, $users);
                $slot = 1;
                while (in_array($slot, $usedSlots, true)) {
                    $slot++;
                }
                $id = Uuid7::generateBinary();
                $this->services->users->insert($id, $familyId, $name, $slot, count($users) + 1, false, $this->services->clock->now());
                return new UserRecord($id, $familyId, $name, $slot, count($users) + 1, false);
            });
            return Response::json(201, ['user' => FamilyView::user($user)]);
        });
    }

    /** #12 ユーザ名の変更 */
    public function rename(Request $request, array $params): Response
    {
        $name = $this->validName(Params::string($request->json(), 'name'), 'name');

        return $this->authenticated($request, function (AuthContext $c) use ($params, $name): Response {
            $familyId = $c->familyId();
            $user = Transaction::run($this->services->pdo, function () use ($familyId, $params, $name): UserRecord {
                $this->services->families->lock($familyId);
                $target = $this->findUser($familyId, $params['userId'] ?? '');
                $this->assertNameAvailable($this->services->users->listByFamily($familyId), $name, $target->id);
                $this->services->users->rename($target->id, $name, $this->services->clock->now());
                return new UserRecord($target->id, $familyId, $name, $target->slot, $target->displayOrder, $target->isSuperuser);
            });
            return Response::json(200, ['user' => FamilyView::user($user)]);
        });
    }

    /** #13 ユーザの並べ替え */
    public function reorder(Request $request): Response
    {
        $ids = Params::list($request->json(), 'userIds');

        return $this->authenticated($request, function (AuthContext $c) use ($ids): Response {
            $familyId = $c->familyId();
            $users = Transaction::run($this->services->pdo, function () use ($familyId, $ids): array {
                $this->services->families->lock($familyId);
                $current = $this->services->users->listByFamily($familyId);

                // 家族のすべてのユーザの ID を、過不足・重複なく並べたものであること（並べ替え画面を開いた後に、
                // 他の端末でユーザが追加・削除された場合を検出するため）。
                $binary = [];
                foreach ($ids as $id) {
                    if (!is_string($id) || !Uuid7::isValid($id)) {
                        throw ApiException::validationFailed('ユーザの並び順が正しくありません。', [['field' => 'userIds', 'code' => 'INVALID']]);
                    }
                    $binary[] = Uuid7::toBinary($id);
                }
                $existing = array_map(static fn (UserRecord $u): string => $u->id, $current);
                $sortedGiven = $binary;
                sort($sortedGiven);
                sort($existing);
                if (count($binary) !== count(array_unique($binary)) || $sortedGiven !== $existing) {
                    throw ApiException::validationFailed('ユーザの一覧が変更されています。最新の一覧を取得し直してください。', [['field' => 'userIds', 'code' => 'MISMATCH']]);
                }

                foreach ($binary as $position => $id) {
                    $this->services->users->setDisplayOrder($id, $position + 1);
                }
                return $this->services->users->listByFamily($familyId);
            });
            return Response::json(200, ['users' => FamilyView::users($users)]);
        });
    }

    /** #14 ユーザの削除（確認が必要。利用データは削除しない。基本方針 10.7） */
    public function delete(Request $request, array $params): Response
    {
        return $this->authenticated($request, function (AuthContext $c) use ($params): Response {
            $this->requireElevation($c);
            $familyId = $c->familyId();
            Transaction::run($this->services->pdo, function () use ($familyId, $params): void {
                $this->services->families->lock($familyId);
                $target = $this->findUser($familyId, $params['userId'] ?? '');
                if ($target->isSuperuser) {
                    throw ApiException::conflict('SUPERUSER_CANNOT_BE_DELETED', 'スーパーユーザは削除できません。先に、他のユーザへ移してください。');
                }
                $users = $this->services->users->listByFamily($familyId);
                if (count($users) <= 1) {
                    throw ApiException::conflict('LAST_USER', '最後の1名は、削除できません。');
                }
                // このユーザを選択中の端末は、外部キー（ON DELETE SET NULL）により、未選択に戻る。
                $this->services->users->delete($target->id);
                // 後ろのユーザの表示順を、1つずつ詰める。
                $order = 1;
                foreach ($users as $user) {
                    if ($user->id === $target->id) {
                        continue;
                    }
                    if ($user->displayOrder !== $order) {
                        $this->services->users->setDisplayOrder($user->id, $order);
                    }
                    $order++;
                }
            });
            return Response::noContent();
        });
    }

    private function validName(string $raw, string $field): string
    {
        $name = Input::normalizeUserName($raw);
        $error = Input::userNameError($name);
        if ($error !== null) {
            throw ApiException::validationFailed('ユーザ名を確認してください。', [['field' => $field, 'code' => $error]]);
        }
        return $name;
    }

    /** 他の家族のユーザ・存在しないユーザは、区別せず 404（他の家族の ID の存在を推測させない）。 */
    private function findUser(string $familyId, string $userId): UserRecord
    {
        $user = Uuid7::isValid($userId) ? $this->services->users->findInFamily($familyId, Uuid7::toBinary($userId)) : null;
        if ($user === null) {
            throw ApiException::notFound('ユーザが見つかりません。');
        }
        return $user;
    }

    /** @param list<UserRecord> $users */
    private function assertNameAvailable(array $users, string $name, ?string $exceptUserId): void
    {
        foreach ($users as $user) {
            if ($user->name === $name && $user->id !== $exceptUserId) {
                throw ApiException::conflict('DUPLICATE_USER_NAME', '同じ名前のユーザがいます。別の名前にしてください。');
            }
        }
    }
}
