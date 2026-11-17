<?php

declare(strict_types=1);

namespace UecTst\Family;

use DateTimeImmutable;
use PDO;
use PDOException;
use UecTst\Support\Time;

/** families テーブルの操作（TableSpec_Account.md 2.）。 */
final class FamilyRepository
{
    private const COLUMNS = 'id, recovery_code_hash, recovery_code_key_id, superuser_password_hash, belonging_id, belonging_joined_at, superuser_password_failed_count, superuser_password_locked_until';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * 家族を作る。復旧コードのハッシュが、すでに使われている場合（ごくまれな偶然の衝突）は false を返す。
     */
    public function insert(string $id, string $recoveryCodeHash, int $keyId, DateTimeImmutable $now, ?string $belongingId = null): bool
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO families (id, recovery_code_hash, recovery_code_key_id, recovery_code_issued_at, belonging_id, belonging_joined_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        );
        $nowDb = Time::toDb($now);
        try {
            // 招待経由の本登録では、招待した所属を、同時に設定する。
            $stmt->execute([$id, $recoveryCodeHash, $keyId, $nowDb, $belongingId, $belongingId === null ? null : $nowDb, $nowDb, $nowDb]);
        } catch (PDOException $e) {
            if ($this->isDuplicateKey($e)) {
                return false;
            }
            throw $e;
        }
        return true;
    }

    public function find(string $id): ?FamilyRecord
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM families WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row === false ? null : $this->hydrate($row);
    }

    /** 同時操作で、ユーザ数の上限などが破られないよう、家族の行をロックして読む（トランザクションの中で使う）。 */
    public function lock(string $id): ?FamilyRecord
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM families WHERE id = ? FOR UPDATE');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row === false ? null : $this->hydrate($row);
    }

    /**
     * 復旧コードのハッシュから、家族を探す（ログイン用）。有効なすべての鍵で作ったハッシュを渡し、
     * 鍵の識別子も一致する家族だけを返す。
     *
     * @param array<int, string> $hashesByKeyId 鍵の識別子 => ハッシュ
     */
    public function findByRecoveryHashes(array $hashesByKeyId): ?FamilyRecord
    {
        if ($hashesByKeyId === []) {
            return null;
        }
        $placeholders = implode(',', array_fill(0, count($hashesByKeyId), '?'));
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . " FROM families WHERE recovery_code_hash IN ({$placeholders})");
        $stmt->execute(array_values($hashesByKeyId));
        foreach ($stmt->fetchAll() as $row) {
            $family = $this->hydrate($row);
            if (isset($hashesByKeyId[$family->recoveryCodeKeyId]) && hash_equals($family->recoveryCodeHash, $hashesByKeyId[$family->recoveryCodeKeyId])) {
                return $family;
            }
        }
        return null;
    }

    /** 復旧コードを更新する（再発行）。旧コードは、上書きにより無効になる。 */
    public function updateRecoveryCode(string $id, string $hash, int $keyId, DateTimeImmutable $now): bool
    {
        $stmt = $this->pdo->prepare('UPDATE families SET recovery_code_hash = ?, recovery_code_key_id = ?, recovery_code_issued_at = ? WHERE id = ?');
        try {
            $stmt->execute([$hash, $keyId, Time::toDb($now), $id]);
        } catch (PDOException $e) {
            if ($this->isDuplicateKey($e)) {
                return false;
            }
            throw $e;
        }
        return true;
    }

    /** 家族を削除する。ユーザ・パスキー・セッションは、外部キーの ON DELETE CASCADE で削除される。 */
    public function delete(string $id): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM families WHERE id = ?');
        $stmt->execute([$id]);
    }

    /** パスワードを保存し、失敗回数とロックを初期値に戻す（設定・変更・再設定）。 */
    public function setPassword(string $id, string $hash): void
    {
        $stmt = $this->pdo->prepare('UPDATE families SET superuser_password_hash = ?, superuser_password_failed_count = 0, superuser_password_locked_until = NULL WHERE id = ?');
        $stmt->execute([$hash, $id]);
    }

    /** パスワードを未設定に戻す（3つのカラムを、NULL・0・NULL に）。 */
    public function clearPassword(string $id): void
    {
        $stmt = $this->pdo->prepare('UPDATE families SET superuser_password_hash = NULL, superuser_password_failed_count = 0, superuser_password_locked_until = NULL WHERE id = ?');
        $stmt->execute([$id]);
    }

    /** パスワードの失敗回数とロックの状態を更新する。 */
    public function setPasswordAttempts(string $id, int $failedCount, ?DateTimeImmutable $lockedUntil): void
    {
        $stmt = $this->pdo->prepare('UPDATE families SET superuser_password_failed_count = ?, superuser_password_locked_until = ? WHERE id = ?');
        $stmt->execute([$failedCount, $lockedUntil === null ? null : Time::toDb($lockedUntil), $id]);
    }

    /** 所属する（別の所属から移る場合も含む）。 */
    public function joinBelonging(string $id, string $belongingId, DateTimeImmutable $now): void
    {
        $stmt = $this->pdo->prepare('UPDATE families SET belonging_id = ?, belonging_joined_at = ? WHERE id = ?');
        $stmt->execute([$belongingId, Time::toDb($now), $id]);
    }

    /**
     * すべての家族（登録が新しい順）と、所属先・ユーザ（表示順）。運用担当者の家族の管理で使う。
     *
     * @return list<array{id: string, createdAt: DateTimeImmutable, belonging: ?array{id: string, name: string}, joinedAt: ?DateTimeImmutable, users: list<array{id: string, name: string}>}>
     */
    public function listAll(): array
    {
        $rows = $this->pdo->query(
            'SELECT f.id AS family_id, f.created_at AS created_at, f.belonging_joined_at AS joined_at, o.id AS belonging_id, o.name AS belonging_name, '
            . 'u.id AS user_id, u.name AS user_name '
            . 'FROM families f LEFT JOIN belongings o ON o.id = f.belonging_id LEFT JOIN users u ON u.family_id = f.id '
            . 'ORDER BY f.created_at DESC, f.id DESC, u.display_order ASC',
        )->fetchAll();
        $families = [];
        foreach ($rows as $row) {
            $familyId = (string) $row['family_id'];
            $families[$familyId] ??= [
                'id' => $familyId,
                'createdAt' => Time::fromDb((string) $row['created_at']),
                'belonging' => $row['belonging_id'] === null ? null : ['id' => (string) $row['belonging_id'], 'name' => (string) $row['belonging_name']],
                'joinedAt' => $row['joined_at'] === null ? null : Time::fromDb((string) $row['joined_at']),
                'users' => [],
            ];
            if ($row['user_id'] !== null) {
                $families[$familyId]['users'][] = ['id' => (string) $row['user_id'], 'name' => (string) $row['user_name']];
            }
        }
        return array_values($families);
    }

    /** 所属を解除する（個人ユーザに戻る）。 */
    public function leaveBelonging(string $id): void
    {
        $stmt = $this->pdo->prepare('UPDATE families SET belonging_id = NULL, belonging_joined_at = NULL WHERE id = ?');
        $stmt->execute([$id]);
    }

    public function hasPasskeys(string $id): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM passkeys WHERE family_id = ? LIMIT 1');
        $stmt->execute([$id]);
        return $stmt->fetchColumn() !== false;
    }

    /** @return array{name: string, joinedAt: string}|null 所属先。所属していなければ null */
    public function belongingOf(FamilyRecord $family): ?array
    {
        if ($family->belongingId === null) {
            return null;
        }
        $stmt = $this->pdo->prepare('SELECT name FROM belongings WHERE id = ?');
        $stmt->execute([$family->belongingId]);
        $name = $stmt->fetchColumn();
        if ($name === false || $family->belongingJoinedAt === null) {
            return null;
        }
        return ['name' => (string) $name, 'joinedAt' => Time::dbToIso($family->belongingJoinedAt)];
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): FamilyRecord
    {
        return new FamilyRecord(
            id: (string) $row['id'],
            recoveryCodeHash: (string) $row['recovery_code_hash'],
            recoveryCodeKeyId: (int) $row['recovery_code_key_id'],
            superuserPasswordSet: $row['superuser_password_hash'] !== null,
            belongingId: $row['belonging_id'] === null ? null : (string) $row['belonging_id'],
            belongingJoinedAt: $row['belonging_joined_at'] === null ? null : (string) $row['belonging_joined_at'],
            superuserPasswordHash: $row['superuser_password_hash'] === null ? null : (string) $row['superuser_password_hash'],
            passwordFailedCount: (int) $row['superuser_password_failed_count'],
            passwordLockedUntil: $row['superuser_password_locked_until'] === null ? null : Time::fromDb((string) $row['superuser_password_locked_until']),
        );
    }

    private function isDuplicateKey(PDOException $e): bool
    {
        return ($e->errorInfo[1] ?? null) === 1062;
    }
}
