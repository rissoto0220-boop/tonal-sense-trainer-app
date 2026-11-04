<?php

declare(strict_types=1);

namespace UecTst\Auth;

/** 認証済みのリクエストの文脈。有効期限を延長した場合は、レスポンスに付ける Set-Cookie を持つ。 */
final class AuthContext
{
    /**
     * @param list<string> $setCookies
     */
    public function __construct(
        public readonly Session $session,
        public readonly array $setCookies = [],
    ) {
    }

    /** ログイン中の家族の ID（16バイトのバイナリ）。 */
    public function familyId(): string
    {
        return $this->session->familyId;
    }
}
