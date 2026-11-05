<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use UecTst\App;
use UecTst\Config\AppConfig;
use UecTst\Log\Logger;
use UecTst\Services;
use UecTst\Tests\Support\TestCaptcha;
use UecTst\Tests\Unit\Config\AppConfigTest;

/** 家族・ユーザの、利用データの API（#32〜#35）。 */
final class TestDataFamilyTest extends TestDataApiTestCase
{
    public function testSubmitAllFourTypesAndReadThemBack(): void
    {
        $c = $this->client();
        $userId = $this->familyWithUser($c);

        foreach ([$this->absolutePitch(), $this->relativePitch(), $this->functionalPitch(), $this->training()] as $session) {
            $r = $this->submit($c, $userId, $session);
            $this->assertSame(201, $r->status(), $r->body());
            $this->assertSame($session['sessionId'], $r->json()['sessionId']);
            $this->assertSame($session['testType'], $r->json()['testType']);
        }
        $this->assertSame(4, $this->countRows('test_sessions'));
        $this->assertSame(3, $this->countRows('absolute_pitch_responses'));
        $this->assertSame(2, $this->countRows('relative_pitch_responses'));
        $this->assertSame(2, $this->countRows('functional_pitch_responses'));
        $this->assertSame(3, $this->countRows('training_trials'));
        $this->assertSame(3, $this->countRows('training_trial_responses'));

        // 日時は UTC で保存される（+09:00 の 10:00 は、01:00 UTC）。
        $startedAt = $this->pdo->query("SELECT started_at FROM test_sessions WHERE test_type = 'absolute_pitch'")->fetchColumn();
        $this->assertSame('2026-10-29 01:00:00.000', $startedAt);
        $this->assertSame(540, (int) $this->pdo->query("SELECT utc_offset_minutes FROM test_sessions WHERE test_type = 'absolute_pitch'")->fetchColumn());

        // 詳細
        $detail = $c->get("/api/v1/users/{$userId}/test-sessions/" . self::AP_ID);
        $this->assertSame(200, $detail->status(), $detail->body());
        $session = $detail->json()['session'];
        $this->assertSame('2026-10-29T01:00:00.000Z', $session['startedAt']);
        $this->assertSame(540, $session['utcOffsetMinutes']);
        $this->assertSame(12, $session['sequenceStartPosition']);
        $this->assertCount(3, $session['responses']);
        $this->assertNull($session['responses'][2]['responseAt']);
        $this->assertSame('2026-10-29T01:01:00.250Z', $session['responses'][1]['stimulusStartedAt']);

        $training = $c->get("/api/v1/users/{$userId}/test-sessions/" . self::TR_ID)->json()['session'];
        $this->assertSame('menu-06', $training['menuId']);
        $this->assertSame(3, $training['trialsCompleted']);
        $this->assertSame(1, $training['correctCount']);
        $this->assertSame(1, $training['giveupCount']);
        $this->assertNull($training['trials'][2]['responses'][0]['responseCode']);
        $this->assertTrue($training['trials'][0]['scoring']['allCorrect']);
        $this->assertFalse($training['trials'][1]['scoring']['allCorrect']);

        $functional = $c->get("/api/v1/users/{$userId}/test-sessions/" . self::FP_ID)->json()['session'];
        $this->assertCount(2, $functional['practiceResults']);
        $this->assertSame('Fis', $functional['measurementKeyCode']);

        $relative = $c->get("/api/v1/users/{$userId}/test-sessions/" . self::RP_ID)->json()['session'];
        $this->assertSame([1, 2, 3, 4], $relative['generatedQuestionOrder']);
        $this->assertNull($relative['responses'][1]['responseCode']);
    }

    public function testResubmittingTheSameSessionIsHarmless(): void
    {
        $c = $this->client();
        $userId = $this->familyWithUser($c);
        $this->assertSame(201, $this->submit($c, $userId, $this->absolutePitch())->status());

        $changed = $this->absolutePitch();
        $changed['responses'] = [];
        $again = $this->submit($c, $userId, $changed);
        $this->assertSame(200, $again->status(), $again->body());
        // 保存済みの内容は、変わらない。
        $this->assertSame(3, $this->countRows('absolute_pitch_responses'));
        $this->assertSame(1, $this->countRows('test_sessions'));
    }

    public function testSameSessionIdFromAnotherFamilyIsAConflict(): void
    {
        $a = $this->client('198.51.100.1');
        $userA = $this->familyWithUser($a);
        $this->assertSame(201, $this->submit($a, $userA, $this->absolutePitch())->status());

        $b = $this->client('198.51.100.2');
        $this->mailer = new \UecTst\Tests\Support\RecordingMailer();
        $this->services = new Services($this->services->config, $this->pdo, $this->clock, $this->mailer, new TestCaptcha(), new Logger($this->logFile));
        $this->kernel = App::createKernelWith($this->services);
        $b = $this->client('198.51.100.2');
        $userB = $this->familyWithUser($b);
        $this->assertError($this->submit($b, $userB, $this->absolutePitch()), 409, 'SESSION_ID_CONFLICT');
        $this->assertSame(1, $this->countRows('test_sessions'));
    }

    public function testAuthenticationAndOwnership(): void
    {
        $c = $this->client();
        $userId = $this->familyWithUser($c);

        $anonymous = $this->client('198.51.100.9');
        $this->assertError($this->submit($anonymous, $userId, $this->absolutePitch()), 401, 'UNAUTHENTICATED');
        $this->assertError($anonymous->get("/api/v1/users/{$userId}/test-sessions"), 401, 'UNAUTHENTICATED');

        // 他の家族のユーザ・存在しないユーザ・形式が違う ID は、区別せず 404。
        foreach (['0192f3a0-7c1e-7b52-9d4e-3a5b6c7d8e9f', 'not-a-uuid'] as $other) {
            $this->assertError($this->submit($c, $other, $this->absolutePitch()), 404, 'NOT_FOUND');
            $this->assertError($c->get("/api/v1/users/{$other}/test-sessions"), 404, 'NOT_FOUND');
            $this->assertError($c->get("/api/v1/users/{$other}/test-sessions/" . self::AP_ID), 404, 'NOT_FOUND');
            $this->assertError($c->get("/api/v1/users/{$other}/test-exports?testType=training&kind=responses"), 404, 'NOT_FOUND');
        }
        $this->assertSame(0, $this->countRows('test_sessions'));
    }

    public function testDeletedUserCanNoLongerBeUsedButDataRemains(): void
    {
        $c = $this->client();
        $family = $this->registerFamily($c, ['おとうさん', 'はなこ']);
        $parent = $family['family']['users'][0]['id'];
        $child = $family['family']['users'][1]['id'];
        $this->assertSame(201, $this->submit($c, $child, $this->training())->status());

        $this->elevate($c, $family['recoveryCode']);
        $this->assertSame(204, $c->delete("/api/v1/users/{$child}")->status());

        $this->assertSame(1, $this->countRows('test_sessions'));
        $this->assertError($this->submit($c, $child, $this->absolutePitch()), 404, 'NOT_FOUND');
        $this->assertError($c->get("/api/v1/users/{$child}/test-sessions"), 404, 'NOT_FOUND');
        // 残ったユーザの一覧には、削除されたユーザのデータは出ない。
        $this->assertSame([], $c->get("/api/v1/users/{$parent}/test-sessions")->json()['sessions']);
    }

    public function testValidation(): void
    {
        $c = $this->client();
        $userId = $this->familyWithUser($c);

        $bad = static function (array $session, callable $mutate): array {
            $mutate($session);
            return $session;
        };
        $cases = [
            'unknown type' => [$this->absolutePitch(), fn (&$s) => $s['testType'] = 'nope', 'testType'],
            'missing sessionId' => [$this->absolutePitch(), function (&$s): void { unset($s['sessionId']); }, 'sessionId'],
            'bad uuid' => [$this->absolutePitch(), fn (&$s) => $s['sessionId'] = 'xyz', 'sessionId'],
            'no offset' => [$this->absolutePitch(), fn (&$s) => $s['startedAt'] = '2026-10-29T10:00:00', 'startedAt'],
            'empty endedAt' => [$this->absolutePitch(), fn (&$s) => $s['endedAt'] = '', 'endedAt'],
            'ended before started' => [$this->absolutePitch(), fn (&$s) => $s['endedAt'] = '2026-10-29T09:00:00+09:00', 'endedAt'],
            'far future' => [$this->absolutePitch(), fn (&$s) => $s['startedAt'] = '2030-01-01T00:00:00+09:00', 'startedAt'],
            'impossible date' => [$this->absolutePitch(), fn (&$s) => $s['startedAt'] = '2026-02-30T10:00:00+09:00', 'startedAt'],
            'bad offset' => [$this->absolutePitch(), fn (&$s) => $s['startedAt'] = '2026-10-29T10:00:00+15:00', 'startedAt'],
            'status not allowed for type' => [$this->training(), fn (&$s) => $s['sessionStatus'] = 'forced_termination', 'sessionStatus'],
            'audio_error not for relative' => [$this->relativePitch(), fn (&$s) => $s['sessionStatus'] = 'audio_error', 'sessionStatus'],
            'bad outcome' => [$this->absolutePitch(), fn (&$s) => $s['responses'][0]['outcome'] = 'maybe', 'responses[0].outcome'],
            'missing required response field' => [$this->absolutePitch(), function (&$s): void { unset($s['responses'][1]['stimulusNote']); }, 'responses[1].stimulusNote'],
            'negative time' => [$this->absolutePitch(), fn (&$s) => $s['responses'][0]['responseTimeMs'] = -5, 'responses[0].responseTimeMs'],
            'responses not a list' => [$this->absolutePitch(), fn (&$s) => $s['responses'] = 'x', 'responses'],
            'bad answer layout' => [$this->relativePitch(), fn (&$s) => $s['answerLayout'] = 'Circular!', 'answerLayout'],
            'bad version' => [$this->relativePitch(), fn (&$s) => $s['testVersion'] = 'half', 'testVersion'],
            'missing practiceStatus key' => [$this->relativePitch(), function (&$s): void { unset($s['practiceStatus']); }, 'practiceStatus'],
            'duplicate functional trial' => [$this->functionalPitch(), fn (&$s) => $s['responses'][1]['trialNumber'] = 1, 'responses[1].trialNumber'],
            'training giveup with a code' => [$this->training(), fn (&$s) => $s['trials'][2]['responses'][0]['responseCode'] = 'n5', 'trials[2].responses[0].responseCode'],
            'training correct without a code' => [$this->training(), fn (&$s) => $s['trials'][0]['responses'][0]['responseCode'] = null, 'trials[0].responses[0].responseCode'],
            'training trial without targets' => [$this->training(), fn (&$s) => $s['trials'][0]['responses'] = [], 'trials[0].responses'],
            'training duplicate target' => [$this->training(), function (&$s): void { $s['trials'][0]['responses'][] = $s['trials'][0]['responses'][0]; }, 'trials[0].responses[1].targetId'],
        ];
        foreach ($cases as $name => [$session, $mutate, $field]) {
            $mutate($session);
            $r = $this->submit($c, $userId, $session);
            $this->assertError($r, 422, 'VALIDATION_FAILED');
            $fields = array_column($r->json()['error']['details'], 'field');
            $this->assertContains($field, $fields, $name . ': ' . $r->body());
        }
        $this->assertSame(0, $this->countRows('test_sessions'));

        // 配列が多すぎる。
        $many = $this->absolutePitch();
        $many['responses'] = array_fill(0, 201, $many['responses'][1]);
        $r = $this->submit($c, $userId, $many);
        $this->assertError($r, 422, 'VALIDATION_FAILED');
        $this->assertSame('TOO_MANY', $r->json()['error']['details'][0]['code']);

        // JSON でない本文・オブジェクトでない本文は 400。
        $this->assertError($c->request('POST', "/api/v1/users/{$userId}/test-sessions", null, ['content-type' => 'application/json']), 422, 'VALIDATION_FAILED');
    }

    public function testOversizedPayloadIsRejectedBeforeParsing(): void
    {
        $c = $this->client();
        $userId = $this->familyWithUser($c);
        $session = $this->absolutePitch();
        $session['responses'][0]['stimulusFilename'] = str_repeat('x', 1100000);
        $this->assertError($this->submit($c, $userId, $session), 413, 'PAYLOAD_TOO_LARGE');
        $this->assertSame(0, $this->countRows('test_sessions'));
    }

    public function testListFiltersAndPaging(): void
    {
        $c = $this->client();
        $userId = $this->familyWithUser($c);
        $this->submit($c, $userId, $this->absolutePitch('aaaaaaaa-0000-4000-8000-000000000001', '2026-10-01T10:00:00+09:00'));
        $this->submit($c, $userId, $this->absolutePitch('aaaaaaaa-0000-4000-8000-000000000002', '2026-10-02T10:00:00+09:00'));
        $this->submit($c, $userId, $this->absolutePitch('aaaaaaaa-0000-4000-8000-000000000003', '2026-10-03T10:00:00+09:00', 'interrupted'));
        $this->submit($c, $userId, $this->training());

        $base = "/api/v1/users/{$userId}/test-sessions";
        // 中断は、既定では除く。新しい順。
        $all = $c->get($base)->json();
        $this->assertSame([self::TR_ID, 'aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001'], array_column($all['sessions'], 'sessionId'));
        $this->assertCount(4, $c->get($base . '?includeInterrupted=true')->json()['sessions']);
        $this->assertCount(3, $c->get($base . '?testType=absolute_pitch&includeInterrupted=true')->json()['sessions']);
        // 期間（from 以上、to 未満。UTC）。
        $range = $c->get($base . '?testType=absolute_pitch&from=' . rawurlencode('2026-10-02T00:00:00+09:00') . '&to=' . rawurlencode('2026-10-03T00:00:00+09:00'))->json();
        $this->assertSame(['aaaaaaaa-0000-4000-8000-000000000002'], array_column($range['sessions'], 'sessionId'));

        // ページング
        $first = $c->get($base . '?includeInterrupted=true&limit=3')->json();
        $this->assertCount(3, $first['sessions']);
        $this->assertNotNull($first['nextCursor']);
        $second = $c->get($base . '?includeInterrupted=true&limit=3&cursor=' . rawurlencode($first['nextCursor']))->json();
        $this->assertCount(1, $second['sessions']);
        $this->assertNull($second['nextCursor']);
        $this->assertSame('aaaaaaaa-0000-4000-8000-000000000001', $second['sessions'][0]['sessionId']);

        foreach (['limit=0', 'limit=101', 'testType=x', 'from=yesterday', 'includeInterrupted=maybe', 'cursor=@@@'] as $bad) {
            $this->assertError($c->get($base . '?' . $bad), 422, 'VALIDATION_FAILED');
        }
    }

    public function testSummaries(): void
    {
        $c = $this->client();
        $userId = $this->familyWithUser($c);
        foreach ([$this->absolutePitch(), $this->relativePitch(), $this->functionalPitch(), $this->training()] as $s) {
            $this->submit($c, $userId, $s);
        }
        $sessions = $c->get("/api/v1/users/{$userId}/test-sessions?includeInterrupted=true")->json()['sessions'];
        $byType = array_column($sessions, null, 'testType');

        $this->assertSame(['questionsPresented' => 2, 'correctCount' => 0, 'incorrectAnswerCount' => 1, 'timeoutCount' => 1], $byType['absolute_pitch']['summary']);
        $this->assertSame(60, $byType['absolute_pitch']['plannedCount']);
        $this->assertEquals(['questionsPresented' => 2, 'questionsAnswered' => 1, 'correctCount' => 1, 'incorrectCount' => 0, 'accuracy' => 25.0], $byType['relative_pitch']['summary']);
        $this->assertSame('simplified', $byType['relative_pitch']['variant']);
        $this->assertSame(4, $byType['relative_pitch']['plannedCount']);
        $this->assertSame(['answeredTrialCount' => 1, 'totalTrialCount' => 90], $byType['functional_pitch']['summary']);
        $this->assertSame('Fis', $byType['functional_pitch']['variant']);
        $this->assertSame(['trialsCompleted' => 3, 'correctCount' => 1, 'giveupCount' => 1], $byType['training']['summary']);
        $this->assertSame('menu-06', $byType['training']['variant']);
        $this->assertSame(1, $byType['training']['attemptNumber']);
    }

    public function testCsvExportOfTraining(): void
    {
        $c = $this->client();
        $userId = $this->familyWithUser($c);
        $this->submit($c, $userId, $this->training());

        $r = $c->get("/api/v1/users/{$userId}/test-exports?testType=training&kind=responses");
        $this->assertSame(200, $r->status(), $r->body());
        $this->assertSame('text/csv; charset=utf-8', $r->header('Content-Type'));
        $this->assertMatchesRegularExpression('/^attachment; filename="uec-tst_training_responses_\d{8}_\d{6}\.csv"$/', (string) $r->header('Content-Disposition'));
        $body = $r->body();
        $this->assertStringStartsWith("\xEF\xBB\xBF", $body);
        $lines = explode("\r\n", rtrim(substr($body, 3), "\r\n"));
        $this->assertCount(4, $lines);
        $this->assertSame(
            'user_id,session_id,test_type,menu_id,attempt_number,session_status,session_started_at,session_ended_at,session_key_code,key_assignment_method,trial_number,stimulus_id,stimulus_version,task_template_id,key_code,target_id,correct_answer_code,response_code,outcome,question_replay_count,feedback_replay_count,audio_started_at,audio_ended_at,response_enabled_at,response_submitted_at,response_time_ms',
            $lines[0],
        );
        $first = str_getcsv($lines[1], ',', '"', '');
        $this->assertSame($userId, $first[0]);
        $this->assertSame(self::TR_ID, $first[1]);
        $this->assertSame('2026-10-29T08:54:00.000+09:00', $first[6]);
        $this->assertSame('1', $first[10]);
        $this->assertSame('t1', $first[15]);
        $this->assertSame('2026-10-29T08:55:27.952+09:00', $first[21]);
        // 「わからない」は、回答コードが空欄
        $third = str_getcsv($lines[3], ',', '"', '');
        $this->assertSame('', $third[17]);
        $this->assertSame('giveup', $third[18]);

        $sessions = $c->get("/api/v1/users/{$userId}/test-exports?testType=training&kind=sessions")->body();
        $row = str_getcsv(explode("\r\n", substr($sessions, 3))[1], ',', '"', '');
        $this->assertSame(['training', 'menu-06', '1', 'completed'], array_slice($row, 2, 4));
        $this->assertSame(['15', '3', '1', '1'], array_slice($row, 10, 4));
    }

    public function testCsvExportWithNoDataHasOnlyTheHeader(): void
    {
        $c = $this->client();
        $userId = $this->familyWithUser($c);
        $r = $c->get("/api/v1/users/{$userId}/test-exports?testType=absolute_pitch&kind=sessions");
        $this->assertSame(200, $r->status());
        $this->assertCount(1, explode("\r\n", rtrim(substr($r->body(), 3), "\r\n")));
    }

    public function testCsvExportRulesForAbsolutePitch(): void
    {
        $c = $this->client();
        $userId = $this->familyWithUser($c);
        $this->submit($c, $userId, $this->absolutePitch());
        $lines = explode("\r\n", rtrim(substr($c->get("/api/v1/users/{$userId}/test-exports?testType=absolute_pitch&kind=responses")->body(), 3), "\r\n"));
        $this->assertCount(4, $lines);
        $practice = str_getcsv($lines[1], ',', '"', '');
        $test = str_getcsv($lines[2], ',', '"', '');
        // 練習の行は、誤答の累計・出題順の列が空欄
        $this->assertSame(['', '', '', ''], array_slice($practice, 17, 4));
        $this->assertSame(['1', '12', '13', 'forward'], array_slice($test, 17, 4));
        $this->assertSame('2026-10-29T10:01:00.250+09:00', $test[11]);

        $history = str_getcsv(explode("\r\n", substr($c->get("/api/v1/users/{$userId}/test-exports?testType=absolute_pitch&kind=sessions")->body(), 3))[1], ',', '"', '');
        // practice_questions_presented, practice_timeout_count, questions_presented, correct, incorrect, timeout, total_incorrect, unpresented
        $this->assertSame(['1', '0', '2', '0', '1', '1', '2', '58'], array_slice($history, 6, 8));
    }

    public function testExportValidationAndLimit(): void
    {
        $c = $this->client();
        $userId = $this->familyWithUser($c);
        $base = "/api/v1/users/{$userId}/test-exports";
        foreach (['', '?testType=training', '?kind=responses', '?testType=x&kind=responses', '?testType=training&kind=all'] as $bad) {
            $this->assertError($c->get($base . $bad), 422, 'VALIDATION_FAILED');
        }

        // 上限（AppConfig.json の testData.exportMaxSessions）を超える範囲は、出力を始める前に断る。
        $config = AppConfig::fromArray(['testData' => ['exportMaxSessions' => 2]] + AppConfigTest::dev() + ['logFile' => $this->logFile]);
        $this->services = new Services($config, $this->pdo, $this->clock, $this->mailer, new TestCaptcha(), new Logger($this->logFile));
        $this->kernel = App::createKernelWith($this->services);
        $c->cookies = $c->cookies; // 同じ Cookie（セッションは DB にある）
        $limited = new \UecTst\Tests\Support\TestClient($this->kernel);
        $limited->cookies = $c->cookies;
        for ($i = 1; $i <= 3; $i++) {
            $this->assertSame(201, $this->submit($limited, $userId, $this->absolutePitch(sprintf('bbbbbbbb-0000-4000-8000-%012d', $i), "2026-10-0{$i}T10:00:00+09:00"))->status());
        }
        $r = $limited->get($base . '?testType=absolute_pitch&kind=sessions');
        $this->assertError($r, 422, 'EXPORT_TOO_LARGE');
        $this->assertStringContainsString('3件', $r->json()['error']['message']);
        $this->assertStringContainsString('2件', $r->json()['error']['message']);
        // 期間を絞れば取り出せる。
        $ok = $limited->get($base . '?testType=absolute_pitch&kind=sessions&to=' . rawurlencode('2026-10-03T00:00:00+09:00'));
        $this->assertSame(200, $ok->status());
    }

    public function testRateLimit(): void
    {
        $c = $this->client();
        $userId = $this->familyWithUser($c);
        $base = "/api/v1/users/{$userId}/test-exports?testType=training&kind=sessions";
        for ($i = 0; $i < 30; $i++) {
            $this->assertSame(200, $c->get($base)->status());
        }
        $r = $c->get($base);
        $this->assertError($r, 429, 'RATE_LIMITED');
        $this->assertNotNull($r->header('Retry-After'));
    }
}
