<?php

declare(strict_types=1);

namespace UecTst\Passkey;

use DateTimeImmutable;
use PDO;
use PDOException;
use UecTst\Support\Time;

/**
 * パスキーのテーブルの操作。家族のパスキー（passkeys。TableSpec_Account.md 4.）と、運用担当者の所属のパスキー
 * （belonging_passkeys。TableSpec_Belonging.md 3.）で、同じ処理を使う。持ち主は、家族または所属の ID。
 */
final class PasskeyRepository
{
    public const MAX_PER_OWNER = 10;

    private const COLUMNS = 'id, owner_id, credential_id, public_key, sign_count, transports, backup_eligible, name, created_at, last_used_at';

    public function __construct(
        private readonly PDO $pdo,
        private readonly string $table = 'passkeys',
        private readonly string $ownerColumn = 'family_id',
    ) {
    }

    /** 登録日時の新しい順。 */
    public function listByOwner(string $ownerId): array
    {
        $stmt = $this->pdo->prepare('SELECT ' . $this->columns() . ' FROM ' . $this->table . ' WHERE ' . $this->ownerColumn . ' = ? ORDER BY created_at DESC, id DESC');
        $stmt->execute([$ownerId]);
        return array_map($this->hydrate(...), $stmt->fetchAll());
    }

    public function countByOwner(string $ownerId): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM ' . $this->table . ' WHERE ' . $this->ownerColumn . ' = ?');
        $stmt->execute([$ownerId]);
        return (int) $stmt->fetchColumn();
    }

    /** その持ち主のパスキーを、クレデンシャル ID から探す（他の持ち主のものは null）。 */
    public function findByCredentialId(string $ownerId, string $credentialId): ?PasskeyRecord
    {
        $stmt = $this->pdo->prepare('SELECT ' . $this->columns() . ' FROM ' . $this->table . ' WHERE credential_id = ? AND ' . $this->ownerColumn . ' = ?');
        $stmt->execute([$credentialId, $ownerId]);
        $row = $stmt->fetch();
        return $row === false ? null : $this->hydrate($row);
    }

    public function findInOwner(string $ownerId, string $passkeyId): ?PasskeyRecord
    {
        $stmt = $this->pdo->prepare('SELECT ' . $this->columns() . ' FROM ' . $this->table . ' WHERE id = ? AND ' . $this->ownerColumn . ' = ?');
        $stmt->execute([$passkeyId, $ownerId]);
        $row = $stmt->fetch();
        return $row === false ? null : $this->hydrate($row);
    }

    /** 同じクレデンシャル ID がすでに登録されていた場合は false。 */
    public function insert(PasskeyRecord $passkey): bool
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO ' . $this->table . ' (id, ' . $this->ownerColumn . ', credential_id, public_key, sign_count, transports, backup_eligible, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        try {
            $stmt->execute([
                $passkey->id, $passkey->ownerId, $passkey->credentialId, $passkey->publicKey, $passkey->signCount,
                $passkey->transports === [] ? null : implode(',', $passkey->transports),
                $passkey->backupEligible ? 1 : 0, $passkey->name, Time::toDb($passkey->createdAt),
            ]);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? null) === 1062) {
                return false;
            }
            throw $e;
        }
        return true;
    }

    public function recordUse(string $passkeyId, int $signCount, DateTimeImmutable $now): void
    {
        $stmt = $this->pdo->prepare('UPDATE ' . $this->table . ' SET sign_count = ?, last_used_at = ? WHERE id = ?');
        $stmt->execute([$signCount, Time::toDb($now), $passkeyId]);
    }

    public function delete(string $passkeyId): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM ' . $this->table . ' WHERE id = ?');
        $stmt->execute([$passkeyId]);
    }

    /** 持ち主の列の名前を、共通の owner_id にそろえて読む。 */
    private function columns(): string
    {
        return str_replace('owner_id', $this->ownerColumn . ' AS owner_id', self::COLUMNS);
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): PasskeyRecord
    {
        $transports = $row['transports'] === null || $row['transports'] === '' ? [] : explode(',', (string) $row['transports']);
        return new PasskeyRecord(
            id: (string) $row['id'],
            ownerId: (string) $row['owner_id'],
            credentialId: (string) $row['credential_id'],
            publicKey: (string) $row['public_key'],
            signCount: (int) $row['sign_count'],
            transports: $transports,
            backupEligible: (int) $row['backup_eligible'] === 1,
            name: (string) $row['name'],
            createdAt: Time::fromDb((string) $row['created_at']),
            lastUsedAt: $row['last_used_at'] === null ? null : Time::fromDb((string) $row['last_used_at']),
        );
    }
}
