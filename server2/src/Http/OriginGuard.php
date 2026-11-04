<?php

declare(strict_types=1);

namespace UecTst\Http;

/**
 * CSRF 対策（ApiSpec_Auth.md 0.3、基本方針 4.3）。
 * 状態を変更するリクエスト（POST・PUT・PATCH・DELETE）で、次をすべて満たさない場合は 403 FORBIDDEN_ORIGIN とする。
 *  - Origin ヘッダが、許可されたオリジンのいずれかと完全に一致する
 *  - Content-Type が application/json である（本文のない DELETE を除く）
 * HTML のフォームからは application/json で送信できないため、SameSite=Lax と合わせて、他サイトからの送信を防ぐ。
 */
final class OriginGuard
{
    private const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];

    /**
     * @param list<string> $allowedOrigins
     */
    public function __construct(private readonly array $allowedOrigins)
    {
    }

    public function check(Request $request): void
    {
        if (!in_array($request->method, self::MUTATING, true)) {
            return;
        }

        $origin = $request->header('origin');
        if ($origin === null || !in_array($origin, $this->allowedOrigins, true)) {
            throw ApiException::forbiddenOrigin();
        }

        // 本文のない DELETE は、Content-Type を求めない。
        $hasBody = ($request->header('content-length') ?? '0') !== '0' || $request->header('transfer-encoding') !== null;
        if ($request->method === 'DELETE' && !$hasBody) {
            return;
        }
        if (!$request->isJson()) {
            throw ApiException::forbiddenOrigin();
        }
    }
}
