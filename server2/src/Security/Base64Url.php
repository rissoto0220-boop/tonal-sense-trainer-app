<?php

declare(strict_types=1);

namespace UecTst\Security;

/** base64url（パディングなし）。WebAuthn の challenge・クレデンシャル ID の受け渡しに使う。 */
final class Base64Url
{
    public static function encode(string $binary): string
    {
        return rtrim(strtr(base64_encode($binary), '+/', '-_'), '=');
    }

    /** 不正な文字列なら null。 */
    public static function decode(string $text): ?string
    {
        if ($text === '' || !preg_match('/^[A-Za-z0-9_-]+$/', $text)) {
            return null;
        }
        $decoded = base64_decode(strtr($text, '-_', '+/'), true);
        return $decoded === false ? null : $decoded;
    }
}
