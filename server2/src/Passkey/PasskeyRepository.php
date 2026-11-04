<?php

declare(strict_types=1);

namespace UecTst\Passkey;

use DateTimeImmutable;
use PDO;
use PDOException;
use UecTst\Support\Time;

/** passkeys テーブルの操作（TableSpec_Account.md 4.）。 */
final class PasskeyRepository
{
    public const MAX_PER_FAMILY = 10;

    private const COLUMNS = 'id, family_id, credential_id, public_key, sign_count, transports, backup_eligible, name, created_at, last_used_at';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** 登録日時の新しい順。 */
    public function listByFamily(string $familyId): array
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM passkeys WHERE family_id = ? ORDER BY created_at DESC, id DESC');
        $stmt->execute([$familyId]);
        return array_map($this->hydrate(...), $stmt->fetchAll());
    }

    public function countByFamily(string $familyId): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM passkeys WHERE family_id = ?');
        $stmt->execute([$familyId]);
        return (int) $stmt->fetchColumn();
    }

    /** その家族のパスキーを、クレデンシャル ID から探す（他の家族のものは null）。 */
    public function findByCredentialId(string $familyId, string $credentialId): ?PasskeyRecord
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM passkeys WHERE credential_id = ? AND family_id = ?');
        $stmt->execute([$credentialId, $familyId]);
        $row = $stmt->fetch();
        return $row === false ? null : $this->hydrate($row);
    }

    public function findInFamily(string $familyId, string $passkeyId): ?PasskeyRecord
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM passkeys WHERE id = ? AND family_id = ?');
        $stmt->execute([$passkeyId, $familyId]);
        $row = $stmt->fetch();
        return $row === false ? null : $this->hydrate($row);
    }

    /** 同じクレデンシャル ID がすでに登録されていた場合は false。 */
    public function insert(PasskeyRecord $passkey): bool
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO passkeys (id, family_id, credential_id, public_key, sign_count, transports, backup_eligible, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        try {
            $stmt->execute([
                $passkey->id, $passkey->familyId, $passkey->credentialId, $passkey->publicKey, $passkey->signCount,
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
        $stmt = $this->pdo->prepare('UPDATE passkeys SET sign_count = ?, last_used_at = ? WHERE id = ?');
        $stmt->execute([$signCount, Time::toDb($now), $passkeyId]);
    }

    public function delete(string $passkeyId): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM passkeys WHERE id = ?');
        $stmt->execute([$passkeyId]);
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): PasskeyRecord
    {
        $transports = $row['transports'] === null || $row['transports'] === '' ? [] : explode(',', (string) $row['transports']);
        return new PasskeyRecord(
            id: (string) $row['id'],
            familyId: (string) $row['family_id'],
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
