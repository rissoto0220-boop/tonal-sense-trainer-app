<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Http\ApiException;
use UecTst\Services;
use UecTst\TestData\DataScope;
use UecTst\TestData\SessionView;
use UecTst\TestData\TestType;

/** 一覧と詳細の JSON の組み立て（家族の API と、組織の API で共通）。 */
final class ListPage
{
    /**
     * @param array{rows: list<array<string, mixed>>, next: ?string} $page TestSessionRepository::page の結果
     * @return array{sessions: list<array<string, mixed>>, nextCursor: ?string}
     */
    public static function build(Services $services, array $page): array
    {
        $metrics = $services->sessionMetrics->forSessions($page['rows']);
        return [
            'sessions' => array_map(static fn (array $row): array => SessionView::summary($row, $metrics[(string) $row['id']] ?? []), $page['rows']),
            'nextCursor' => $page['next'],
        ];
    }

    /**
     * セッション1件の詳細。見つからない（範囲外・ユーザ違い・形式不正）場合は 404。
     * $scope は、ユーザを限った範囲（DataScope::user）。
     *
     * @return array<string, mixed>
     */
    public static function detail(Services $services, DataScope $scope, string $sessionId, bool $withUserId): array
    {
        if (!preg_match('/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/', $sessionId)) {
            throw ApiException::notFound('データが見つかりません。');
        }
        $row = $services->testSessions->findVisible($scope, (string) hex2bin(str_replace('-', '', $sessionId)));
        if ($row === null) {
            throw ApiException::notFound('データが見つかりません。');
        }
        $id = (string) $row['id'];
        $type = (string) $row['test_type'];
        $children = $type === TestType::TRAINING
            ? ($services->testSessions->trialsFor([$id])[$id] ?? [])
            : ($services->testSessions->responsesFor($type, [$id])[$id] ?? []);
        $metrics = $type === TestType::TRAINING ? ($services->sessionMetrics->forSessions([$row])[$id] ?? null) : null;
        return SessionView::detail($row, $children, $metrics, $withUserId);
    }
}
