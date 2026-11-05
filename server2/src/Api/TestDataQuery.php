<?php

declare(strict_types=1);

namespace UecTst\Api;

use DateTimeImmutable;
use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\TestData\ExportFormat;
use UecTst\TestData\SessionValidator;
use UecTst\TestData\TestDataFilter;
use UecTst\TestData\TestType;

/** 利用データの API のクエリパラメータの読み取り（ApiSpec_TestData.md 0.5・4.1）。不正な値は 422 VALIDATION_FAILED。 */
final class TestDataQuery
{
    public const MAX_EXPORT_USERS = 100;

    /** @param bool $withUsers true なら、userId（カンマ区切りで複数）も読む。参照できないユーザは、呼び出し側が 404 にする */
    public static function filter(Request $request, bool $withUsers = false): TestDataFilter
    {
        $types = [];
        foreach (self::csvValues($request, 'testType') as $type) {
            if (!TestType::isValid($type)) {
                throw self::invalid('testType');
            }
            $types[] = $type;
        }
        $users = [];
        if ($withUsers) {
            $ids = self::csvValues($request, 'userId');
            if (count($ids) > self::MAX_EXPORT_USERS) {
                throw self::invalid('userId');
            }
            foreach ($ids as $id) {
                // 形式が正しくない ID は、存在しないユーザと同じ扱い（404）にする。
                if (!Uuid7::isValid($id)) {
                    throw ApiException::notFound('ユーザが見つかりません。');
                }
                $users[] = Uuid7::toBinary($id);
            }
        }
        return new TestDataFilter(
            array_values(array_unique($types)),
            array_values(array_unique($users)),
            self::time($request, 'from'),
            self::time($request, 'to'),
            self::bool($request, 'includeInterrupted'),
        );
    }

    public static function limit(Request $request): int
    {
        $value = $request->query['limit'] ?? null;
        if ($value === null || $value === '') {
            return 50;
        }
        if (!preg_match('/^\d{1,3}$/', $value) || (int) $value < 1 || (int) $value > 100) {
            throw self::invalid('limit');
        }
        return (int) $value;
    }

    public static function cursor(Request $request): ?string
    {
        $value = $request->query['cursor'] ?? null;
        return $value === null || $value === '' ? null : $value;
    }

    /** ダウンロードの種別（responses / sessions）。 @return list<string> 指定がなければ、両方 */
    public static function kinds(Request $request, bool $required): array
    {
        $kind = $request->query['kind'] ?? null;
        if ($kind === null || $kind === '') {
            if ($required) {
                throw self::invalid('kind');
            }
            return ExportFormat::KINDS;
        }
        if (!in_array($kind, ExportFormat::KINDS, true)) {
            throw self::invalid('kind');
        }
        return [$kind];
    }

    /** @return list<string> */
    private static function csvValues(Request $request, string $key): array
    {
        $value = $request->query[$key] ?? '';
        return $value === '' ? [] : array_map('trim', explode(',', $value));
    }

    private static function time(Request $request, string $key): ?DateTimeImmutable
    {
        $value = $request->query[$key] ?? null;
        if ($value === null || $value === '') {
            return null;
        }
        $parsed = SessionValidator::parseTime($value);
        if ($parsed === null) {
            throw self::invalid($key);
        }
        return $parsed[0];
    }

    private static function bool(Request $request, string $key): bool
    {
        $value = $request->query[$key] ?? null;
        return match ($value) {
            null, '', 'false', '0' => false,
            'true', '1' => true,
            default => throw self::invalid($key),
        };
    }

    public static function invalid(string $field): ApiException
    {
        return ApiException::validationFailed('入力内容に誤りがあります。', [['field' => $field, 'code' => 'INVALID']]);
    }
}
