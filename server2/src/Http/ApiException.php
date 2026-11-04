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
     * @param list<string> $setCookies Set-Cookie ヘッダの値（セッションが無効なときの Cookie の削除など）
     */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $details = [],
        public readonly array $headers = [],
        public readonly array $setCookies = [],
    ) {
        parent::__construct($message);
    }

    public static function badRequest(string $message = 'リクエストの形式が正しくありません。'): self
    {
        return new self(400, 'BAD_REQUEST', $message);
    }

    /**
     * @param list<string> $setCookies
     */
    public static function unauthenticated(string $message = 'ログインしていません。', array $setCookies = []): self
    {
        return new self(401, 'UNAUTHENTICATED', $message, [], [], $setCookies);
    }

    public static function elevationRequired(): self
    {
        return new self(403, 'ELEVATION_REQUIRED', 'この操作を行うには、確認が必要です。');
    }

    public static function conflict(string $code, string $message): self
    {
        return new self(409, $code, $message);
    }

    public static function gone(string $code, string $message): self
    {
        return new self(410, $code, $message);
    }

    /** まだ実装していない機能（段階的に実装するための、一時的なもの）。 */
    public static function notImplemented(): self
    {
        return new self(501, 'NOT_IMPLEMENTED', 'この機能は、まだ利用できません。');
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
