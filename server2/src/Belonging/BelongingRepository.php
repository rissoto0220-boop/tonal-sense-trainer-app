<?php

declare(strict_types=1);

namespace UecTst\Belonging;

use DateTimeImmutable;
use PDO;
use PDOException;
use UecTst\Support\Time;

/** belongings テーブルと、所属している家族の操作（TableSpec_Belonging.md 2.・6.）。 */
final class BelongingRepository
{
    private const COLUMNS = 'id, name, name_kana, login_id, password_hash, password_change_required, password_failed_count, password_locked_until, is_super, created_at';

    public function __construct(private readonly PDO $pdo)
    {
    }

    public function find(string $id): ?BelongingRecord
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM belongings WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row === false ? null : $this->hydrate($row);
    }

    /** 同時の入力でも失敗回数を正しく数えるため、行をロックして読む（トランザクションの中で使う）。 */
    public function lock(string $id): ?BelongingRecord
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM belongings WHERE id = ? FOR UPDATE');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row === false ? null : $this->hydrate($row);
    }

    /** @param string $loginId 小文字に正規化済みのログインID */
    public function findByLoginId(string $loginId): ?BelongingRecord
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM belongings WHERE login_id = ?');
        $stmt->execute([$loginId]);
        $row = $stmt->fetch();
        return $row === false ? null : $this->hydrate($row);
    }

    public function nameOf(string $id): ?string
    {
        $stmt = $this->pdo->prepare('SELECT name FROM belongings WHERE id = ?');
        $stmt->execute([$id]);
        $name = $stmt->fetchColumn();
        return $name === false ? null : (string) $name;
    }

    /**
     * 通常の所属を作る（パスワードの変更が必要な状態で）。
     *
     * @return string|null 成功なら null。重複していれば、重複した項目（login_id または name）
     */
    public function insert(string $id, string $name, ?string $nameKana, string $loginId, string $passwordHash, DateTimeImmutable $now): ?string
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO belongings (id, name, name_kana, login_id, password_hash, password_change_required, is_super, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)',
        );
        $nowDb = Time::toDb($now);
        try {
            $stmt->execute([$id, $name, $nameKana, $loginId, $passwordHash, $nowDb, $nowDb]);
        } catch (PDOException $e) {
            return $this->duplicateField($e);
        }
        return null;
    }

    /** @return string|null 成功なら null。所属名が重複していれば 'name' */
    public function rename(string $id, string $name, ?string $nameKana): ?string
    {
        $stmt = $this->pdo->prepare('UPDATE belongings SET name = ?, name_kana = ? WHERE id = ?');
        try {
            $stmt->execute([$name, $nameKana, $id]);
        } catch (PDOException $e) {
            return $this->duplicateField($e);
        }
        return null;
    }

    /** 所属名が、ほかの所属で使われているか。 */
    public function nameTakenByOther(string $name, string $exceptId): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM belongings WHERE name = ? AND id <> ? LIMIT 1');
        $stmt->execute([$name, $exceptId]);
        return $stmt->fetchColumn() !== false;
    }

    public function loginIdTaken(string $loginId): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM belongings WHERE login_id = ? LIMIT 1');
        $stmt->execute([$loginId]);
        return $stmt->fetchColumn() !== false;
    }

    public function nameTaken(string $name): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM belongings WHERE name = ? LIMIT 1');
        $stmt->execute([$name]);
        return $stmt->fetchColumn() !== false;
    }

    /** パスワードを保存し、失敗回数とロックを初期値に戻す。 */
    public function setPassword(string $id, string $hash, bool $changeRequired): void
    {
        $stmt = $this->pdo->prepare(
            'UPDATE belongings SET password_hash = ?, password_change_required = ?, password_failed_count = 0, password_locked_until = NULL WHERE id = ?',
        );
        $stmt->execute([$hash, $changeRequired ? 1 : 0, $id]);
    }

    public function setPasswordAttempts(string $id, int $failedCount, ?DateTimeImmutable $lockedUntil): void
    {
        $stmt = $this->pdo->prepare('UPDATE belongings SET password_failed_count = ?, password_locked_until = ? WHERE id = ?');
        $stmt->execute([$failedCount, $lockedUntil === null ? null : Time::toDb($lockedUntil), $id]);
    }

    /**
     * 所属の一覧（作成日時の新しい順）と、現在所属している家族の数。
     *
     * @return list<array{belonging: BelongingRecord, memberFamilyCount: int}>
     */
    public function listWithMemberCounts(): array
    {
        $stmt = $this->pdo->query(
            'SELECT o.id, o.name, o.name_kana, o.login_id, o.password_hash, o.password_change_required, o.password_failed_count, o.password_locked_until, o.is_super, o.created_at, '
            . '(SELECT COUNT(*) FROM families f WHERE f.belonging_id = o.id) AS member_count '
            . 'FROM belongings o ORDER BY o.created_at DESC, o.id DESC',
        );
        $result = [];
        foreach ($stmt->fetchAll() as $row) {
            $result[] = ['belonging' => $this->hydrate($row), 'memberFamilyCount' => (int) $row['member_count']];
        }
        return $result;
    }

    public function countMembers(string $id): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM families WHERE belonging_id = ?');
        $stmt->execute([$id]);
        return (int) $stmt->fetchColumn();
    }

    /**
     * 所属している家族（所属日時の新しい順）と、そのユーザ（表示順）。所属が参照できるのは、ID・所属日時・ユーザの ID と名前だけ。
     *
     * @return list<array{id: string, joinedAt: DateTimeImmutable, users: list<array{id: string, name: string}>}>
     */
    public function members(string $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT f.id AS family_id, f.belonging_joined_at AS joined_at, u.id AS user_id, u.name AS user_name '
            . 'FROM families f LEFT JOIN users u ON u.family_id = f.id '
            . 'WHERE f.belonging_id = ? ORDER BY f.belonging_joined_at DESC, f.id DESC, u.display_order ASC',
        );
        $stmt->execute([$id]);
        $families = [];
        foreach ($stmt->fetchAll() as $row) {
            $familyId = (string) $row['family_id'];
            $families[$familyId] ??= [
                'id' => $familyId,
                'joinedAt' => Time::fromDb((string) $row['joined_at']),
                'users' => [],
            ];
            if ($row['user_id'] !== null) {
                $families[$familyId]['users'][] = ['id' => (string) $row['user_id'], 'name' => (string) $row['user_name']];
            }
        }
        return array_values($families);
    }

    /** 自所属に属している家族を外す。外せたか（他の所属の家族・存在しない家族は false）。 */
    public function removeMember(string $belongingId, string $familyId): bool
    {
        $stmt = $this->pdo->prepare('UPDATE families SET belonging_id = NULL, belonging_joined_at = NULL WHERE id = ? AND belonging_id = ?');
        $stmt->execute([$familyId, $belongingId]);
        return $stmt->rowCount() === 1;
    }

    /**
     * 所属していた家族を、すべて個人ユーザに戻す。外部キーの ON DELETE SET NULL は belonging_joined_at を NULL にしないため、
     * 所属の削除の前に、これを実行する（TableSpec_Belonging.md 2.3）。
     */
    public function releaseMembers(string $belongingId): int
    {
        $stmt = $this->pdo->prepare('UPDATE families SET belonging_id = NULL, belonging_joined_at = NULL WHERE belonging_id = ?');
        $stmt->execute([$belongingId]);
        return $stmt->rowCount();
    }

    /** 所属を削除する。パスキー・セッション・招待は、ON DELETE CASCADE で削除される。 */
    public function delete(string $id): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM belongings WHERE id = ?');
        $stmt->execute([$id]);
    }

    private function duplicateField(PDOException $e): string
    {
        if (($e->errorInfo[1] ?? null) !== 1062) {
            throw $e;
        }
        return str_contains((string) ($e->errorInfo[2] ?? ''), 'uq_belongings_login_id') ? 'login_id' : 'name';
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): BelongingRecord
    {
        return new BelongingRecord(
            id: (string) $row['id'],
            name: (string) $row['name'],
            nameKana: $row['name_kana'] === null ? null : (string) $row['name_kana'],
            loginId: (string) $row['login_id'],
            passwordHash: (string) $row['password_hash'],
            passwordChangeRequired: (int) $row['password_change_required'] === 1,
            passwordFailedCount: (int) $row['password_failed_count'],
            passwordLockedUntil: $row['password_locked_until'] === null ? null : Time::fromDb((string) $row['password_locked_until']),
            isSuper: (int) $row['is_super'] === 1,
            createdAt: Time::fromDb((string) $row['created_at']),
        );
    }
}
