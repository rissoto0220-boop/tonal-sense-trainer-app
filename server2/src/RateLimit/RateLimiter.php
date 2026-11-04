<?php

declare(strict_types=1);

namespace UecTst\RateLimit;

use PDO;
use UecTst\Support\Clock;
use UecTst\Support\Time;

/**
 * 回数制限のカウンター（TableSpec_Auth.md 4.1）。固定窓の方式で、窓は最初の1件から始まる。
 * キー（IP アドレス・家族 ID など）は、HMAC-SHA256 でハッシュ化して保存し、元の値は保存しない（基本方針 4.4）。
 */
final class RateLimiter
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly Clock $clock,
        private readonly string $hmacKey,
    ) {
    }

    /** カウンターを1つ増やし、増やした後の状態を返す。窓が切れていれば、1から数え直す。 */
    public function hit(string $name, int $windowSeconds): RateLimitHit
    {
        $now = $this->clock->now();
        $nowDb = Time::toDb($now);
        $newExpires = Time::toDb($now->modify("+{$windowSeconds} seconds"));
        $key = $this->keyHash($name);

        // 同時に実行されても、回数を正しく数えられる 1 文。更新式の既存の行の列は、別名との曖昧さを避けるため、テーブル名で修飾する。
        // ON DUPLICATE KEY UPDATE の代入は左から評価される。hit_count を expires_at より先に書くこと。
        $stmt = $this->pdo->prepare(
            'INSERT INTO rate_limit_counters (key_hash, hit_count, expires_at) VALUES (?, 1, ?) AS new '
            . 'ON DUPLICATE KEY UPDATE '
            . 'hit_count = IF(rate_limit_counters.expires_at <= ?, 1, rate_limit_counters.hit_count + 1), '
            . 'expires_at = IF(rate_limit_counters.expires_at <= ?, new.expires_at, rate_limit_counters.expires_at)',
        );
        $stmt->execute([$key, $newExpires, $nowDb, $nowDb]);

        return $this->read($key, $now) ?? new RateLimitHit(1, $windowSeconds);
    }

    /** カウンターを増やさずに、現在の状態を返す（窓が切れている・存在しなければ、回数は 0）。 */
    public function peek(string $name): RateLimitHit
    {
        return $this->read($this->keyHash($name), $this->clock->now()) ?? new RateLimitHit(0, 0);
    }

    private function read(string $key, \DateTimeImmutable $now): ?RateLimitHit
    {
        $stmt = $this->pdo->prepare('SELECT hit_count, expires_at FROM rate_limit_counters WHERE key_hash = ?');
        $stmt->execute([$key]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }
        $expires = Time::fromDb((string) $row['expires_at']);
        if ($expires <= $now) {
            return new RateLimitHit(0, 0);
        }
        return new RateLimitHit((int) $row['hit_count'], max(1, $expires->getTimestamp() - $now->getTimestamp()));
    }

    private function keyHash(string $name): string
    {
        return hash_hmac('sha256', $name, $this->hmacKey, true);
    }
}
