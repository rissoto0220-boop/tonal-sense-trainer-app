<?php

declare(strict_types=1);

namespace UecTst\Auth;

/**
 * 認証 Cookie（ApiSpec_Auth.md 0.2）。
 * 属性は、Secure・HttpOnly・SameSite=Lax・Path=/（Domain は付けない）。有効期限は365日。
 * 本番では、__Host- プレフィックスを付ける（Secure・Path=/・Domain なしを、ブラウザが強制する）。
 */
final class CookieFactory
{
    public const MAX_AGE = 31536000; // 365日

    public function __construct(private readonly bool $secure, private readonly bool $useHostPrefix)
    {
    }

    public function name(): string
    {
        return $this->useHostPrefix ? '__Host-sid' : 'sid';
    }

    /** 認証トークンを設定する Set-Cookie の値。 */
    public function set(string $token): string
    {
        return $this->build($token, self::MAX_AGE);
    }

    /** Cookie を削除する Set-Cookie の値（Max-Age=0）。 */
    public function clear(): string
    {
        return $this->build('', 0) . '; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }

    private function build(string $value, int $maxAge): string
    {
        $cookie = sprintf('%s=%s; Max-Age=%d; Path=/; HttpOnly; SameSite=Lax', $this->name(), $value, $maxAge);
        return $this->secure ? $cookie . '; Secure' : $cookie;
    }
}
