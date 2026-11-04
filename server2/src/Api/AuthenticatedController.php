<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Auth\AuthContext;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Services;

/** ログインが必要な API の共通処理。認証して、有効期限を延長した場合は、Cookie の再設定をレスポンスに付ける。 */
abstract class AuthenticatedController
{
    public function __construct(protected readonly Services $services)
    {
    }

    /**
     * @param callable(AuthContext): Response $handler
     */
    protected function authenticated(Request $request, callable $handler): Response
    {
        $context = $this->services->authenticator->authenticate($request);
        $response = $handler($context);
        // ハンドラ自身が Cookie を設定した（ログアウトで削除した）場合は、有効期限の延長用の Cookie を付けない。
        if ($context->setCookies === [] || $response->setCookies !== []) {
            return $response;
        }
        return $response->withAddedHeaders([], $context->setCookies);
    }

    /**
     * 家族向けの重要な操作（基本方針 9.2）は、確認（#15）から5分以内の端末でのみ実行できる。
     * ほかの検証（404・409 など）より先に判定する（ApiSpec_Auth.md 0.5）。
     */
    protected function requireElevation(AuthContext $context): void
    {
        if (!$context->session->isElevated($this->services->clock->now())) {
            throw ApiException::elevationRequired();
        }
    }

    /** パスキーの challenge の発行は、セッション単位で 30回／10分まで（ApiSpec_Auth.md 9.）。 */
    protected function limitChallenges(AuthContext $context): void
    {
        $hit = $this->services->rateLimiter->hit('webauthn:challenge:' . bin2hex($context->session->id), 600);
        if ($hit->count > 30) {
            throw ApiException::rateLimited($hit->retryAfterSeconds);
        }
    }
}
