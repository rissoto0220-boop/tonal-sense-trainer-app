<?php

declare(strict_types=1);

namespace UecTst\Auth;

use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Security\Tokens;

/**
 * リクエストの Cookie から、セッションを認証する（ApiSpec_Auth.md 0.2）。
 *  - Cookie がない: 401（Cookie は削除しない）
 *  - セッションが無効・期限切れ: 401 と、Cookie の削除（Max-Age=0）
 *  - 前回の更新から1時間以上たっていれば、有効期限を延長し、Cookie も再設定する（スライディング更新）
 */
final class Authenticator
{
    public function __construct(private readonly SessionService $sessions, private readonly CookieFactory $cookies)
    {
    }

    public function authenticate(Request $request): AuthContext
    {
        $token = $request->cookie($this->cookies->name());
        if ($token === null || $token === '') {
            throw ApiException::unauthenticated();
        }
        if (!Tokens::isWellFormed($token)) {
            throw ApiException::unauthenticated(setCookies: [$this->cookies->clear()]);
        }

        $session = $this->sessions->findByToken($token);
        if ($session === null) {
            throw ApiException::unauthenticated(setCookies: [$this->cookies->clear()]);
        }

        if ($this->sessions->slideIfDue($session)) {
            // 更新後の値を読み直し、Cookie も、新しい有効期限（365日）で再設定する。
            $session = $this->sessions->find($session->id) ?? $session;
            return new AuthContext($session, [$this->cookies->set($token)]);
        }
        return new AuthContext($session);
    }
}
