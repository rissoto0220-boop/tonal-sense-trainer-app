<?php

declare(strict_types=1);

namespace UecTst\TestData;

use DateTimeImmutable;
use PDO;
use PDOException;
use UecTst\Db\Transaction;
use UecTst\Http\ApiException;
use UecTst\Support\Time;

/** 利用データのテーブル（TableSpec_TestData.md）の操作。users・families への外部キーは持たない。 */
final class TestSessionRepository
{
    public const SESSION_COLUMNS = 's.id, s.user_id, s.test_type, s.session_status, s.variant, s.attempt_number, s.planned_count, s.started_at, s.ended_at, s.utc_offset_minutes, s.attributes, s.received_at';

    /** 回答のテーブルから取り出す列（テスト種別ごと。seq または trial_number の順に並べる）。 */
    private const RESPONSE_TABLES = [
        TestType::ABSOLUTE_PITCH => ['absolute_pitch_responses', 'seq'],
        TestType::RELATIVE_PITCH => ['relative_pitch_responses', 'seq'],
        TestType::FUNCTIONAL_PITCH => ['functional_pitch_responses', 'trial_number'],
    ];

    public function __construct(private readonly PDO $pdo)
    {
    }

    // ---- 保存 ----

    /**
     * セッション1件を保存する（ApiSpec_TestData.md 1.1）。
     *
     * @return 'created'|'exists' 'exists' は、同じユーザの同じ sessionId が保存済み（何もしない）
     * @throws ApiException 409 SESSION_ID_CONFLICT（同じ sessionId が別のユーザのもの）
     */
    public function save(ValidatedSession $session, string $userId, DateTimeImmutable $now): string
    {
        $existing = $this->ownerOf($session->id);
        if ($existing !== null) {
            return $this->resolveExisting($existing, $userId);
        }
        try {
            Transaction::run($this->pdo, function () use ($session, $userId, $now): void {
                $this->insertSession($session, $userId, $now);
                $this->insertResponses($session);
            });
        } catch (PDOException $e) {
            // 同時に同じ sessionId が送られて、主キーが重複した場合は、保存済みとして判定をやり直す。
            $owner = $e->getCode() === '23000' ? $this->ownerOf($session->id) : null;
            if ($owner === null) {
                throw $e;
            }
            return $this->resolveExisting($owner, $userId);
        }
        return 'created';
    }

    private function resolveExisting(string $owner, string $userId): string
    {
        if (!hash_equals($owner, $userId)) {
            throw ApiException::conflict('SESSION_ID_CONFLICT', 'この sessionId は、すでに別のデータとして保存されています。');
        }
        return 'exists';
    }

    public function ownerOf(string $sessionId): ?string
    {
        $stmt = $this->pdo->prepare('SELECT user_id FROM test_sessions WHERE id = ?');
        $stmt->execute([$sessionId]);
        $owner = $stmt->fetchColumn();
        return $owner === false ? null : (string) $owner;
    }

    private function insertSession(ValidatedSession $s, string $userId, DateTimeImmutable $now): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO test_sessions (id, user_id, test_type, session_status, variant, attempt_number, planned_count, started_at, ended_at, utc_offset_minutes, attributes, received_at) '
            . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        $stmt->execute([
            $s->id, $userId, $s->testType, $s->status, $s->variant, $s->attemptNumber, $s->plannedCount,
            SessionValidator::toDb($s->startedAt), SessionValidator::toDb($s->endedAt), $s->offsetMinutes,
            json_encode((object) $s->attributes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
            Time::toDb($now),
        ]);
    }

    private function insertResponses(ValidatedSession $s): void
    {
        if ($s->testType === TestType::TRAINING) {
            $trials = array_map(static fn (array $t): array => $t['trial'], $s->trials);
            $targets = [];
            foreach ($s->trials as $t) {
                foreach ($t['responses'] as $r) {
                    $targets[] = $r;
                }
            }
            $this->insertRows('training_trials', $s->id, $trials);
            $this->insertRows('training_trial_responses', $s->id, $targets);
            return;
        }
        [$table] = self::RESPONSE_TABLES[$s->testType];
        $this->insertRows($table, $s->id, $s->rows);
    }

    /** @param list<array<string, mixed>> $rows */
    private function insertRows(string $table, string $sessionId, array $rows): void
    {
        if ($rows === []) {
            return;
        }
        $columns = array_keys($rows[0]);
        $placeholder = '(?' . str_repeat(', ?', count($columns)) . ')';
        $sql = 'INSERT INTO ' . $table . ' (session_id, ' . implode(', ', $columns) . ') VALUES '
            . implode(', ', array_fill(0, count($rows), $placeholder));
        $params = [];
        foreach ($rows as $row) {
            $params[] = $sessionId;
            foreach ($columns as $column) {
                $params[] = $row[$column];
            }
        }
        $this->pdo->prepare($sql)->execute($params);
    }

    // ---- 一覧・詳細 ----

    /**
     * 一覧の1ページ（開始日時の新しい順）。続きがあれば、次のページの先頭を指すカーソルを返す。
     *
     * @return array{rows: list<array<string, mixed>>, next: ?string}
     */
    public function page(DataScope $scope, TestDataFilter $filter, int $limit, ?string $cursor): array
    {
        [$where, $params] = $this->conditions($scope, $filter);
        if ($cursor !== null) {
            [$startedAt, $id] = self::decodeCursor($cursor);
            $where .= ' AND (s.started_at < ? OR (s.started_at = ? AND s.id < ?))';
            array_push($params, $startedAt, $startedAt, $id);
        }
        $stmt = $this->pdo->prepare(
            'SELECT ' . self::SESSION_COLUMNS . ' FROM ' . $scope->from() . ' WHERE ' . $where
            . ' ORDER BY s.started_at DESC, s.id DESC LIMIT ' . ($limit + 1),
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        $next = null;
        if (count($rows) > $limit) {
            array_pop($rows);
            $last = $rows[$limit - 1];
            $next = self::encodeCursor((string) $last['started_at'], (string) $last['id']);
        }
        return ['rows' => $rows, 'next' => $next];
    }

    /** @return array<string, mixed>|null */
    public function findVisible(DataScope $scope, string $sessionId, ?string $userId = null): ?array
    {
        $where = $scope->where() . ' AND s.id = ?';
        $params = [...$scope->params(), $sessionId];
        if ($userId !== null) {
            $where .= ' AND s.user_id = ?';
            $params[] = $userId;
        }
        $stmt = $this->pdo->prepare('SELECT ' . self::SESSION_COLUMNS . ' FROM ' . $scope->from() . ' WHERE ' . $where);
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public function count(DataScope $scope, TestDataFilter $filter): int
    {
        [$where, $params] = $this->conditions($scope, $filter);
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM ' . $scope->from() . ' WHERE ' . $where);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    }

    /**
     * 範囲内の（種類、ユーザ）の組み合わせ。ダウンロードのファイルの単位。
     *
     * @return list<array{test_type: string, user_id: string}>
     */
    public function groups(DataScope $scope, TestDataFilter $filter): array
    {
        [$where, $params] = $this->conditions($scope, $filter);
        $stmt = $this->pdo->prepare(
            'SELECT s.test_type, s.user_id FROM ' . $scope->from() . ' WHERE ' . $where
            . ' GROUP BY s.test_type, s.user_id ORDER BY s.test_type, s.user_id',
        );
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * 開始日時の古い順の1ページ（ダウンロード用）。$after は、前のページの最後の行（なければ null）。
     *
     * @param array<string, mixed>|null $after
     * @return list<array<string, mixed>>
     */
    public function pageAscending(DataScope $scope, TestDataFilter $filter, int $limit, ?array $after): array
    {
        [$where, $params] = $this->conditions($scope, $filter);
        if ($after !== null) {
            $where .= ' AND (s.started_at > ? OR (s.started_at = ? AND s.id > ?))';
            array_push($params, $after['started_at'], $after['started_at'], $after['id']);
        }
        $stmt = $this->pdo->prepare(
            'SELECT ' . self::SESSION_COLUMNS . ' FROM ' . $scope->from() . ' WHERE ' . $where
            . ' ORDER BY s.started_at ASC, s.id ASC LIMIT ' . $limit,
        );
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /** @return array{0: string, 1: list<string>} */
    private function conditions(DataScope $scope, TestDataFilter $filter): array
    {
        [$where, $params] = $filter->toSql();
        return [$scope->where() . ' AND ' . $where, [...$scope->params(), ...$params]];
    }

    // ---- 回答 ----

    /**
     * セッションの回答（絶対音感・相対音感・調性感）。セッションごとに、順に並べる。キーは、セッション ID（バイナリ）。
     *
     * @param list<string> $sessionIds
     * @return array<string, list<array<string, mixed>>>
     */
    public function responsesFor(string $testType, array $sessionIds): array
    {
        if ($sessionIds === []) {
            return [];
        }
        [$table, $order] = self::RESPONSE_TABLES[$testType];
        $stmt = $this->pdo->prepare(
            'SELECT * FROM ' . $table . ' WHERE session_id IN (' . self::placeholders($sessionIds) . ') ORDER BY session_id, ' . $order,
        );
        $stmt->execute($sessionIds);
        $grouped = [];
        foreach ($stmt->fetchAll() as $row) {
            $grouped[(string) $row['session_id']][] = $row;
        }
        return $grouped;
    }

    /**
     * 訓練の試行と、その回答対象ごとの回答。キーは、セッション ID（バイナリ）。
     *
     * @param list<string> $sessionIds
     * @return array<string, list<array<string, mixed>>> 各試行に responses を持たせる
     */
    public function trialsFor(array $sessionIds): array
    {
        if ($sessionIds === []) {
            return [];
        }
        $in = self::placeholders($sessionIds);
        $stmt = $this->pdo->prepare("SELECT * FROM training_trial_responses WHERE session_id IN ({$in}) ORDER BY session_id, trial_number, target_id");
        $stmt->execute($sessionIds);
        $targets = [];
        foreach ($stmt->fetchAll() as $row) {
            $targets[(string) $row['session_id']][(int) $row['trial_number']][] = $row;
        }
        $stmt = $this->pdo->prepare("SELECT * FROM training_trials WHERE session_id IN ({$in}) ORDER BY session_id, trial_number");
        $stmt->execute($sessionIds);
        $grouped = [];
        foreach ($stmt->fetchAll() as $row) {
            $sid = (string) $row['session_id'];
            $row['responses'] = $targets[$sid][(int) $row['trial_number']] ?? [];
            $grouped[$sid][] = $row;
        }
        return $grouped;
    }

    // ---- 削除 ----

    /** セッションを削除する（回答は ON DELETE CASCADE で連鎖して削除される）。 */
    public function delete(string $sessionId): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM test_sessions WHERE id = ?');
        $stmt->execute([$sessionId]);
        return $stmt->rowCount() > 0;
    }

    // ---- 運用担当者・組織のユーザ一覧 ----

    /**
     * 参照できるユーザの一覧（ユーザ ID の順）。
     *
     * @param string|null $organizationId 通常の組織の ID。null なら運用担当者（すべて）
     * @return list<array<string, mixed>>
     */
    public function users(?string $organizationId, int $limit, ?string $afterUserId): array
    {
        $counts = '(SELECT COUNT(*) FROM test_sessions t WHERE t.user_id = x.user_id) AS session_count, '
            . '(SELECT MAX(t.started_at) FROM test_sessions t WHERE t.user_id = x.user_id) AS last_started_at';
        $after = $afterUserId === null ? '' : ' AND x.user_id > ?';
        if ($organizationId !== null) {
            $sql = "SELECT x.user_id, x.name, {$counts} FROM ("
                . 'SELECT u.id AS user_id, u.name FROM users u JOIN families f ON f.id = u.family_id WHERE f.organization_id = ?'
                . ") x WHERE 1 = 1{$after} ORDER BY x.user_id LIMIT " . ($limit + 1);
            $params = [$organizationId];
        } else {
            $sql = "SELECT x.user_id, u.name, o.name AS organization_name, {$counts} FROM ("
                . 'SELECT id AS user_id FROM users UNION SELECT user_id FROM test_sessions'
                . ') x LEFT JOIN users u ON u.id = x.user_id LEFT JOIN families f ON f.id = u.family_id '
                . "LEFT JOIN organizations o ON o.id = f.organization_id WHERE 1 = 1{$after} ORDER BY x.user_id LIMIT " . ($limit + 1);
            $params = [];
        }
        if ($afterUserId !== null) {
            $params[] = $afterUserId;
        }
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * そのユーザのデータを参照できるか（ApiSpec_TestData.md 0.2）。
     *
     * @param string|null $organizationId 通常の組織の ID。null なら運用担当者（すべて）
     */
    public function userVisible(?string $organizationId, string $userId): bool
    {
        if ($organizationId !== null) {
            $stmt = $this->pdo->prepare('SELECT 1 FROM users u JOIN families f ON f.id = u.family_id WHERE u.id = ? AND f.organization_id = ?');
            $stmt->execute([$userId, $organizationId]);
            return $stmt->fetchColumn() !== false;
        }
        $stmt = $this->pdo->prepare('SELECT 1 FROM users WHERE id = ? UNION SELECT 1 FROM test_sessions WHERE user_id = ? LIMIT 1');
        $stmt->execute([$userId, $userId]);
        return $stmt->fetchColumn() !== false;
    }

    // ---- 部品 ----

    /** @param list<string> $values */
    public static function placeholders(array $values): string
    {
        return implode(',', array_fill(0, count($values), '?'));
    }

    private static function encodeCursor(string $startedAt, string $id): string
    {
        return rtrim(strtr(base64_encode($startedAt . '|' . bin2hex($id)), '+/', '-_'), '=');
    }

    /** @return array{0: string, 1: string} 開始日時（DB の形式）とセッション ID（バイナリ） */
    private static function decodeCursor(string $cursor): array
    {
        $decoded = base64_decode(strtr($cursor, '-_', '+/'), true);
        if ($decoded !== false && preg_match('/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\|([0-9a-f]{32})$/', $decoded, $m)) {
            return [$m[1], (string) hex2bin($m[2])];
        }
        throw ApiException::validationFailed('入力内容に誤りがあります。', [['field' => 'cursor', 'code' => 'INVALID']]);
    }
}
