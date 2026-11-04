<?php

declare(strict_types=1);

namespace UecTst\Security;

/**
 * 認証トークン・仮登録トークンなど。256bit の乱数を base64url で表し、DB には SHA-256 のハッシュだけを保存する
 * （TableSpec_Auth.md 0. 共通事項）。
 */
final class Tokens
{
    /** @return string 256bit の乱数の base64url（43文字） */
    public static function generate(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    /** @return string 32バイトのバイナリ（BINARY(32) に保存する） */
    public static function hash(string $token): string
    {
        return hash('sha256', $token, true);
    }

    /** クライアントから受け取ったトークンの、形式の検査（base64url の43文字）。 */
    public static function isWellFormed(string $token): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9_-]{43}$/', $token);
    }
}
