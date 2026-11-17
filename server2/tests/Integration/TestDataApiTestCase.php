<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use UecTst\Tests\Support\TestClient;

/** 利用データ（ApiSpec_TestData.md）の結合テストの土台。4種類のセッションの、送信用データを作る。 */
abstract class TestDataApiTestCase extends BlgApiTestCase
{
    protected const AP_ID = '3f2504e0-4f89-4f9d-9a7f-2f1e6b6a2b11';
    protected const RP_ID = '0b8f6c1e-2d3a-4e5f-8a7b-9c0d1e2f3a4b';
    protected const FP_ID = 'f46bc532-4ade-4ce3-a070-58afb7a7de0e';
    protected const TR_ID = '77656c60-150c-41f4-8dd6-46524223f7d9';

    /** 家族を登録して、ユーザ ID（先頭のユーザ）を返す。 */
    protected function familyWithUser(TestClient $client): string
    {
        $family = $this->registerFamily($client)['family'];
        return $family['users'][0]['id'];
    }

    /** @return array<string, mixed> */
    protected function absolutePitch(string $id = self::AP_ID, string $startedAt = '2026-10-29T10:00:00+09:00', string $status = 'completed'): array
    {
        return [
            'sessionId' => $id,
            'testType' => 'absolute_pitch',
            'startedAt' => $startedAt,
            'endedAt' => '2026-10-29T10:05:23+09:00',
            'sessionStatus' => $status,
            'sequenceStartPosition' => 12,
            'sequenceStartNumber' => 13,
            'sequenceDirection' => 'forward',
            'responses' => [
                ['phase' => 'practice', 'questionNumber' => 1, 'stimulusNumber' => 3, 'stimulusNote' => 'D2', 'stimulusFilename' => 'D2.wav',
                    'stimulusStartedAt' => '2026-10-29T10:00:00+09:00', 'correctResponse' => 'D', 'responseNote' => 'D',
                    'responseAt' => '2026-10-29T10:00:01+09:00', 'responseTimeMs' => 812, 'outcome' => 'correct', 'incorrectTotalAfterQuestion' => ''],
                ['phase' => 'test', 'questionNumber' => 1, 'stimulusNumber' => 5, 'stimulusNote' => 'F4', 'stimulusFilename' => 'F4.wav',
                    'stimulusStartedAt' => '2026-10-29T10:01:00.250+09:00', 'correctResponse' => 'F', 'responseNote' => 'G',
                    'responseAt' => '2026-10-29T10:01:02+09:00', 'responseTimeMs' => 1500, 'outcome' => 'incorrect', 'incorrectTotalAfterQuestion' => 1],
                ['phase' => 'test', 'questionNumber' => 2, 'stimulusNumber' => 6, 'stimulusNote' => 'A#6', 'stimulusFilename' => 'A#6.wav',
                    'stimulusStartedAt' => '2026-10-29T10:01:10+09:00', 'correctResponse' => 'A#', 'responseNote' => '',
                    'responseAt' => '', 'responseTimeMs' => '', 'outcome' => 'timeout', 'incorrectTotalAfterQuestion' => 2],
            ],
        ];
    }

    /** @return array<string, mixed> */
    protected function relativePitch(string $id = self::RP_ID): array
    {
        return [
            'sessionId' => $id,
            'testType' => 'relative_pitch',
            'testVersion' => 'simplified',
            'startedAt' => '2026-10-29T11:00:00+09:00',
            'endedAt' => '2026-10-29T11:05:00+09:00',
            'sessionStatus' => 'completed',
            'answerLayout' => 'circular',
            'practiceStatus' => 'completed',
            'generatedQuestionOrder' => [1, 2, 3, 4],
            'responses' => [
                ['phase' => 'test', 'questionNumber' => 1, 'keyCode' => 'C', 'keyBlockNumber' => 1, 'cadenceFilename' => 'cadence_C.wav',
                    'referenceNote' => 'C4', 'targetNote' => 'E4', 'intervalSemitones' => 4, 'syllableCode' => 'MiM', 'displayLabel' => 'ミ',
                    'intervalLabel' => 'short', 'scaleLabel' => null, 'cadenceStartedAt' => '2026-10-29T11:00:00+09:00',
                    'referenceStartedAt' => '2026-10-29T11:00:03+09:00', 'targetStartedAt' => '2026-10-29T11:00:04+09:00',
                    'responseCode' => 4, 'responseAt' => '2026-10-29T11:00:06+09:00', 'responseTimeMs' => 1200, 'outcome' => 'correct'],
                ['phase' => 'test', 'questionNumber' => 2, 'keyCode' => 'D', 'keyBlockNumber' => 1, 'cadenceFilename' => 'cadence_D.wav',
                    'referenceNote' => 'D4', 'targetNote' => 'G4', 'intervalSemitones' => 5, 'syllableCode' => 'FaM', 'displayLabel' => 'ファ',
                    'intervalLabel' => '', 'scaleLabel' => '', 'cadenceStartedAt' => '2026-10-29T11:01:00+09:00',
                    'referenceStartedAt' => '', 'targetStartedAt' => '', 'responseCode' => '', 'responseAt' => '', 'responseTimeMs' => '', 'outcome' => 'interrupted'],
            ],
        ];
    }

    /** @return array<string, mixed> */
    protected function functionalPitch(string $id = self::FP_ID): array
    {
        return [
            'sessionId' => $id,
            'testType' => 'functional_pitch',
            'startedAt' => '2026-10-29T09:00:01.488+09:00',
            'endedAt' => '2026-10-29T09:20:30+09:00',
            'sessionStatus' => 'completed',
            'measurementKeyCode' => 'Fis',
            'attemptNumber' => 1,
            'totalTrialCount' => 90,
            'generatedTrialOrder' => [
                ['trialNumber' => 1, 'firstStimulusId' => 'ch-n1-maj-mel-n1', 'secondStimulusId' => 'ch-n5-dom7-mel-n5', 'changeCondition' => 'both-change'],
            ],
            'practiceResults' => [['trial' => 1, 'rating' => 3], ['trial' => 2, 'rating' => 5]],
            'responses' => [
                ['trialNumber' => 1, 'firstStimulusId' => 'ch-n1-maj-mel-n1', 'secondStimulusId' => 'ch-n5-dom7-mel-n5', 'changeCondition' => 'both-change',
                    'trialStartedAt' => '2026-10-29T09:00:01.489+09:00', 'melodyChangeRating' => 2, 'harmonyChangeRating' => 2, 'overallChangeRating' => 2,
                    'responseEnabledAt' => '2026-10-29T09:00:12.595+09:00', 'responseConfirmedAt' => '2026-10-29T09:00:21.347+09:00',
                    'responseTimeMs' => 8748, 'outcome' => 'answered'],
                ['trialNumber' => 2, 'firstStimulusId' => 'a', 'secondStimulusId' => 'b', 'changeCondition' => 'melody-change',
                    'trialStartedAt' => '2026-10-29T09:00:21.347+09:00', 'melodyChangeRating' => '', 'harmonyChangeRating' => '', 'overallChangeRating' => '',
                    'responseEnabledAt' => '', 'responseConfirmedAt' => '', 'responseTimeMs' => '', 'outcome' => 'interrupted'],
            ],
        ];
    }

    /** @return array<string, mixed> */
    protected function training(string $id = self::TR_ID): array
    {
        $trial = static fn (int $n, string $code, ?string $response, string $outcome): array => [
            'trialNumber' => $n, 'stimulusId' => 'st-n6-ch-n4-maj', 'stimulusVersion' => '01', 'taskTemplateId' => 'tt-chord-first', 'keyCode' => 'C',
            'questionReplayCount' => 0, 'feedbackReplayCount' => 1,
            'audioStartedAt' => '2026-10-29T08:55:27.952+09:00', 'audioEndedAt' => '2026-10-29T08:55:29.952+09:00',
            'responseEnabledAt' => '2026-10-29T08:55:29.952+09:00', 'responseSubmittedAt' => '2026-10-29T08:55:31.416+09:00', 'responseTimeMs' => 1462,
            'responses' => [['targetId' => 't1', 'correctAnswerCode' => $code, 'responseCode' => $response, 'outcome' => $outcome]],
            'scoring' => ['targetCount' => 1, 'correctTargetCount' => 0, 'accuracy' => 0, 'allCorrect' => false],
        ];
        return [
            'sessionId' => $id,
            'testType' => 'training',
            'startedAt' => '2026-10-29T08:54:00.000+09:00',
            'endedAt' => '2026-10-29T08:57:10.000+09:00',
            'sessionStatus' => 'completed',
            'menuId' => 'menu-06',
            'attemptNumber' => 1,
            'sessionKeyCode' => 'C',
            'keyAssignmentMethod' => 'fixed',
            'trialsPlanned' => 15,
            'trials' => [$trial(1, 'n4', 'n4', 'correct'), $trial(2, 'n4', 'n5', 'incorrect'), $trial(3, 'n5', null, 'giveup')],
        ];
    }

    protected function submit(TestClient $client, string $userId, array $session): \UecTst\Tests\Support\TestResponse
    {
        return $client->post("/api/v1/users/{$userId}/test-sessions", $session);
    }

    protected function countRows(string $table): int
    {
        return (int) $this->pdo->query("SELECT COUNT(*) FROM {$table}")->fetchColumn();
    }
}
