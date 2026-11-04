<?php

declare(strict_types=1);

namespace UecTst\Security;

/**
 * スーパーユーザのパスワードのハッシュ（Argon2id、TableSpec_Account.md 2.3）。
 * OWASP の推奨値（メモリ 19 MiB、反復2回、並列度1）。ソルトとパラメータを含む PHC 形式の文字列で保存する。
 */
final class PasswordHasher
{
    public const OPS_LIMIT = 2;
    public const MEM_LIMIT_BYTES = 19 * 1024 * 1024;

    public function hash(string $password): string
    {
        return sodium_crypto_pwhash_str($password, self::OPS_LIMIT, self::MEM_LIMIT_BYTES);
    }

    public function verify(string $hash, string $password): bool
    {
        return sodium_crypto_pwhash_str_verify($hash, $password);
    }

    /** 推奨値が変わったときに、ログイン成功のついでに作り直すか。 */
    public function needsRehash(string $hash): bool
    {
        return sodium_crypto_pwhash_str_needs_rehash($hash, self::OPS_LIMIT, self::MEM_LIMIT_BYTES);
    }
}
