<?php

declare(strict_types=1);

namespace UecTst\Belonging;

use DateTimeImmutable;
use PDO;
use UecTst\Db\Uuid7;
use UecTst\Security\Tokens;
use UecTst\Support\Clock;
use UecTst\Support\Time;

/**
 * 所属のセッションの作成・検索・更新・削除（TableSpec_Belonging.md 4.）。
 * Cookie の値は認証トークン本体で、DB には SHA-256 のハッシュだけを保存する。
 */
final class BlgSessionService
{
    /** 段階0（パスキーの確認が未了）は、作成から10分。 */
    public const STAGE0_LIFETIME = '+10 minutes';
    /** 段階1は、最終利用から8時間（スライディング）。 */
    public const IDLE_LIFETIME = '+8 hours';
    /** ただし、作成から24時間を超えない。 */
    public const MAX_LIFETIME = '+24 hours';
    /** 前回の更新から、この時間以上たったアクセスで、延長する。 */
    public const SLIDE_AFTER = '+5 minutes';
    /** 破壊的な操作を実行できる時間。 */
    public const ELEVATION = '+5 minutes';

    private const COLUMNS = 'id, belonging_id, auth_stage, created_at, last_used_at, expires_at, elevated_until';

    public function __construct(private readonly PDO $pdo, private readonly Clock $clock)
    {
    }

    /**
     * 新しいセッションを作る。
     *
     * @param int $authStage 0: パスキーの確認が未了（運用担当者の所属）、1: ログイン完了
     * @return array{0: string, 1: BlgSession} [認証トークン本体（Cookie に入れる）, セッション]
     */
    public function create(string $belongingId, int $authStage): array
    {
        $now = $this->clock->now();
        $token = Tokens::generate();
        $id = Uuid7::generateBinary();
        $expires = $authStage === 0 ? $now->modify(self::STAGE0_LIFETIME) : $this->stage1Expiry($now, $now);

        $nowDb = Time::toDb($now);
        $stmt = $this->pdo->prepare(
            'INSERT INTO belonging_sessions (id, belonging_id, token_hash, auth_stage, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        );
        $stmt->execute([$id, $belongingId, Tokens::hash($token), $authStage, $nowDb, $nowDb, Time::toDb($expires)]);

        return [$token, new BlgSession($id, $belongingId, $authStage, $now, $now, $expires, null)];
    }

    /** トークンから、有効なセッションを探す（期限切れ・存在しなければ null）。 */
    public function findByToken(string $token): ?BlgSession
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM belonging_sessions WHERE token_hash = ?');
        $stmt->execute([Tokens::hash($token)]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }
        $session = $this->hydrate($row);
        return $session->expiresAt > $this->clock->now() ? $session : null;
    }

    public function find(string $id): ?BlgSession
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM belonging_sessions WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row === false ? null : $this->hydrate($row);
    }

    /** ログイン完了後のセッションで、前回の更新から5分以上たっていれば、有効期限を延長する。延長したか。 */
    public function slideIfDue(BlgSession $session): bool
    {
        if (!$session->isLoginComplete()) {
            return false;
        }
        $now = $this->clock->now();
        if ($session->lastUsedAt->modify(self::SLIDE_AFTER) > $now) {
            return false;
        }
        $stmt = $this->pdo->prepare('UPDATE belonging_sessions SET last_used_at = ?, expires_at = ? WHERE id = ?');
        $stmt->execute([Time::toDb($now), Time::toDb($this->stage1Expiry($now, $session->createdAt)), $session->id]);
        return true;
    }

    /** パスキーの確認（または最初の登録）に成功して、ログインを完了する（段階0 → 1）。 */
    public function completeLogin(BlgSession $session): void
    {
        $now = $this->clock->now();
        $stmt = $this->pdo->prepare('UPDATE belonging_sessions SET auth_stage = 1, last_used_at = ?, expires_at = ? WHERE id = ?');
        $stmt->execute([Time::toDb($now), Time::toDb($this->stage1Expiry($now, $session->createdAt)), $session->id]);
    }

    /** 破壊的な操作の確認が済んだ状態にする（確認から5分間）。 */
    public function elevate(string $sessionId): DateTimeImmutable
    {
        $until = $this->clock->now()->modify(self::ELEVATION);
        $stmt = $this->pdo->prepare('UPDATE belonging_sessions SET elevated_until = ? WHERE id = ?');
        $stmt->execute([Time::toDb($until), $sessionId]);
        return $until;
    }

    public function delete(string $sessionId): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM belonging_sessions WHERE id = ?');
        $stmt->execute([$sessionId]);
    }

    /** 指定したセッション以外の、所属のすべてのセッションを削除する。 */
    public function deleteOthers(string $belongingId, string $exceptSessionId): int
    {
        $stmt = $this->pdo->prepare('DELETE FROM belonging_sessions WHERE belonging_id = ? AND id <> ?');
        $stmt->execute([$belongingId, $exceptSessionId]);
        return $stmt->rowCount();
    }

    /** 所属のすべてのセッションを削除する（パスワードの再発行）。 */
    public function deleteAll(string $belongingId): int
    {
        $stmt = $this->pdo->prepare('DELETE FROM belonging_sessions WHERE belonging_id = ?');
        $stmt->execute([$belongingId]);
        return $stmt->rowCount();
    }

    /** 最終利用から8時間。ただし、作成から24時間を超えない。 */
    private function stage1Expiry(DateTimeImmutable $lastUsed, DateTimeImmutable $createdAt): DateTimeImmutable
    {
        return min($lastUsed->modify(self::IDLE_LIFETIME), $createdAt->modify(self::MAX_LIFETIME));
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): BlgSession
    {
        return new BlgSession(
            id: (string) $row['id'],
            belongingId: (string) $row['belonging_id'],
            authStage: (int) $row['auth_stage'],
            createdAt: Time::fromDb((string) $row['created_at']),
            lastUsedAt: Time::fromDb((string) $row['last_used_at']),
            expiresAt: Time::fromDb((string) $row['expires_at']),
            elevatedUntil: $row['elevated_until'] === null ? null : Time::fromDb((string) $row['elevated_until']),
        );
    }
}
