<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Auth\AuthContext;
use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Support\Time;
use UecTst\TestData\DataScope;
use UecTst\TestData\ExportFormat;
use UecTst\TestData\SessionValidator;
use UecTst\TestData\SessionView;
use UecTst\TestData\TestType;

/**
 * 家族・ユーザの、利用データ（テスト結果）の API（ApiSpec_TestData.md 1.〜2.）。
 *   #32 送信 POST /users/{userId}/test-sessions
 *   #33 一覧 GET /users/{userId}/test-sessions
 *   #34 詳細 GET /users/{userId}/test-sessions/{sessionId}
 *   #35 CSV GET /users/{userId}/test-exports
 */
final class TestDataController extends AuthenticatedController
{
    public const MAX_BODY_BYTES = 1048576;
    private const SUBMIT_LIMIT = 600;
    private const EXPORT_LIMIT = 30;
    private const WINDOW_SECONDS = 3600;

    /** #32 セッションの送信 */
    public function submit(Request $request, array $params): Response
    {
        return $this->authenticated($request, function (AuthContext $c) use ($request, $params): Response {
            $userId = $this->ownUserId($c, $params);
            $this->limit('testdata:submit:family:' . bin2hex($c->familyId()), self::SUBMIT_LIMIT);
            if ($request->bodyLength() > self::MAX_BODY_BYTES) {
                throw ApiException::payloadTooLarge();
            }
            $session = (new SessionValidator($this->services->clock->now()))->validate($request->json());
            $result = $this->services->testSessions->save($session, $userId, $this->services->clock->now());
            return Response::json($result === 'created' ? 201 : 200, [
                'sessionId' => SessionView::uuid($session->id),
                'testType' => $session->testType,
                'receivedAt' => Time::toIso($this->services->clock->now()),
            ]);
        });
    }

    /** #33 セッションの一覧 */
    public function list(Request $request, array $params): Response
    {
        return $this->authenticated($request, function (AuthContext $c) use ($request, $params): Response {
            $userId = $this->ownUserId($c, $params);
            $filter = TestDataQuery::filter($request);
            $page = $this->services->testSessions->page(DataScope::user($userId), $filter, TestDataQuery::limit($request), TestDataQuery::cursor($request));
            return Response::json(200, ListPage::build($this->services, $page));
        });
    }

    /** #34 セッションの詳細 */
    public function show(Request $request, array $params): Response
    {
        return $this->authenticated($request, function (AuthContext $c) use ($params): Response {
            $userId = $this->ownUserId($c, $params);
            return Response::json(200, ['session' => ListPage::detail($this->services, DataScope::user($userId), $params['sessionId'] ?? '', false)]);
        });
    }

    /** #35 自分のデータの CSV */
    public function export(Request $request, array $params): Response
    {
        return $this->authenticated($request, function (AuthContext $c) use ($request, $params): Response {
            $userId = $this->ownUserId($c, $params);
            $type = $request->query['testType'] ?? '';
            if (!TestType::isValid($type)) {
                throw TestDataQuery::invalid('testType');
            }
            [$kind] = TestDataQuery::kinds($request, true);
            $filter = TestDataQuery::filter($request)->withTestType($type);
            $this->limit('testdata:export:family:' . bin2hex($c->familyId()), self::EXPORT_LIMIT);

            $scope = DataScope::user($userId);
            $this->assertExportable($this->services->testSessions->count($scope, $filter));
            $now = $this->services->clock->now();
            $writer = $this->services->exportWriter;
            return Response::streamed(200, [
                'Content-Type' => 'text/csv; charset=utf-8',
                'Content-Disposition' => 'attachment; filename="uec-tst_' . $type . '_' . $kind . '_' . $now->format('Ymd_His') . '.csv"',
            ], static fn (callable $write) => $writer->writeCsv($write, $scope, $filter, $type, $kind));
        });
    }

    private function ownUserId(AuthContext $c, array $params): string
    {
        $id = (string) ($params['userId'] ?? '');
        if (!Uuid7::isValid($id) || $this->services->users->findInFamily($c->familyId(), Uuid7::toBinary($id)) === null) {
            throw ApiException::notFound('ユーザが見つかりません。');
        }
        return Uuid7::toBinary($id);
    }

    private function limit(string $key, int $max): void
    {
        $hit = $this->services->rateLimiter->hit($key, self::WINDOW_SECONDS);
        if ($hit->count > $max) {
            throw ApiException::rateLimited($hit->retryAfterSeconds);
        }
    }

    private function assertExportable(int $count): void
    {
        if ($count > $this->services->config->exportMaxSessions) {
            throw ApiException::exportTooLarge($count, $this->services->config->exportMaxSessions);
        }
    }
}
