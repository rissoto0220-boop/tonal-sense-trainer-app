<?php

declare(strict_types=1);

namespace UecTst\Validation;

use UecTst\Http\ApiException;

/** リクエストの JSON から、値を型つきで取り出す。型が違う・必須項目がない場合は 400 BAD_REQUEST。 */
final class Params
{
    /** @param array<string, mixed> $data */
    public static function string(array $data, string $key): string
    {
        $value = $data[$key] ?? null;
        if (!is_string($value)) {
            throw ApiException::badRequest("「{$key}」を文字列で指定してください。");
        }
        return $value;
    }

    /** @param array<string, mixed> $data */
    public static function optionalString(array $data, string $key): ?string
    {
        if (!array_key_exists($key, $data) || $data[$key] === null) {
            return null;
        }
        if (!is_string($data[$key])) {
            throw ApiException::badRequest("「{$key}」を文字列で指定してください。");
        }
        return $data[$key];
    }

    /**
     * @param array<string, mixed> $data
     * @return list<mixed>
     */
    public static function list(array $data, string $key): array
    {
        $value = $data[$key] ?? null;
        if (!is_array($value) || !array_is_list($value)) {
            throw ApiException::badRequest("「{$key}」を配列で指定してください。");
        }
        return $value;
    }
}
