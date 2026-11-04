<?php

declare(strict_types=1);

namespace UecTst\Family;

use UecTst\Db\Uuid7;

/** API が返す、家族・ユーザの形（ApiSpec_Auth.md 0.8）。 */
final class FamilyView
{
    public function __construct(
        private readonly FamilyRepository $families,
        private readonly UserRepository $users,
    ) {
    }

    /**
     * @return array{id: string, name: string, displayOrder: int, isSuperuser: bool}
     */
    public static function user(UserRecord $user): array
    {
        return [
            'id' => Uuid7::toString($user->id),
            'name' => $user->name,
            'displayOrder' => $user->displayOrder,
            'isSuperuser' => $user->isSuperuser,
        ];
    }

    /**
     * @param list<UserRecord> $users
     * @return list<array{id: string, name: string, displayOrder: int, isSuperuser: bool}>
     */
    public static function users(array $users): array
    {
        return array_map(self::user(...), $users);
    }

    /**
     * ログイン中の端末から見た、家族の情報（Family）。
     *
     * @return array<string, mixed>
     */
    public function family(FamilyRecord $family, ?string $selectedUserId): array
    {
        $users = $this->users->listByFamily($family->id);
        $selected = null;
        foreach ($users as $user) {
            if ($user->id === $selectedUserId) {
                $selected = Uuid7::toString($user->id);
            }
        }

        return [
            'users' => self::users($users),
            'selectedUserId' => $selected,
            'superuserPasswordSet' => $family->superuserPasswordSet,
            'superuserPasskeyRegistered' => $this->families->hasPasskeys($family->id),
            'organization' => $this->families->organizationOf($family),
        ];
    }
}
