<?php

declare(strict_types=1);

namespace UecTst\Family;

use DateTimeImmutable;
use PDO;
use UecTst\Support\Time;

/**
 * pending_registrations テーブルの操作（TableSpec_Auth.md 3.）。
 * 保存するのは、トークンのハッシュと有効期限のみ。メールアドレスは保存しない（基本方針 3.1）。
 */
final class PendingRegistrationRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function insert(string $id, string $tokenHash, DateTimeImmutable $expiresAt): void
    {
        $stmt = $this->pdo->prepare('INSERT INTO pending_registrations (id, token_hash, expires_at) VALUES (?, ?, ?)');
        $stmt->execute([$id, $tokenHash, Time::toDb($expiresAt)]);
    }

    /** 有効な仮登録の有効期限を返す（DB は変更しない。基本方針 3.2）。なければ null。 */
    public function findExpiry(string $tokenHash, DateTimeImmutable $now): ?DateTimeImmutable
    {
        $stmt = $this->pdo->prepare('SELECT expires_at FROM pending_registrations WHERE token_hash = ? AND expires_at > ?');
        $stmt->execute([$tokenHash, Time::toDb($now)]);
        $value = $stmt->fetchColumn();
        return $value === false ? null : Time::fromDb((string) $value);
    }

    /**
     * 仮登録を消費する（1回限り）。同じトークンで同時に実行されても、行ロックにより、1件だけが成功する。
     * 家族などの作成に失敗した場合は、呼び出し側のトランザクションのロールバックで、元に戻る。
     */
    public function consume(string $tokenHash, DateTimeImmutable $now): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM pending_registrations WHERE token_hash = ? AND expires_at > ?');
        $stmt->execute([$tokenHash, Time::toDb($now)]);
        return $stmt->rowCount() === 1;
    }

    public function deleteByHash(string $tokenHash): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM pending_registrations WHERE token_hash = ?');
        $stmt->execute([$tokenHash]);
    }
}
