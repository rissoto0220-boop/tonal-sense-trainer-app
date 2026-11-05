<?php

declare(strict_types=1);

namespace UecTst\Organization;

use DateTimeImmutable;
use PDO;
use UecTst\Support\Time;

/** organization_invitations テーブルの操作（TableSpec_Organization.md 5.）。メールアドレスは保存しない。 */
final class InvitationRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function insert(string $id, string $organizationId, string $tokenHash, DateTimeImmutable $expiresAt): void
    {
        $stmt = $this->pdo->prepare('INSERT INTO organization_invitations (id, organization_id, token_hash, expires_at) VALUES (?, ?, ?, ?)');
        $stmt->execute([$id, $organizationId, $tokenHash, Time::toDb($expiresAt)]);
    }

    /** メールの送信に失敗したときに、作った招待を取り消す。 */
    public function deleteByHash(string $tokenHash): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM organization_invitations WHERE token_hash = ?');
        $stmt->execute([$tokenHash]);
    }

    /** 有効期限内で、まだ使われていない招待の数。 */
    public function countPending(string $organizationId, DateTimeImmutable $now): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM organization_invitations WHERE organization_id = ? AND expires_at > ?');
        $stmt->execute([$organizationId, Time::toDb($now)]);
        return (int) $stmt->fetchColumn();
    }

    /** 有効期限内の、未使用の招待をすべて取り消す。取り消した数を返す。 */
    public function revokePending(string $organizationId, DateTimeImmutable $now): int
    {
        $stmt = $this->pdo->prepare('DELETE FROM organization_invitations WHERE organization_id = ? AND expires_at > ?');
        $stmt->execute([$organizationId, Time::toDb($now)]);
        return $stmt->rowCount();
    }

    /**
     * 招待の照合（行は変更しない）。
     *
     * @return array{organizationName: string, expiresAt: DateTimeImmutable}|null 無効（使用済み・期限切れ・存在しない）なら null
     */
    public function findValid(string $tokenHash, DateTimeImmutable $now): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT o.name, i.expires_at FROM organization_invitations i JOIN organizations o ON o.id = i.organization_id '
            . 'WHERE i.token_hash = ? AND i.expires_at > ?',
        );
        $stmt->execute([$tokenHash, Time::toDb($now)]);
        $row = $stmt->fetch();
        return $row === false ? null : ['organizationName' => (string) $row['name'], 'expiresAt' => Time::fromDb((string) $row['expires_at'])];
    }

    /**
     * 招待を取り出して削除する（使い切り）。トランザクションの中で使う。
     * 同じ招待で同時に実行されても、行ロックにより、片方だけが取り出せる。家族の作成・所属に失敗してロールバックすれば、招待も元に戻る。
     *
     * @return string|null 招待した組織の ID。取り出せなければ（無効なら）null
     */
    public function consume(string $tokenHash, DateTimeImmutable $now): ?string
    {
        $stmt = $this->pdo->prepare('SELECT id, organization_id FROM organization_invitations WHERE token_hash = ? AND expires_at > ? FOR UPDATE');
        $stmt->execute([$tokenHash, Time::toDb($now)]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }
        $delete = $this->pdo->prepare('DELETE FROM organization_invitations WHERE id = ?');
        $delete->execute([$row['id']]);
        return (string) $row['organization_id'];
    }
}
