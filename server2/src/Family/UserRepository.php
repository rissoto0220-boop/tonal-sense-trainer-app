<?php

declare(strict_types=1);

namespace UecTst\Family;

use DateTimeImmutable;
use PDO;
use UecTst\Support\Time;

/** users テーブルの操作（TableSpec_Account.md 3.）。ユーザ数の上限などの確認は、家族の行をロックした上で、呼び出し側が行う。 */
final class UserRepository
{
    private const COLUMNS = 'id, family_id, name, slot, display_order, is_superuser';

    public function __construct(private readonly PDO $pdo)
    {
    }

    public function insert(string $id, string $familyId, string $name, int $slot, int $displayOrder, bool $isSuperuser, DateTimeImmutable $now): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO users (id, family_id, name, slot, display_order, is_superuser, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        );
        $nowDb = Time::toDb($now);
        $stmt->execute([$id, $familyId, $name, $slot, $displayOrder, $isSuperuser ? 1 : 0, $nowDb, $nowDb]);
    }

    /** 家族のユーザを、表示順に返す。 */
    public function listByFamily(string $familyId): array
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM users WHERE family_id = ? ORDER BY display_order ASC, slot ASC');
        $stmt->execute([$familyId]);
        return array_map($this->hydrate(...), $stmt->fetchAll());
    }

    /** 指定したユーザが、その家族に属していれば返す（他の家族のユーザ・存在しないユーザは null）。 */
    public function findInFamily(string $familyId, string $userId): ?UserRecord
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM users WHERE id = ? AND family_id = ?');
        $stmt->execute([$userId, $familyId]);
        $row = $stmt->fetch();
        return $row === false ? null : $this->hydrate($row);
    }

    public function rename(string $userId, string $name, DateTimeImmutable $now): void
    {
        $stmt = $this->pdo->prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?');
        $stmt->execute([$name, Time::toDb($now), $userId]);
    }

    public function setDisplayOrder(string $userId, int $displayOrder): void
    {
        $stmt = $this->pdo->prepare('UPDATE users SET display_order = ? WHERE id = ?');
        $stmt->execute([$displayOrder, $userId]);
    }

    public function setSuperuser(string $userId, bool $isSuperuser): void
    {
        $stmt = $this->pdo->prepare('UPDATE users SET is_superuser = ? WHERE id = ?');
        $stmt->execute([$isSuperuser ? 1 : 0, $userId]);
    }

    public function delete(string $userId): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM users WHERE id = ?');
        $stmt->execute([$userId]);
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): UserRecord
    {
        return new UserRecord(
            id: (string) $row['id'],
            familyId: (string) $row['family_id'],
            name: (string) $row['name'],
            slot: (int) $row['slot'],
            displayOrder: (int) $row['display_order'],
            isSuperuser: (int) $row['is_superuser'] === 1,
        );
    }
}
