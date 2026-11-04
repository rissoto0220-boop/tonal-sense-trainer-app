<?php

declare(strict_types=1);

namespace UecTst\Passkey;

use PDO;
use UecTst\Db\Uuid7;
use UecTst\Support\Clock;
use UecTst\Support\Time;

/**
 * WebAuthn の challenge（使い捨ての乱数）。セッションと用途ごとに、同時に1つだけ有効にする（TableSpec_Auth.md 4.2）。
 */
final class ChallengeStore
{
    public const FAMILY_ELEVATION = 'family_elevation';
    public const FAMILY_REGISTRATION = 'family_registration';
    public const LIFETIME = '+5 minutes';

    public function __construct(private readonly PDO $pdo, private readonly Clock $clock)
    {
    }

    /** 新しい challenge（32バイト）を発行する。同じセッション・用途の前の challenge は、上書きされる。 */
    public function issue(string $ownerId, string $purpose): string
    {
        $challenge = random_bytes(32);
        $now = $this->clock->now();
        $stmt = $this->pdo->prepare(
            'INSERT INTO webauthn_challenges (id, owner_id, purpose, challenge, expires_at) VALUES (?, ?, ?, ?, ?) AS new '
            . 'ON DUPLICATE KEY UPDATE id = new.id, challenge = new.challenge, expires_at = new.expires_at',
        );
        $stmt->execute([Uuid7::generateBinary(), $ownerId, $purpose, $challenge, Time::toDb($now->modify(self::LIFETIME))]);
        return $challenge;
    }

    /**
     * challenge を取り出して削除する（使い捨て）。なければ、期限切れなら null。
     * 検証に失敗しても、再利用はできない。
     */
    public function take(string $ownerId, string $purpose): ?string
    {
        $stmt = $this->pdo->prepare('SELECT challenge, expires_at FROM webauthn_challenges WHERE owner_id = ? AND purpose = ? FOR UPDATE');
        $stmt->execute([$ownerId, $purpose]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }
        $delete = $this->pdo->prepare('DELETE FROM webauthn_challenges WHERE owner_id = ? AND purpose = ?');
        $delete->execute([$ownerId, $purpose]);
        if (Time::fromDb((string) $row['expires_at']) <= $this->clock->now()) {
            return null;
        }
        return (string) $row['challenge'];
    }
}
