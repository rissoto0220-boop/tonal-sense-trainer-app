<?php

declare(strict_types=1);

namespace UecTst\TestData;

use DateTimeImmutable;
use UecTst\Db\Uuid7;

/**
 * ダウンロードする CSV の列と行（DataFormat_TestData.md 8.3・8.4）。
 * 列は現在のクライアントの CSV にそろえ、participant_id の代わりに user_id を出す。
 * 日時は、セッションの開始日時のオフセット付き（2026-10-29T08:54:03.875+09:00）で出す。
 */
final class ExportFormat
{
    public const KIND_RESPONSES = 'responses';
    public const KIND_SESSIONS = 'sessions';
    public const KINDS = [self::KIND_RESPONSES, self::KIND_SESSIONS];

    private const HEADERS = [
        TestType::ABSOLUTE_PITCH => [
            self::KIND_RESPONSES => [
                'user_id', 'session_id', 'test_type', 'phase', 'session_status', 'session_started_at', 'session_ended_at',
                'question_number', 'stimulus_number', 'stimulus_note', 'stimulus_filename', 'stimulus_started_at',
                'correct_response', 'response_note', 'response_at', 'response_time_ms', 'outcome',
                'incorrect_total_after_question', 'sequence_start_position', 'sequence_start_number', 'sequence_direction',
            ],
            self::KIND_SESSIONS => [
                'user_id', 'session_id', 'test_type', 'started_at', 'ended_at', 'session_status',
                'practice_questions_presented', 'practice_timeout_count', 'questions_presented',
                'correct_count', 'incorrect_answer_count', 'timeout_count', 'total_incorrect_count', 'unpresented_count',
                'sequence_start_position', 'sequence_start_number', 'sequence_direction',
                'interrupted_phase', 'interrupted_question_number',
            ],
        ],
        TestType::RELATIVE_PITCH => [
            self::KIND_RESPONSES => [
                'user_id', 'session_id', 'test_type', 'test_version', 'phase', 'session_status', 'answer_layout',
                'session_started_at', 'session_ended_at', 'practice_status', 'total_questions',
                'question_number', 'key_block_number', 'key_code', 'cadence_filename', 'reference_note', 'target_note',
                'interval_semitones', 'syllable_code', 'display_label', 'interval_label', 'scale_label',
                'cadence_started_at', 'reference_started_at', 'target_started_at',
                'response_code', 'response_at', 'response_time_ms', 'outcome',
            ],
            self::KIND_SESSIONS => [
                'user_id', 'session_id', 'test_type', 'test_version', 'started_at', 'ended_at', 'session_status',
                'answer_layout', 'practice_status', 'practice_questions_presented', 'questions_presented',
                'questions_answered', 'correct_count', 'incorrect_count', 'accuracy',
                'interrupted_phase', 'interrupted_question_number',
            ],
        ],
        TestType::FUNCTIONAL_PITCH => [
            self::KIND_RESPONSES => [
                'user_id', 'session_id', 'test_type', 'session_status', 'session_started_at', 'session_ended_at',
                'measurement_key_code', 'attempt_number',
                'trial_number', 'first_stimulus_id', 'second_stimulus_id', 'change_condition', 'trial_started_at',
                'melody_change_rating', 'harmony_change_rating', 'overall_change_rating',
                'response_enabled_at', 'response_confirmed_at', 'response_time_ms', 'outcome',
            ],
            self::KIND_SESSIONS => [
                'user_id', 'session_id', 'test_type', 'measurement_key_code', 'attempt_number',
                'session_status', 'started_at', 'ended_at',
                'practice_trial_count', 'answered_trial_count', 'total_trial_count',
            ],
        ],
        TestType::TRAINING => [
            self::KIND_RESPONSES => [
                'user_id', 'session_id', 'test_type', 'menu_id', 'attempt_number', 'session_status',
                'session_started_at', 'session_ended_at', 'session_key_code', 'key_assignment_method',
                'trial_number', 'stimulus_id', 'stimulus_version', 'task_template_id', 'key_code',
                'target_id', 'correct_answer_code', 'response_code', 'outcome',
                'question_replay_count', 'feedback_replay_count',
                'audio_started_at', 'audio_ended_at', 'response_enabled_at', 'response_submitted_at', 'response_time_ms',
            ],
            self::KIND_SESSIONS => [
                'user_id', 'session_id', 'test_type', 'menu_id', 'attempt_number', 'session_status',
                'session_key_code', 'key_assignment_method', 'started_at', 'ended_at',
                'trials_planned', 'trials_completed', 'correct_count', 'giveup_count',
            ],
        ],
    ];

    /** @return list<string> */
    public static function headers(string $type, string $kind): array
    {
        return self::HEADERS[$type][$kind];
    }

    /**
     * 回答詳細 CSV の行（1セッション分）。
     *
     * @param array<string, mixed> $session test_sessions の行
     * @param list<array<string, mixed>> $children 回答の行（訓練は、responses を持つ試行の行）
     * @return list<list<scalar|null>>
     */
    public static function responseRows(array $session, array $children): array
    {
        $type = (string) $session['test_type'];
        $offset = (int) $session['utc_offset_minutes'];
        $attributes = json_decode((string) $session['attributes'], true) ?: [];
        $t = static fn (mixed $value): ?string => self::local($value, $offset);
        $common = [
            Uuid7::toString((string) $session['user_id']),
            Uuid7::toString((string) $session['id']),
            $type,
        ];
        $status = (string) $session['session_status'];
        $started = $t($session['started_at']);
        $ended = $t($session['ended_at']);

        $rows = [];
        switch ($type) {
            case TestType::ABSOLUTE_PITCH:
                foreach ($children as $r) {
                    $isTest = $r['phase'] === 'test';
                    $rows[] = [
                        ...$common, $r['phase'], $status, $started, $ended,
                        $r['question_number'], $r['stimulus_number'], $r['stimulus_note'], $r['stimulus_filename'], $t($r['stimulus_started_at']),
                        $r['correct_response'], $r['response_note'], $t($r['response_at']), $r['response_time_ms'], $r['outcome'],
                        $isTest ? $r['incorrect_total_after_question'] : null,
                        $isTest ? ($attributes['sequenceStartPosition'] ?? null) : null,
                        $isTest ? ($attributes['sequenceStartNumber'] ?? null) : null,
                        $isTest ? ($attributes['sequenceDirection'] ?? null) : null,
                    ];
                }
                break;
            case TestType::RELATIVE_PITCH:
                foreach ($children as $r) {
                    $rows[] = [
                        ...$common, $session['variant'], $r['phase'], $status, $attributes['answerLayout'] ?? null,
                        $started, $ended, $attributes['practiceStatus'] ?? null, $session['planned_count'],
                        $r['question_number'], $r['key_block_number'], $r['key_code'], $r['cadence_filename'], $r['reference_note'], $r['target_note'],
                        $r['interval_semitones'], $r['syllable_code'], $r['display_label'], $r['interval_label'], $r['scale_label'],
                        $t($r['cadence_started_at']), $t($r['reference_started_at']), $t($r['target_started_at']),
                        $r['response_code'], $t($r['response_at']), $r['response_time_ms'], $r['outcome'],
                    ];
                }
                break;
            case TestType::FUNCTIONAL_PITCH:
                foreach ($children as $r) {
                    $rows[] = [
                        ...$common, $status, $started, $ended, $session['variant'], $session['attempt_number'],
                        $r['trial_number'], $r['first_stimulus_id'], $r['second_stimulus_id'], $r['change_condition'], $t($r['trial_started_at']),
                        $r['melody_change_rating'], $r['harmony_change_rating'], $r['overall_change_rating'],
                        $t($r['response_enabled_at']), $t($r['response_confirmed_at']), $r['response_time_ms'], $r['outcome'],
                    ];
                }
                break;
            default:
                foreach ($children as $trial) {
                    foreach ($trial['responses'] as $r) {
                        $rows[] = [
                            ...$common, $session['variant'], $session['attempt_number'], $status, $started, $ended,
                            $attributes['sessionKeyCode'] ?? null, $attributes['keyAssignmentMethod'] ?? null,
                            $trial['trial_number'], $trial['stimulus_id'], $trial['stimulus_version'], $trial['task_template_id'], $trial['key_code'],
                            $r['target_id'], $r['correct_answer_code'], $r['response_code'], $r['outcome'],
                            $trial['question_replay_count'], $trial['feedback_replay_count'],
                            $t($trial['audio_started_at']), $t($trial['audio_ended_at']), $t($trial['response_enabled_at']), $t($trial['response_submitted_at']),
                            $trial['response_time_ms'],
                        ];
                    }
                }
        }
        return $rows;
    }

    /**
     * 履歴 CSV の行（1セッション）。
     *
     * @param array<string, mixed> $session
     * @param array<string, mixed> $m SessionMetrics の値
     * @return list<scalar|null>
     */
    public static function sessionRow(array $session, array $m): array
    {
        $type = (string) $session['test_type'];
        $offset = (int) $session['utc_offset_minutes'];
        $attributes = json_decode((string) $session['attributes'], true) ?: [];
        $common = [Uuid7::toString((string) $session['user_id']), Uuid7::toString((string) $session['id']), $type];
        $started = self::local($session['started_at'], $offset);
        $ended = self::local($session['ended_at'], $offset);
        $status = (string) $session['session_status'];

        return match ($type) {
            TestType::ABSOLUTE_PITCH => [
                ...$common, $started, $ended, $status,
                $m['practice_questions_presented'], $m['practice_timeout_count'], $m['questions_presented'],
                $m['correct_count'], $m['incorrect_answer_count'], $m['timeout_count'], $m['total_incorrect_count'], $m['unpresented_count'],
                $attributes['sequenceStartPosition'] ?? null, $attributes['sequenceStartNumber'] ?? null, $attributes['sequenceDirection'] ?? null,
                $m['interrupted_phase'], $m['interrupted_question_number'],
            ],
            TestType::RELATIVE_PITCH => [
                ...$common, $session['variant'], $started, $ended, $status,
                $attributes['answerLayout'] ?? null, $attributes['practiceStatus'] ?? null,
                $m['practice_questions_presented'], $m['questions_presented'], $m['questions_answered'],
                $m['correct_count'], $m['incorrect_count'], $m['accuracy'],
                $m['interrupted_phase'], $m['interrupted_question_number'],
            ],
            TestType::FUNCTIONAL_PITCH => [
                ...$common, $session['variant'], $session['attempt_number'], $status, $started, $ended,
                $m['practice_trial_count'], $m['answered_trial_count'], $m['total_trial_count'],
            ],
            default => [
                ...$common, $session['variant'], $session['attempt_number'], $status,
                $attributes['sessionKeyCode'] ?? null, $attributes['keyAssignmentMethod'] ?? null, $started, $ended,
                $session['planned_count'], $m['trials_completed'], $m['correct_count'], $m['giveup_count'],
            ],
        };
    }

    /** DB の日時（UTC）を、オフセット付きの形（2026-10-29T08:54:03.875+09:00）にする。 */
    public static function local(mixed $dbValue, int $offsetMinutes): ?string
    {
        if ($dbValue === null || $dbValue === '') {
            return null;
        }
        $utc = new DateTimeImmutable((string) $dbValue, new \DateTimeZone('UTC'));
        $abs = abs($offsetMinutes);
        $zone = sprintf('%s%02d:%02d', $offsetMinutes < 0 ? '-' : '+', intdiv($abs, 60), $abs % 60);
        return $utc->setTimezone(new \DateTimeZone($zone))->format('Y-m-d\TH:i:s.v') . $zone;
    }
}
