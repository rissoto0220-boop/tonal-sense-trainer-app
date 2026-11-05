<?php

declare(strict_types=1);

namespace UecTst\TestData;

use PDO;

/**
 * セッションごとの件数。保存せず、回答から数え直す（ApiSpec_TestData.md 0.5。定義は、クライアントの reports.js と同じ）。
 * 返す値は、履歴 CSV の列名（snake_case）をキーにする。
 */
final class SessionMetrics
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @param list<array<string, mixed>> $sessions test_sessions の行
     * @return array<string, array<string, mixed>> キーはセッション ID（バイナリ）
     */
    public function forSessions(array $sessions): array
    {
        $byType = [];
        foreach ($sessions as $row) {
            $byType[(string) $row['test_type']][(string) $row['id']] = $row;
        }
        $metrics = [];
        foreach ($byType as $type => $rows) {
            $ids = array_keys($rows);
            $metrics += match ($type) {
                TestType::ABSOLUTE_PITCH => $this->absolutePitch($ids),
                TestType::RELATIVE_PITCH => $this->relativePitch($rows),
                TestType::FUNCTIONAL_PITCH => $this->functionalPitch($rows),
                default => $this->training($ids),
            };
        }
        return $metrics;
    }

    /** @param list<string> $ids */
    private function absolutePitch(array $ids): array
    {
        $in = TestSessionRepository::placeholders($ids);
        $stmt = $this->pdo->prepare(
            'SELECT session_id, '
            . "SUM(phase = 'practice') AS pq, SUM(phase = 'practice' AND outcome = 'timeout') AS pt, "
            . "SUM(phase = 'test') AS q, SUM(phase = 'test' AND outcome = 'correct') AS c, "
            . "SUM(phase = 'test' AND outcome = 'incorrect') AS i, SUM(phase = 'test' AND outcome = 'timeout') AS t "
            . "FROM absolute_pitch_responses WHERE session_id IN ({$in}) GROUP BY session_id",
        );
        $stmt->execute($ids);
        $counts = [];
        foreach ($stmt->fetchAll() as $r) {
            $counts[(string) $r['session_id']] = $r;
        }
        $interrupted = $this->interruptedRows('absolute_pitch_responses', $ids);

        $result = [];
        foreach ($ids as $id) {
            $r = $counts[$id] ?? [];
            $questions = (int) ($r['q'] ?? 0);
            $incorrect = (int) ($r['i'] ?? 0);
            $timeout = (int) ($r['t'] ?? 0);
            $result[$id] = [
                'practice_questions_presented' => (int) ($r['pq'] ?? 0),
                'practice_timeout_count' => (int) ($r['pt'] ?? 0),
                'questions_presented' => $questions,
                'correct_count' => (int) ($r['c'] ?? 0),
                'incorrect_answer_count' => $incorrect,
                'timeout_count' => $timeout,
                'total_incorrect_count' => $incorrect + $timeout,
                'unpresented_count' => TestType::ABSOLUTE_PITCH_TOTAL_QUESTIONS - $questions,
                'interrupted_phase' => $interrupted[$id]['phase'] ?? null,
                'interrupted_question_number' => $interrupted[$id]['question_number'] ?? null,
            ];
        }
        return $result;
    }

    /** @param array<string, array<string, mixed>> $rows */
    private function relativePitch(array $rows): array
    {
        $ids = array_keys($rows);
        $in = TestSessionRepository::placeholders($ids);
        $stmt = $this->pdo->prepare(
            'SELECT session_id, '
            . "SUM(phase = 'practice') AS pq, SUM(phase = 'test') AS q, "
            . "SUM(phase = 'test' AND outcome IN ('correct', 'incorrect')) AS a, "
            . "SUM(phase = 'test' AND outcome = 'correct') AS c, SUM(phase = 'test' AND outcome = 'incorrect') AS i "
            . "FROM relative_pitch_responses WHERE session_id IN ({$in}) GROUP BY session_id",
        );
        $stmt->execute($ids);
        $counts = [];
        foreach ($stmt->fetchAll() as $r) {
            $counts[(string) $r['session_id']] = $r;
        }
        $interrupted = $this->interruptedRows('relative_pitch_responses', $ids);

        $result = [];
        foreach ($rows as $id => $session) {
            $r = $counts[$id] ?? [];
            $correct = (int) ($r['c'] ?? 0);
            $total = (int) ($session['planned_count'] ?? 0);
            $result[$id] = [
                'practice_questions_presented' => (int) ($r['pq'] ?? 0),
                'questions_presented' => (int) ($r['q'] ?? 0),
                'questions_answered' => (int) ($r['a'] ?? 0),
                'correct_count' => $correct,
                'incorrect_count' => (int) ($r['i'] ?? 0),
                'total_questions' => $total,
                // 正答率は、完了したセッションだけ（小数第1位まで四捨五入。reports.js と同じ）。
                'accuracy' => $session['session_status'] === 'completed' && $total > 0 ? round($correct / $total * 100, 1) : null,
                'interrupted_phase' => $interrupted[$id]['phase'] ?? null,
                'interrupted_question_number' => $interrupted[$id]['question_number'] ?? null,
            ];
        }
        return $result;
    }

    /** @param array<string, array<string, mixed>> $rows */
    private function functionalPitch(array $rows): array
    {
        $ids = array_keys($rows);
        $in = TestSessionRepository::placeholders($ids);
        $stmt = $this->pdo->prepare(
            "SELECT session_id, SUM(outcome = 'answered') AS a FROM functional_pitch_responses WHERE session_id IN ({$in}) GROUP BY session_id",
        );
        $stmt->execute($ids);
        $answered = [];
        foreach ($stmt->fetchAll() as $r) {
            $answered[(string) $r['session_id']] = (int) $r['a'];
        }
        $result = [];
        foreach ($rows as $id => $session) {
            $attributes = json_decode((string) $session['attributes'], true) ?: [];
            $result[$id] = [
                'practice_trial_count' => count($attributes['practiceResults'] ?? []),
                'answered_trial_count' => $answered[$id] ?? 0,
                'total_trial_count' => (int) ($session['planned_count'] ?? 0),
            ];
        }
        return $result;
    }

    /** @param list<string> $ids */
    private function training(array $ids): array
    {
        $in = TestSessionRepository::placeholders($ids);
        $stmt = $this->pdo->prepare(
            'SELECT t.session_id, COUNT(*) AS n, '
            . 'SUM(NOT EXISTS (SELECT 1 FROM training_trial_responses r WHERE r.session_id = t.session_id AND r.trial_number = t.trial_number AND r.outcome <> \'correct\')) AS c, '
            . 'SUM(EXISTS (SELECT 1 FROM training_trial_responses r WHERE r.session_id = t.session_id AND r.trial_number = t.trial_number AND r.outcome = \'giveup\')) AS g '
            . "FROM training_trials t WHERE t.session_id IN ({$in}) GROUP BY t.session_id",
        );
        $stmt->execute($ids);
        $counts = [];
        foreach ($stmt->fetchAll() as $r) {
            $counts[(string) $r['session_id']] = $r;
        }
        $result = [];
        foreach ($ids as $id) {
            $r = $counts[$id] ?? [];
            $result[$id] = [
                'trials_completed' => (int) ($r['n'] ?? 0),
                'correct_count' => (int) ($r['c'] ?? 0),
                'giveup_count' => (int) ($r['g'] ?? 0),
            ];
        }
        return $result;
    }

    /**
     * 中断した問題（outcome が interrupted の最初の行）。
     *
     * @param list<string> $ids
     * @return array<string, array{phase: string, question_number: int}>
     */
    private function interruptedRows(string $table, array $ids): array
    {
        $in = TestSessionRepository::placeholders($ids);
        $stmt = $this->pdo->prepare("SELECT session_id, phase, question_number FROM {$table} WHERE session_id IN ({$in}) AND outcome = 'interrupted' ORDER BY session_id, seq");
        $stmt->execute($ids);
        $result = [];
        foreach ($stmt->fetchAll() as $r) {
            $result[(string) $r['session_id']] ??= ['phase' => (string) $r['phase'], 'question_number' => (int) $r['question_number']];
        }
        return $result;
    }
}
