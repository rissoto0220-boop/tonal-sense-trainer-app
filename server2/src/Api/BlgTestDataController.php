<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Belonging\BlgAuthContext;
use UecTst\Support\Time;
use UecTst\TestData\DataScope;
use UecTst\TestData\ExportFormat;
use UecTst\TestData\TestType;

/**
 * 運用担当者・所属の、利用データ（テスト結果）の API（ApiSpec_TestData.md 3.〜5.）。
 *   B22 ユーザの一覧 GET /blg/users
 *   B23 セッションの一覧 GET /blg/users/{userId}/test-sessions
 *   B24 セッションの詳細 GET /blg/users/{userId}/test-sessions/{sessionId}
 *   B25 ダウンロード GET /blg/test-exports
 *   B26 セッションの削除 DELETE /blg/test-sessions/{sessionId}（運用担当者のみ・確認が必要）
 *
 * 参照できる範囲は、リクエストのたびに、現在の所属関係で判定する。参照できないユーザは、存在しない場合と区別せず 404。
 */
final class BlgTestDataController extends BlgController
{
    private const EXPORT_LIMIT = 30;
    private const WINDOW_SECONDS = 3600;

    /** B22 参照できるユーザの一覧 */
    public function users(Request $request): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c) use ($request): Response {
            $limit = TestDataQuery::limit($request);
            $after = TestDataQuery::cursor($request);
            $afterId = null;
            if ($after !== null) {
                if (!Uuid7::isValid($after)) {
                    throw TestDataQuery::invalid('cursor');
                }
                $afterId = Uuid7::toBinary($after);
            }
            $isSuper = $c->belonging->isSuper;
            $rows = $this->services->testSessions->users($isSuper ? null : $c->belongingId(), $limit, $afterId);
            $next = null;
            if (count($rows) > $limit) {
                array_pop($rows);
                $next = Uuid7::toString((string) $rows[$limit - 1]['user_id']);
            }
            $users = array_map(static function (array $r) use ($isSuper): array {
                $user = [
                    'userId' => Uuid7::toString((string) $r['user_id']),
                    'name' => $r['name'],
                    'sessionCount' => (int) $r['session_count'],
                    'lastSessionAt' => $r['last_started_at'] === null ? null : Time::dbToIso((string) $r['last_started_at']),
                ];
                if ($isSuper) {
                    $user['belonging'] = $r['belonging_name'] === null ? null : ['name' => $r['belonging_name']];
                }
                return $user;
            }, $rows);
            $this->audit('test_data.users', $c->belongingId(), 'success', ['count' => count($users)]);
            return Response::json(200, ['users' => $users, 'nextCursor' => $next]);
        });
    }

    /** B23 ユーザのセッションの一覧 */
    public function sessions(Request $request, array $params): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c) use ($request, $params): Response {
            $userId = $this->visibleUserId($c, $params);
            $filter = TestDataQuery::filter($request);
            $page = $this->services->testSessions->page(DataScope::user($userId), $filter, TestDataQuery::limit($request), TestDataQuery::cursor($request));
            $this->audit('test_data.sessions', $c->belongingId(), 'success', ['userId' => Uuid7::toString($userId), 'count' => count($page['rows'])]);
            return Response::json(200, ListPage::build($this->services, $page));
        });
    }

    /** B24 セッションの詳細 */
    public function session(Request $request, array $params): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c) use ($params): Response {
            $userId = $this->visibleUserId($c, $params);
            $session = ListPage::detail($this->services, DataScope::user($userId), $params['sessionId'] ?? '', true);
            $this->audit('test_data.session', $c->belongingId(), 'success', ['userId' => Uuid7::toString($userId), 'sessionId' => $session['sessionId']]);
            return Response::json(200, ['session' => $session]);
        });
    }

    /** B25 CSV・ZIP のダウンロード */
    public function export(Request $request): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c) use ($request): Response {
            $format = $request->query['format'] ?? 'zip';
            if (!in_array($format, ['zip', 'csv'], true)) {
                throw TestDataQuery::invalid('format');
            }
            $filter = TestDataQuery::filter($request, true);
            $kinds = TestDataQuery::kinds($request, false);
            if ($format === 'csv' && (count($filter->userIds) !== 1 || count($filter->testTypes) !== 1 || count($kinds) !== 1)) {
                throw TestDataQuery::invalid('format');
            }

            $belongingId = $c->belonging->isSuper ? null : $c->belongingId();
            foreach ($filter->userIds as $userId) {
                if (!$this->services->testSessions->userVisible($belongingId, $userId)) {
                    throw ApiException::notFound('ユーザが見つかりません。');
                }
            }
            $hit = $this->services->rateLimiter->hit('testdata:export:blg:' . bin2hex($c->belongingId()), self::WINDOW_SECONDS);
            if ($hit->count > self::EXPORT_LIMIT) {
                throw ApiException::rateLimited($hit->retryAfterSeconds);
            }

            $scope = $belongingId === null ? DataScope::all() : DataScope::belonging($belongingId);
            $count = $this->services->testSessions->count($scope, $filter);
            $limit = $this->services->config->exportMaxSessions;
            if ($count > $limit) {
                throw ApiException::exportTooLarge($count, $limit);
            }
            $this->audit('test_data.export', $c->belongingId(), 'success', [
                'format' => $format,
                'userCount' => count($filter->userIds),
                'testTypes' => implode(',', $filter->testTypes),
                'kinds' => implode(',', $kinds),
                'from' => $filter->from === null ? null : Time::toIso($filter->from),
                'to' => $filter->to === null ? null : Time::toIso($filter->to),
                'sessionCount' => $count,
            ]);

            $now = $this->services->clock->now();
            $stamp = $now->format('Ymd_His');
            $writer = $this->services->exportWriter;
            if ($format === 'csv') {
                $type = $filter->testTypes[0];
                $kind = $kinds[0];
                return Response::streamed(200, [
                    'Content-Type' => 'text/csv; charset=utf-8',
                    'Content-Disposition' => 'attachment; filename="uec-tst_' . $type . '_' . $kind . '_' . $stamp . '.csv"',
                ], static fn (callable $write) => $writer->writeCsv($write, $scope, $filter, $type, $kind));
            }
            return Response::streamed(200, [
                'Content-Type' => 'application/zip',
                'Content-Disposition' => 'attachment; filename="uec-tst_test-data_' . $stamp . '.zip"',
            ], static fn (callable $write) => $writer->writeZip($write, $scope, $filter, $kinds, $now));
        });
    }

    /** B26 セッションの削除（運用担当者のみ。確認が必要） */
    public function delete(Request $request, array $params): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c) use ($params): Response {
            $this->requireElevation($c);
            $sessionId = (string) ($params['sessionId'] ?? '');
            if (!preg_match('/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/', $sessionId)) {
                throw ApiException::notFound('データが見つかりません。');
            }
            $id = (string) hex2bin(str_replace('-', '', $sessionId));
            $owner = $this->services->testSessions->ownerOf($id);
            if ($owner === null || !$this->services->testSessions->delete($id)) {
                throw ApiException::notFound('データが見つかりません。');
            }
            $this->audit('test_data.delete', $c->belongingId(), 'success', ['sessionId' => strtolower($sessionId), 'userId' => Uuid7::toString($owner)]);
            return Response::noContent();
        }, superOnly: true);
    }

    /** パスの userId を検証し、この所属が参照できるユーザなら、バイナリで返す（そうでなければ 404）。 */
    private function visibleUserId(BlgAuthContext $c, array $params): string
    {
        $userId = self::idParam($params, 'userId');
        $belongingId = $c->belonging->isSuper ? null : $c->belongingId();
        if ($userId === null || !$this->services->testSessions->userVisible($belongingId, $userId)) {
            throw ApiException::notFound('ユーザが見つかりません。');
        }
        return $userId;
    }
}
