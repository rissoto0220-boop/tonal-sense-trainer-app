<?php

declare(strict_types=1);

namespace UecTst\Belonging;

use UecTst\Auth\CookieFactory;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Security\Tokens;

/**
 * リクエストの所属用の Cookie から、所属のセッションを認証する（ApiSpec_Belonging.md 0.2）。
 *  - Cookie がない: 401（Cookie は削除しない）
 *  - セッションが無効・期限切れ: 401 と、Cookie の削除（Max-Age=0）
 *  - ログイン完了後で、前回の更新から5分以上たっていれば、有効期限を延長する（Cookie は有効期限を持たないため、再設定は不要）
 */
final class BlgAuthenticator
{
    public function __construct(
        private readonly BlgSessionService $sessions,
        private readonly BelongingRepository $belongings,
        private readonly CookieFactory $cookies,
    ) {
    }

    public function authenticate(Request $request): BlgAuthContext
    {
        $token = $request->cookie($this->cookies->name());
        if ($token === null || $token === '') {
            throw ApiException::unauthenticated();
        }
        if (!Tokens::isWellFormed($token)) {
            throw ApiException::unauthenticated(setCookies: [$this->cookies->clear()]);
        }

        $session = $this->sessions->findByToken($token);
        $belonging = $session === null ? null : $this->belongings->find($session->belongingId);
        if ($session === null || $belonging === null) {
            throw ApiException::unauthenticated(setCookies: [$this->cookies->clear()]);
        }

        if ($this->sessions->slideIfDue($session)) {
            $session = $this->sessions->find($session->id) ?? $session;
        }
        return new BlgAuthContext($session, $belonging);
    }
}
