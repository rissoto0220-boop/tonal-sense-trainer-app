<?php

declare(strict_types=1);

namespace UecTst\Http;

use RuntimeException;

/**
 * API のエラー（ApiSpec_Auth.md 0.5）。HTTP ステータス・コード・利用者向けのメッセージ・項目ごとの詳細を持つ。
 */
class ApiException extends RuntimeException
{
    /**
     * @param list<array{field: string, code: string}> $details 入力エラーの項目ごとの詳細
     * @param array<string, string> $headers 追加のレスポンスヘッダ（Retry-After など）
     */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $details = [],
        public readonly array $headers = [],
    ) {
        parent::__construct($message);
    }

    public static function badRequest(string $message = 'リクエストの形式が正しくありません。'): self
    {
        return new self(400, 'BAD_REQUEST', $message);
    }

    public static function unauthenticated(string $message = 'ログインしていません。'): self
    {
        return new self(401, 'UNAUTHENTICATED', $message);
    }

    public static function forbiddenOrigin(): self
    {
        return new self(403, 'FORBIDDEN_ORIGIN', 'このリクエストは受け付けられません。');
    }

    public static function notFound(string $message = '対象が見つかりません。'): self
    {
        return new self(404, 'NOT_FOUND', $message);
    }

    public static function methodNotAllowed(string $allow): self
    {
        return new self(405, 'METHOD_NOT_ALLOWED', 'このパスでは、このメソッドは使えません。', [], ['Allow' => $allow]);
    }

    /**
     * @param list<array{field: string, code: string}> $details
     */
    public static function validationFailed(string $message, array $details = []): self
    {
        return new self(422, 'VALIDATION_FAILED', $message, $details);
    }

    public static function rateLimited(int $retryAfterSeconds): self
    {
        return new self(429, 'RATE_LIMITED', 'しばらく時間をおいてから、もう一度お試しください。', [], ['Retry-After' => (string) max(1, $retryAfterSeconds)]);
    }

    public static function internal(): self
    {
        return new self(500, 'INTERNAL_ERROR', 'サーバでエラーが発生しました。しばらくしてから、もう一度お試しください。');
    }
}
