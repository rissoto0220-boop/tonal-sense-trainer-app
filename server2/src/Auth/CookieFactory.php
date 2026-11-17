<?php

declare(strict_types=1);

namespace UecTst\Auth;

/**
 * 認証 Cookie（ApiSpec_Auth.md 0.2、ApiSpec_Belonging.md 0.2）。
 * 属性は、Secure・HttpOnly・SameSite=Lax・Path=/（Domain は付けない）。
 * 家族の Cookie は有効期限が365日、所属の Cookie は有効期限を持たない（セッション Cookie。$maxAge = null）。
 * 本番では、__Host- プレフィックスを付ける（Secure・Path=/・Domain なしを、ブラウザが強制する）。
 */
final class CookieFactory
{
    public const MAX_AGE = 31536000; // 365日

    /**
     * @param string $baseName プレフィックスなしの Cookie 名（家族: sid、所属: blg-sid）
     * @param int|null $maxAge 有効期限（秒）。null なら付けない（ブラウザを閉じると消える）
     */
    public function __construct(
        private readonly bool $secure,
        private readonly bool $useHostPrefix,
        private readonly string $baseName = 'sid',
        private readonly ?int $maxAge = self::MAX_AGE,
    ) {
    }

    public function name(): string
    {
        return ($this->useHostPrefix ? '__Host-' : '') . $this->baseName;
    }

    /** 認証トークンを設定する Set-Cookie の値。 */
    public function set(string $token): string
    {
        return $this->build($token, $this->maxAge);
    }

    /** Cookie を削除する Set-Cookie の値（Max-Age=0）。 */
    public function clear(): string
    {
        return $this->build('', 0) . '; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }

    private function build(string $value, ?int $maxAge): string
    {
        $cookie = sprintf('%s=%s; ', $this->name(), $value) . ($maxAge === null ? '' : sprintf('Max-Age=%d; ', $maxAge)) . 'Path=/; HttpOnly; SameSite=Lax';
        return $this->secure ? $cookie . '; Secure' : $cookie;
    }
}
