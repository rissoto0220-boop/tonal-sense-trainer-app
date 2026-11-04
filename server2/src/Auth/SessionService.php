<?php

declare(strict_types=1);

namespace UecTst\Auth;

use DateTimeImmutable;
use PDO;
use UecTst\Db\Uuid7;
use UecTst\Security\Tokens;
use UecTst\Support\Clock;
use UecTst\Support\Time;

/**
 * セッションの作成・検索・更新・削除（TableSpec_Auth.md 2.）。
 * Cookie の値は認証トークン本体で、DB には SHA-256 のハッシュだけを保存する。
 */
final class SessionService
{
    /** 有効期限は、最終利用から365日（スライディング）。 */
    public const LIFETIME = '+365 days';
    /** 前回の更新から、この時間以上たったアクセスで、有効期限を延長する（書き込みを減らすため）。 */
    public const SLIDE_AFTER = '+1 hour';
    /** 家族向けの重要な操作を実行できる時間。 */
    public const ELEVATION = '+5 minutes';

    private const COLUMNS = 'id, family_id, selected_user_id, device_label, created_at, last_used_at, expires_at, elevated_until';

    public function __construct(private readonly PDO $pdo, private readonly Clock $clock)
    {
    }

    /**
     * 新しいセッションを作る。
     *
     * @return array{0: string, 1: Session} [認証トークン本体（Cookie に入れる）, セッション]
     */
    public function create(string $familyId, ?string $selectedUserId, string $deviceLabel): array
    {
        $now = $this->clock->now();
        $token = Tokens::generate();
        $id = Uuid7::generateBinary();
        $expires = $now->modify(self::LIFETIME);

        $stmt = $this->pdo->prepare(
            'INSERT INTO sessions (id, family_id, token_hash, selected_user_id, device_label, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        );
        $nowDb = Time::toDb($now);
        $stmt->execute([$id, $familyId, Tokens::hash($token), $selectedUserId, mb_substr($deviceLabel, 0, 50), $nowDb, $nowDb, Time::toDb($expires)]);

        return [$token, new Session($id, $familyId, $selectedUserId, mb_substr($deviceLabel, 0, 50), $now, $now, $expires, null)];
    }

    /** トークンから、有効なセッションを探す（期限切れ・存在しなければ null）。 */
    public function findByToken(string $token): ?Session
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM sessions WHERE token_hash = ?');
        $stmt->execute([Tokens::hash($token)]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }
        $session = $this->hydrate($row);
        return $session->expiresAt > $this->clock->now() ? $session : null;
    }

    /** 前回の更新から1時間以上たっていれば、最終利用日時と有効期限を更新する。更新したか（Cookie も再設定が必要か）を返す。 */
    public function slideIfDue(Session $session): bool
    {
        $now = $this->clock->now();
        if ($session->lastUsedAt->modify(self::SLIDE_AFTER) > $now) {
            return false;
        }
        $stmt = $this->pdo->prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?');
        $stmt->execute([Time::toDb($now), Time::toDb($now->modify(self::LIFETIME)), $session->id]);
        return true;
    }

    public function find(string $id): ?Session
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM sessions WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row === false ? null : $this->hydrate($row);
    }

    /** 家族の、有効なセッションを、最終利用日時の新しい順に返す。 */
    public function listForFamily(string $familyId): array
    {
        $stmt = $this->pdo->prepare('SELECT ' . self::COLUMNS . ' FROM sessions WHERE family_id = ? AND expires_at > ? ORDER BY last_used_at DESC, id DESC');
        $stmt->execute([$familyId, Time::toDb($this->clock->now())]);
        return array_map($this->hydrate(...), $stmt->fetchAll());
    }

    public function findInFamily(string $familyId, string $sessionId): ?Session
    {
        $session = $this->find($sessionId);
        return ($session !== null && $session->familyId === $familyId) ? $session : null;
    }

    public function setSelectedUser(string $sessionId, ?string $userId): void
    {
        $stmt = $this->pdo->prepare('UPDATE sessions SET selected_user_id = ? WHERE id = ?');
        $stmt->execute([$userId, $sessionId]);
    }

    /** 重要な操作の確認が済んだ状態にする（確認から5分間）。 */
    public function elevate(string $sessionId): DateTimeImmutable
    {
        $until = $this->clock->now()->modify(self::ELEVATION);
        $stmt = $this->pdo->prepare('UPDATE sessions SET elevated_until = ? WHERE id = ?');
        $stmt->execute([Time::toDb($until), $sessionId]);
        return $until;
    }

    public function delete(string $sessionId): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM sessions WHERE id = ?');
        $stmt->execute([$sessionId]);
    }

    /** 指定したセッション以外の、家族のすべてのセッションを削除する。削除した数を返す。 */
    public function deleteOthers(string $familyId, string $exceptSessionId): int
    {
        $stmt = $this->pdo->prepare('DELETE FROM sessions WHERE family_id = ? AND id <> ?');
        $stmt->execute([$familyId, $exceptSessionId]);
        return $stmt->rowCount();
    }

    /** @param array<string, mixed> $row */
    private function hydrate(array $row): Session
    {
        return new Session(
            id: (string) $row['id'],
            familyId: (string) $row['family_id'],
            selectedUserId: $row['selected_user_id'] === null ? null : (string) $row['selected_user_id'],
            deviceLabel: (string) $row['device_label'],
            createdAt: Time::fromDb((string) $row['created_at']),
            lastUsedAt: Time::fromDb((string) $row['last_used_at']),
            expiresAt: Time::fromDb((string) $row['expires_at']),
            elevatedUntil: $row['elevated_until'] === null ? null : Time::fromDb((string) $row['elevated_until']),
        );
    }
}
