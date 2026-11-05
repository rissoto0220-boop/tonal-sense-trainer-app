<?php

declare(strict_types=1);

namespace UecTst\TestData;

use DateTimeImmutable;
use DateTimeZone;
use UecTst\Http\ApiException;
use UecTst\Support\Time;

/**
 * 送信されたセッション（DataFormat_TestData.md、ApiSpec_TestData.md 1.2）の検証と正規化。
 *
 * 方針: クライアントの記録は、あとから取り直せない。厳しすぎる検証で拒否すると、データが失われるため、
 * 「キーがあること・型・列の長さ・列挙値・日時の形」だけを検証する。空文字と null は、どちらも「なし」として受け取る。
 */
final class SessionValidator
{
    public const MAX_ITEMS = 200;
    public const MAX_PRACTICE_RESULTS = 100;
    public const MAX_TARGETS = 10;
    private const MAX_ERRORS = 20;

    /** @var list<array{field: string, code: string}> */
    private array $errors = [];

    public function __construct(private readonly DateTimeImmutable $now)
    {
    }

    /**
     * @param array<string, mixed> $body
     * @throws ApiException 422 VALIDATION_FAILED
     */
    public function validate(array $body): ValidatedSession
    {
        $this->errors = [];

        $type = $body['testType'] ?? null;
        if (!is_string($type) || !TestType::isValid($type)) {
            $this->error('testType', is_string($type) ? 'INVALID' : 'REQUIRED');
            $this->fail();
        }

        $id = $this->uuid($body, 'sessionId');
        [$startedAt, $offset] = $this->time($body, 'startedAt', 'startedAt', true);
        [$endedAt] = $this->time($body, 'endedAt', 'endedAt', true);
        $status = $this->enum($body, 'sessionStatus', 'sessionStatus', TestType::statuses($type));
        if ($startedAt !== null && $endedAt !== null && $startedAt > $endedAt) {
            $this->error('endedAt', 'INVALID');
        }
        if ($startedAt !== null && $startedAt > $this->now->modify('+1 day')) {
            $this->error('startedAt', 'INVALID');
        }

        $detail = match ($type) {
            TestType::ABSOLUTE_PITCH => $this->absolutePitch($body),
            TestType::RELATIVE_PITCH => $this->relativePitch($body),
            TestType::FUNCTIONAL_PITCH => $this->functionalPitch($body),
            default => $this->training($body),
        };

        $this->fail();
        return new ValidatedSession(
            $id ?? '',
            $type,
            $status ?? '',
            $detail['variant'],
            $detail['attemptNumber'],
            $detail['plannedCount'],
            $startedAt,
            $endedAt,
            $offset ?? 0,
            $detail['attributes'],
            $detail['rows'],
            $detail['trials'],
        );
    }

    // ---- 種類ごと ----

    /** @return array{variant: ?string, attemptNumber: ?int, plannedCount: ?int, attributes: array<string, mixed>, rows: list<array<string, mixed>>, trials: list<array<string, mixed>>} */
    private function absolutePitch(array $b): array
    {
        $attributes = [];
        foreach (['sequenceStartPosition', 'sequenceStartNumber', 'sequenceDirection'] as $key) {
            $value = $b[$key] ?? null;
            if ($value === null || $value === '') {
                continue;
            }
            if (!is_int($value) && !(is_string($value) && strlen($value) <= 32)) {
                $this->error($key, 'INVALID');
                continue;
            }
            $attributes[$key] = $value;
        }

        $rows = [];
        foreach ($this->items($b, 'responses', self::MAX_ITEMS) as $i => $r) {
            $p = "responses[{$i}]";
            $rows[] = [
                'seq' => $i,
                'phase' => $this->enum($r, 'phase', "{$p}.phase", ['practice', 'test']),
                'question_number' => $this->int($r, 'questionNumber', "{$p}.questionNumber", true, 65535),
                'stimulus_number' => $this->int($r, 'stimulusNumber', "{$p}.stimulusNumber", true, 65535),
                'stimulus_note' => $this->string($r, 'stimulusNote', "{$p}.stimulusNote", 8, true),
                'stimulus_filename' => $this->string($r, 'stimulusFilename', "{$p}.stimulusFilename", 64, true),
                'stimulus_started_at' => $this->dbTime($r, 'stimulusStartedAt', "{$p}.stimulusStartedAt", true),
                'correct_response' => $this->string($r, 'correctResponse', "{$p}.correctResponse", 8, true),
                'response_note' => $this->nullableString($r, 'responseNote', "{$p}.responseNote", 8),
                'response_at' => $this->dbTime($r, 'responseAt', "{$p}.responseAt", false),
                'response_time_ms' => $this->int($r, 'responseTimeMs', "{$p}.responseTimeMs", false, 4294967295),
                'outcome' => $this->enum($r, 'outcome', "{$p}.outcome", ['correct', 'incorrect', 'timeout', 'interrupted']),
                'incorrect_total_after_question' => $this->int($r, 'incorrectTotalAfterQuestion', "{$p}.incorrectTotalAfterQuestion", false, 65535),
            ];
        }
        return $this->detail(null, null, TestType::ABSOLUTE_PITCH_TOTAL_QUESTIONS, $attributes, $rows);
    }

    private function relativePitch(array $b): array
    {
        $version = $this->enum($b, 'testVersion', 'testVersion', ['simplified', 'full']);
        $layout = $this->string($b, 'answerLayout', 'answerLayout', 32, true);
        if ($layout !== null && !preg_match('/^[a-z_]*$/', $layout)) {
            $this->error('answerLayout', 'INVALID');
        }
        if (!array_key_exists('practiceStatus', $b)) {
            $this->error('practiceStatus', 'REQUIRED');
        }
        $practiceStatus = $b['practiceStatus'] ?? null;
        if ($practiceStatus === '') {
            $practiceStatus = null;
        }
        if ($practiceStatus !== null && !in_array($practiceStatus, ['completed', 'skipped', 'interrupted'], true)) {
            $this->error('practiceStatus', 'INVALID');
        }

        $order = [];
        foreach ($this->items($b, 'generatedQuestionOrder', self::MAX_ITEMS, false) as $i => $value) {
            if (!is_int($value)) {
                $this->error("generatedQuestionOrder[{$i}]", 'INVALID');
                continue;
            }
            $order[] = $value;
        }

        $rows = [];
        foreach ($this->items($b, 'responses', self::MAX_ITEMS) as $i => $r) {
            $p = "responses[{$i}]";
            $rows[] = [
                'seq' => $i,
                'phase' => $this->enum($r, 'phase', "{$p}.phase", ['practice', 'test']),
                'question_number' => $this->int($r, 'questionNumber', "{$p}.questionNumber", true, 65535),
                'key_block_number' => $this->int($r, 'keyBlockNumber', "{$p}.keyBlockNumber", false, 65535),
                'key_code' => $this->string($r, 'keyCode', "{$p}.keyCode", 8, true),
                'cadence_filename' => $this->string($r, 'cadenceFilename', "{$p}.cadenceFilename", 64, true),
                'reference_note' => $this->string($r, 'referenceNote', "{$p}.referenceNote", 8, true),
                'target_note' => $this->string($r, 'targetNote', "{$p}.targetNote", 8, true),
                'interval_semitones' => $this->int($r, 'intervalSemitones', "{$p}.intervalSemitones", true, 32767, -32768),
                'syllable_code' => $this->string($r, 'syllableCode', "{$p}.syllableCode", 16, true),
                'display_label' => $this->string($r, 'displayLabel', "{$p}.displayLabel", 16, true),
                'interval_label' => $this->nullableString($r, 'intervalLabel', "{$p}.intervalLabel", 16),
                'scale_label' => $this->nullableString($r, 'scaleLabel', "{$p}.scaleLabel", 16),
                'cadence_started_at' => $this->dbTime($r, 'cadenceStartedAt', "{$p}.cadenceStartedAt", false),
                'reference_started_at' => $this->dbTime($r, 'referenceStartedAt', "{$p}.referenceStartedAt", false),
                'target_started_at' => $this->dbTime($r, 'targetStartedAt', "{$p}.targetStartedAt", false),
                'response_code' => $this->int($r, 'responseCode', "{$p}.responseCode", false, 32767, -32768),
                'response_at' => $this->dbTime($r, 'responseAt', "{$p}.responseAt", false),
                'response_time_ms' => $this->int($r, 'responseTimeMs', "{$p}.responseTimeMs", false, 4294967295),
                'outcome' => $this->enum($r, 'outcome', "{$p}.outcome", ['correct', 'incorrect', 'interrupted']),
            ];
        }
        return $this->detail($version, null, count($order), [
            'answerLayout' => $layout,
            'practiceStatus' => $practiceStatus,
            'generatedQuestionOrder' => $order,
        ], $rows);
    }

    private function functionalPitch(array $b): array
    {
        $key = $this->string($b, 'measurementKeyCode', 'measurementKeyCode', 8, true);
        $attempt = $this->int($b, 'attemptNumber', 'attemptNumber', true, 65535);
        $total = $this->int($b, 'totalTrialCount', 'totalTrialCount', true, 65535);

        $order = [];
        foreach ($this->items($b, 'generatedTrialOrder', self::MAX_ITEMS, false) as $i => $t) {
            $p = "generatedTrialOrder[{$i}]";
            if (!is_array($t) || array_is_list($t) && $t !== []) {
                $this->error($p, 'INVALID');
                continue;
            }
            $order[] = [
                'trialNumber' => $this->int($t, 'trialNumber', "{$p}.trialNumber", true, 65535),
                'firstStimulusId' => $this->string($t, 'firstStimulusId', "{$p}.firstStimulusId", 64, true),
                'secondStimulusId' => $this->string($t, 'secondStimulusId', "{$p}.secondStimulusId", 64, true),
                'changeCondition' => $this->string($t, 'changeCondition', "{$p}.changeCondition", 24, true),
            ];
        }

        $practice = [];
        if (array_key_exists('practiceResults', $b) && $b['practiceResults'] !== null) {
            if (!is_array($b['practiceResults']) || !array_is_list($b['practiceResults'])) {
                $this->error('practiceResults', 'INVALID');
            } elseif (count($b['practiceResults']) > self::MAX_PRACTICE_RESULTS) {
                $this->error('practiceResults', 'TOO_MANY');
            } else {
                $practice = $b['practiceResults'];
            }
        }

        $rows = [];
        $seen = [];
        foreach ($this->items($b, 'responses', self::MAX_ITEMS) as $i => $r) {
            $p = "responses[{$i}]";
            $number = $this->int($r, 'trialNumber', "{$p}.trialNumber", true, 65535);
            if ($number !== null) {
                if (isset($seen[$number])) {
                    $this->error("{$p}.trialNumber", 'DUPLICATE');
                }
                $seen[$number] = true;
            }
            $rows[] = [
                'trial_number' => $number,
                'first_stimulus_id' => $this->string($r, 'firstStimulusId', "{$p}.firstStimulusId", 64, true),
                'second_stimulus_id' => $this->string($r, 'secondStimulusId', "{$p}.secondStimulusId", 64, true),
                'change_condition' => $this->string($r, 'changeCondition', "{$p}.changeCondition", 24, true),
                'trial_started_at' => $this->dbTime($r, 'trialStartedAt', "{$p}.trialStartedAt", false),
                'melody_change_rating' => $this->int($r, 'melodyChangeRating', "{$p}.melodyChangeRating", false, 255),
                'harmony_change_rating' => $this->int($r, 'harmonyChangeRating', "{$p}.harmonyChangeRating", false, 255),
                'overall_change_rating' => $this->int($r, 'overallChangeRating', "{$p}.overallChangeRating", false, 255),
                'response_enabled_at' => $this->dbTime($r, 'responseEnabledAt', "{$p}.responseEnabledAt", false),
                'response_confirmed_at' => $this->dbTime($r, 'responseConfirmedAt', "{$p}.responseConfirmedAt", false),
                'response_time_ms' => $this->int($r, 'responseTimeMs', "{$p}.responseTimeMs", false, 4294967295),
                'outcome' => $this->enum($r, 'outcome', "{$p}.outcome", ['answered', 'interrupted']),
            ];
        }
        return $this->detail($key, $attempt, $total, [
            'generatedTrialOrder' => $order,
            'practiceResults' => $practice,
        ], $rows);
    }

    private function training(array $b): array
    {
        $menu = $this->string($b, 'menuId', 'menuId', 32, true);
        $attempt = $this->int($b, 'attemptNumber', 'attemptNumber', true, 65535);
        $keyCode = $this->string($b, 'sessionKeyCode', 'sessionKeyCode', 8, true);
        $method = $this->string($b, 'keyAssignmentMethod', 'keyAssignmentMethod', 32, true);
        $planned = $this->int($b, 'trialsPlanned', 'trialsPlanned', true, 65535);

        $trials = [];
        $seen = [];
        foreach ($this->items($b, 'trials', self::MAX_ITEMS) as $i => $t) {
            $p = "trials[{$i}]";
            $number = $this->int($t, 'trialNumber', "{$p}.trialNumber", true, 65535);
            if ($number !== null) {
                if (isset($seen[$number])) {
                    $this->error("{$p}.trialNumber", 'DUPLICATE');
                }
                $seen[$number] = true;
            }
            $responses = [];
            $targets = [];
            foreach ($this->items($t, 'responses', self::MAX_TARGETS, true, 1, "{$p}.responses") as $j => $r) {
                $rp = "{$p}.responses[{$j}]";
                $targetId = $this->string($r, 'targetId', "{$rp}.targetId", 32, true);
                if ($targetId !== null) {
                    if (isset($targets[$targetId])) {
                        $this->error("{$rp}.targetId", 'DUPLICATE');
                    }
                    $targets[$targetId] = true;
                }
                $outcome = $this->enum($r, 'outcome', "{$rp}.outcome", ['correct', 'incorrect', 'giveup']);
                $code = $this->nullableString($r, 'responseCode', "{$rp}.responseCode", 16);
                // 「わからない」は、回答コードがなく、回答コードがなければ「わからない」（DB の CHECK 制約と同じ）。
                if ($outcome !== null && ($outcome === 'giveup') !== ($code === null)) {
                    $this->error("{$rp}.responseCode", 'INVALID');
                }
                $responses[] = [
                    'trial_number' => $number,
                    'target_id' => $targetId,
                    'correct_answer_code' => $this->string($r, 'correctAnswerCode', "{$rp}.correctAnswerCode", 16, true),
                    'response_code' => $code,
                    'outcome' => $outcome,
                ];
            }
            $trials[] = [
                'trial' => [
                    'trial_number' => $number,
                    'stimulus_id' => $this->string($t, 'stimulusId', "{$p}.stimulusId", 64, true),
                    'stimulus_version' => $this->string($t, 'stimulusVersion', "{$p}.stimulusVersion", 8, true),
                    'task_template_id' => $this->string($t, 'taskTemplateId', "{$p}.taskTemplateId", 64, true),
                    'key_code' => $this->string($t, 'keyCode', "{$p}.keyCode", 8, true),
                    'question_replay_count' => $this->int($t, 'questionReplayCount', "{$p}.questionReplayCount", true, 65535),
                    'feedback_replay_count' => $this->int($t, 'feedbackReplayCount', "{$p}.feedbackReplayCount", true, 65535),
                    'audio_started_at' => $this->dbTime($t, 'audioStartedAt', "{$p}.audioStartedAt", false),
                    'audio_ended_at' => $this->dbTime($t, 'audioEndedAt', "{$p}.audioEndedAt", false),
                    'response_enabled_at' => $this->dbTime($t, 'responseEnabledAt', "{$p}.responseEnabledAt", false),
                    'response_submitted_at' => $this->dbTime($t, 'responseSubmittedAt', "{$p}.responseSubmittedAt", false),
                    'response_time_ms' => $this->int($t, 'responseTimeMs', "{$p}.responseTimeMs", false, 4294967295),
                ],
                'responses' => $responses,
            ];
        }
        $result = $this->detail($menu, $attempt, $planned, ['sessionKeyCode' => $keyCode, 'keyAssignmentMethod' => $method], []);
        $result['trials'] = $trials;
        return $result;
    }

    /** @return array{variant: ?string, attemptNumber: ?int, plannedCount: ?int, attributes: array<string, mixed>, rows: list<array<string, mixed>>, trials: list<array<string, mixed>>} */
    private function detail(?string $variant, ?int $attempt, ?int $planned, array $attributes, array $rows): array
    {
        return ['variant' => $variant, 'attemptNumber' => $attempt, 'plannedCount' => $planned, 'attributes' => $attributes, 'rows' => $rows, 'trials' => []];
    }

    // ---- 項目の取り出し ----

    private function error(string $field, string $code): void
    {
        if (count($this->errors) < self::MAX_ERRORS) {
            $this->errors[] = ['field' => $field, 'code' => $code];
        }
    }

    private function fail(): void
    {
        if ($this->errors !== []) {
            throw ApiException::validationFailed('送信されたデータの形式が正しくありません。', $this->errors);
        }
    }

    /**
     * 配列の項目を取り出す。各要素は、オブジェクト（連想配列）であること。
     *
     * @return array<int, mixed>
     */
    private function items(array $o, string $key, int $max, bool $objects = true, int $min = 0, ?string $path = null): array
    {
        $path ??= $key;
        if (!array_key_exists($key, $o)) {
            $this->error($path, 'REQUIRED');
            return [];
        }
        $list = $o[$key];
        if (!is_array($list) || ($list !== [] && !array_is_list($list))) {
            $this->error($path, 'INVALID');
            return [];
        }
        if (count($list) > $max) {
            $this->error($path, 'TOO_MANY');
            return [];
        }
        if (count($list) < $min) {
            $this->error($path, 'REQUIRED');
            return [];
        }
        if ($objects) {
            foreach ($list as $i => $item) {
                if (!is_array($item) || ($item !== [] && array_is_list($item))) {
                    $this->error("{$path}[{$i}]", 'INVALID');
                    return [];
                }
            }
        }
        return $list;
    }

    private function uuid(array $o, string $key): ?string
    {
        $value = $o[$key] ?? null;
        if (!is_string($value) || !preg_match('/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/', $value)) {
            $this->error($key, $value === null ? 'REQUIRED' : 'INVALID');
            return null;
        }
        return hex2bin(str_replace('-', '', $value)) ?: null;
    }

    /** NOT NULL の文字列の列。キーがあり、文字列であること（空文字は許す）。 */
    private function string(array $o, string $key, string $path, int $max, bool $required): ?string
    {
        if (!array_key_exists($key, $o)) {
            if ($required) {
                $this->error($path, 'REQUIRED');
            }
            return null;
        }
        $value = $o[$key];
        if (!is_string($value) || mb_strlen($value) > $max) {
            $this->error($path, 'INVALID');
            return null;
        }
        return $value;
    }

    /** NULL を許す文字列の列。キーがなくても、空文字・null でもよい（すべて null）。 */
    private function nullableString(array $o, string $key, string $path, int $max): ?string
    {
        $value = $o[$key] ?? null;
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_string($value) || mb_strlen($value) > $max) {
            $this->error($path, 'INVALID');
            return null;
        }
        return $value;
    }

    private function enum(array $o, string $key, string $path, array $allowed): ?string
    {
        $value = $o[$key] ?? null;
        if ($value === null) {
            $this->error($path, 'REQUIRED');
            return null;
        }
        if (!is_string($value) || !in_array($value, $allowed, true)) {
            $this->error($path, 'INVALID');
            return null;
        }
        return $value;
    }

    /**
     * 整数の列。required なら、キーがあり整数であること。そうでなければ、キーがなくても、空文字・null でもよい（null）。
     */
    private function int(array $o, string $key, string $path, bool $required, int $max, int $min = 0): ?int
    {
        if (!array_key_exists($key, $o) || $o[$key] === null || $o[$key] === '') {
            if ($required) {
                $this->error($path, 'REQUIRED');
            }
            return null;
        }
        $value = $o[$key];
        if (is_float($value) && floor($value) === $value && abs($value) < 1e15) {
            $value = (int) $value;
        }
        if (!is_int($value) || $value < $min || $value > $max) {
            $this->error($path, 'INVALID');
            return null;
        }
        return $value;
    }

    /**
     * 日時（DB に保存する形式の文字列）。required なら、キーがあること（値は空でもよい）。
     * 値がある場合は、オフセット付きの ISO 8601 であること。
     */
    private function dbTime(array $o, string $key, string $path, bool $keyRequired): ?string
    {
        if (!array_key_exists($key, $o)) {
            if ($keyRequired) {
                $this->error($path, 'REQUIRED');
            }
            return null;
        }
        if ($o[$key] === null || $o[$key] === '') {
            return null;
        }
        [$time] = $this->time($o, $key, $path, false);
        return $time === null ? null : self::toDb($time);
    }

    /**
     * @return array{0: ?DateTimeImmutable, 1: ?int} UTC の日時と、元のオフセット（分）
     */
    private function time(array $o, string $key, string $path, bool $required): array
    {
        $value = $o[$key] ?? null;
        if ($value === null || $value === '') {
            if ($required) {
                $this->error($path, 'REQUIRED');
            }
            return [null, null];
        }
        $parsed = is_string($value) ? self::parseTime($value) : null;
        if ($parsed === null) {
            $this->error($path, 'INVALID');
            return [null, null];
        }
        return $parsed;
    }

    /**
     * ISO 8601（秒まで必須。小数秒は任意。オフセット必須）を、UTC の日時にする。ミリ秒未満は切り捨てる。
     *
     * @return array{0: DateTimeImmutable, 1: int}|null
     */
    public static function parseTime(string $value): ?array
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/', $value, $m)) {
            return null;
        }
        [, $y, $mo, $d, $h, $mi, $s] = $m;
        if ((int) $y < 2000 || (int) $y > 2100 || !checkdate((int) $mo, (int) $d, (int) $y) || (int) $h > 23 || (int) $mi > 59 || (int) $s > 59) {
            return null;
        }
        $zone = $m[8];
        if ($zone === 'Z') {
            $minutes = 0;
            $zone = '+00:00';
        } else {
            $minutes = ((int) substr($zone, 1, 2)) * 60 + (int) substr($zone, 4, 2);
            if ((int) substr($zone, 4, 2) > 59) {
                return null;
            }
            if ($zone[0] === '-') {
                $minutes = -$minutes;
            }
        }
        if ($minutes < -720 || $minutes > 840) {
            return null;
        }
        $millis = str_pad(substr($m[7] ?? '', 0, 3), 3, '0');
        $time = new DateTimeImmutable("{$y}-{$mo}-{$d}T{$h}:{$mi}:{$s}.{$millis}{$zone}");
        return [$time->setTimezone(new DateTimeZone('UTC')), $minutes];
    }

    /** DATETIME(3) に保存する形式（UTC）。 */
    public static function toDb(DateTimeImmutable $time): string
    {
        return $time->setTimezone(Time::utc())->format('Y-m-d H:i:s.v');
    }
}
