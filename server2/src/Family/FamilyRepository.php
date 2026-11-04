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
    private const COLUMNS = 'id, recovery_code_hash, recovery_code_key_id, superuser_password_hash, organization_id, organization_joined_at';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * 家族を作る。復旧コードのハッシュが、すでに使われている場合（ごくまれな偶然の衝突）は false を返す。
     */
    public function insert(string $id, string $recoveryCodeHash, int $keyId, DateTimeImmutable $now): bool
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO families (id, recovery_code_hash, recovery_code_key_id, recovery_code_issued_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        );
        $nowDb = Time::toDb($now);
        try {
            $stmt->execute([$id, $recoveryCodeHash, $keyId, $nowDb, $nowDb, $nowDb]);
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

    public function hasPasskeys(string $id): bool
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM passkeys WHERE family_id = ? LIMIT 1');
        $stmt->execute([$id]);
        return $stmt->fetchColumn() !== false;
    }

    /** @return array{name: string, joinedAt: string}|null 所属している組織。所属していなければ null */
    public function organizationOf(FamilyRecord $family): ?array
    {
        if ($family->organizationId === null) {
            return null;
        }
        $stmt = $this->pdo->prepare('SELECT name FROM organizations WHERE id = ?');
        $stmt->execute([$family->organizationId]);
        $name = $stmt->fetchColumn();
        if ($name === false || $family->organizationJoinedAt === null) {
            return null;
        }
        return ['name' => (string) $name, 'joinedAt' => Time::dbToIso($family->organizationJoinedAt)];
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): FamilyRecord
    {
        return new FamilyRecord(
            id: (string) $row['id'],
            recoveryCodeHash: (string) $row['recovery_code_hash'],
            recoveryCodeKeyId: (int) $row['recovery_code_key_id'],
            superuserPasswordSet: $row['superuser_password_hash'] !== null,
            organizationId: $row['organization_id'] === null ? null : (string) $row['organization_id'],
            organizationJoinedAt: $row['organization_joined_at'] === null ? null : (string) $row['organization_joined_at'],
        );
    }

    private function isDuplicateKey(PDOException $e): bool
    {
        return ($e->errorInfo[1] ?? null) === 1062;
    }
}
