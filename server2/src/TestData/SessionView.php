<?php

declare(strict_types=1);

namespace UecTst\TestData;

use UecTst\Db\Uuid7;
use UecTst\Support\Time;

/** 利用データの、API で返す JSON の形（ApiSpec_TestData.md 0.5）。日時は UTC（Z）で返す。 */
final class SessionView
{
    /** 一覧の1件。$metrics は SessionMetrics の値。 */
    public static function summary(array $row, array $metrics): array
    {
        $type = (string) $row['test_type'];
        return [
            'sessionId' => self::uuid((string) $row['id']),
            'testType' => $type,
            'sessionStatus' => (string) $row['session_status'],
            'startedAt' => self::iso($row['started_at']),
            'endedAt' => self::iso($row['ended_at']),
            'utcOffsetMinutes' => (int) $row['utc_offset_minutes'],
            'variant' => $row['variant'],
            'attemptNumber' => $row['attempt_number'],
            'plannedCount' => $row['planned_count'],
            'summary' => self::summaryBody($type, $metrics),
        ];
    }

    private static function summaryBody(string $type, array $m): array
    {
        $pick = static fn (array $keys): array => array_intersect_key($m, array_flip($keys));
        $camel = static function (array $values): array {
            $out = [];
            foreach ($values as $key => $value) {
                $out[self::camel($key)] = $value;
            }
            return $out;
        };
        return match ($type) {
            TestType::ABSOLUTE_PITCH => $camel($pick(['questions_presented', 'correct_count', 'incorrect_answer_count', 'timeout_count'])),
            TestType::RELATIVE_PITCH => $camel($pick(['questions_presented', 'questions_answered', 'correct_count', 'incorrect_count', 'accuracy'])),
            TestType::FUNCTIONAL_PITCH => $camel($pick(['answered_trial_count', 'total_trial_count'])),
            default => $camel($pick(['trials_completed', 'correct_count', 'giveup_count'])),
        };
    }

    /**
     * 詳細。$responses は、回答のテーブルの行（訓練は、responses を持つ試行の行）。
     *
     * @param list<array<string, mixed>> $responses
     */
    public static function detail(array $row, array $responses, ?array $metrics, bool $withUserId): array
    {
        $type = (string) $row['test_type'];
        $attributes = json_decode((string) $row['attributes'], true) ?: [];
        $session = [
            'sessionId' => self::uuid((string) $row['id']),
            'testType' => $type,
            'sessionStatus' => (string) $row['session_status'],
            'startedAt' => self::iso($row['started_at']),
            'endedAt' => self::iso($row['ended_at']),
            'utcOffsetMinutes' => (int) $row['utc_offset_minutes'],
            'receivedAt' => Time::dbToIso((string) $row['received_at']),
        ];
        if ($withUserId) {
            $session['userId'] = self::uuid((string) $row['user_id']);
        }

        $session += match ($type) {
            TestType::ABSOLUTE_PITCH => $attributes + ['responses' => array_map(self::responseRow(...), $responses)],
            TestType::RELATIVE_PITCH => [
                'testVersion' => $row['variant'],
                'answerLayout' => $attributes['answerLayout'] ?? '',
                'practiceStatus' => $attributes['practiceStatus'] ?? null,
                'generatedQuestionOrder' => $attributes['generatedQuestionOrder'] ?? [],
                'responses' => array_map(self::responseRow(...), $responses),
            ],
            TestType::FUNCTIONAL_PITCH => [
                'measurementKeyCode' => $row['variant'],
                'attemptNumber' => $row['attempt_number'],
                'totalTrialCount' => $row['planned_count'],
                'generatedTrialOrder' => $attributes['generatedTrialOrder'] ?? [],
                'practiceResults' => $attributes['practiceResults'] ?? [],
                'responses' => array_map(self::responseRow(...), $responses),
            ],
            default => [
                'menuId' => $row['variant'],
                'attemptNumber' => $row['attempt_number'],
                'sessionKeyCode' => $attributes['sessionKeyCode'] ?? '',
                'keyAssignmentMethod' => $attributes['keyAssignmentMethod'] ?? '',
                'trialsPlanned' => $row['planned_count'],
                'trialsCompleted' => $metrics['trials_completed'] ?? 0,
                'correctCount' => $metrics['correct_count'] ?? 0,
                'giveupCount' => $metrics['giveup_count'] ?? 0,
                'trials' => array_map(self::trialRow(...), $responses),
            ],
        };
        return $session;
    }

    private static function trialRow(array $trial): array
    {
        $responses = array_map(static fn (array $r): array => [
            'targetId' => $r['target_id'],
            'correctAnswerCode' => $r['correct_answer_code'],
            'responseCode' => $r['response_code'],
            'outcome' => $r['outcome'],
        ], $trial['responses'] ?? []);
        unset($trial['responses'], $trial['session_id']);
        $correct = count(array_filter($responses, static fn (array $r): bool => $r['outcome'] === 'correct'));
        $count = count($responses);
        return self::responseRow($trial) + [
            'responses' => $responses,
            'scoring' => [
                'targetCount' => $count,
                'correctTargetCount' => $correct,
                'accuracy' => $count === 0 ? 0 : $correct / $count,
                'allCorrect' => $count > 0 && $correct === $count,
            ],
        ];
    }

    /** 回答のテーブルの行を、camelCase のキーにする（日時は UTC の ISO 8601）。 */
    private static function responseRow(array $row): array
    {
        $out = [];
        foreach ($row as $column => $value) {
            if ($column === 'session_id' || $column === 'seq') {
                continue;
            }
            $out[self::camel($column)] = str_ends_with($column, '_at') && $value !== null ? self::iso($value) : $value;
        }
        return $out;
    }

    public static function camel(string $snake): string
    {
        return lcfirst(str_replace(' ', '', ucwords(str_replace('_', ' ', $snake))));
    }

    public static function uuid(string $binary): string
    {
        return Uuid7::toString($binary);
    }

    private static function iso(mixed $dbValue): string
    {
        return Time::dbToIso((string) $dbValue);
    }
}
