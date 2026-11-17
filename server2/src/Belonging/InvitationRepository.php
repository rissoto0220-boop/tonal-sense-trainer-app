<?php

declare(strict_types=1);

namespace UecTst\Belonging;

use DateTimeImmutable;
use PDO;
use UecTst\Support\Time;

/** belonging_invitations テーブルの操作（TableSpec_Belonging.md 5.）。メールアドレスは保存しない。 */
final class InvitationRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function insert(string $id, string $belongingId, string $tokenHash, DateTimeImmutable $expiresAt): void
    {
        $stmt = $this->pdo->prepare('INSERT INTO belonging_invitations (id, belonging_id, token_hash, expires_at) VALUES (?, ?, ?, ?)');
        $stmt->execute([$id, $belongingId, $tokenHash, Time::toDb($expiresAt)]);
    }

    /** メールの送信に失敗したときに、作った招待を取り消す。 */
    public function deleteByHash(string $tokenHash): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM belonging_invitations WHERE token_hash = ?');
        $stmt->execute([$tokenHash]);
    }

    /** 有効期限内で、まだ使われていない招待の数。 */
    public function countPending(string $belongingId, DateTimeImmutable $now): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM belonging_invitations WHERE belonging_id = ? AND expires_at > ?');
        $stmt->execute([$belongingId, Time::toDb($now)]);
        return (int) $stmt->fetchColumn();
    }

    /** 有効期限内の、未使用の招待をすべて取り消す。取り消した数を返す。 */
    public function revokePending(string $belongingId, DateTimeImmutable $now): int
    {
        $stmt = $this->pdo->prepare('DELETE FROM belonging_invitations WHERE belonging_id = ? AND expires_at > ?');
        $stmt->execute([$belongingId, Time::toDb($now)]);
        return $stmt->rowCount();
    }

    /**
     * 招待の照合（行は変更しない）。
     *
     * @return array{belongingName: string, expiresAt: DateTimeImmutable}|null 無効（使用済み・期限切れ・存在しない）なら null
     */
    public function findValid(string $tokenHash, DateTimeImmutable $now): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT o.name, i.expires_at FROM belonging_invitations i JOIN belongings o ON o.id = i.belonging_id '
            . 'WHERE i.token_hash = ? AND i.expires_at > ?',
        );
        $stmt->execute([$tokenHash, Time::toDb($now)]);
        $row = $stmt->fetch();
        return $row === false ? null : ['belongingName' => (string) $row['name'], 'expiresAt' => Time::fromDb((string) $row['expires_at'])];
    }

    /**
     * 招待を取り出して削除する（使い切り）。トランザクションの中で使う。
     * 同じ招待で同時に実行されても、行ロックにより、片方だけが取り出せる。家族の作成・所属に失敗してロールバックすれば、招待も元に戻る。
     *
     * @return string|null 招待した所属の ID。取り出せなければ（無効なら）null
     */
    public function consume(string $tokenHash, DateTimeImmutable $now): ?string
    {
        $stmt = $this->pdo->prepare('SELECT id, belonging_id FROM belonging_invitations WHERE token_hash = ? AND expires_at > ? FOR UPDATE');
        $stmt->execute([$tokenHash, Time::toDb($now)]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }
        $delete = $this->pdo->prepare('DELETE FROM belonging_invitations WHERE id = ?');
        $delete->execute([$row['id']]);
        return (string) $row['belonging_id'];
    }
}
