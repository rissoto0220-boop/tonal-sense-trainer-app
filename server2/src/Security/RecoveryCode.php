<?php

declare(strict_types=1);

namespace UecTst\Security;

/**
 * 復旧コード（基本方針 6.1、ApiSpec_Auth.md 0.6）。
 * Crockford Base32 の25文字（乱数24文字＋チェック用1文字、Luhn mod 32）を、5文字ずつハイフンで区切る。
 * 例: 7K3QM-X9TPA-H2W8R-DF6NB-4CJZ3
 */
final class RecoveryCode
{
    public const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    public const LENGTH = 25;
    private const RANDOM_LENGTH = 24;

    /** 新しい復旧コード（正規化済みの25文字）を生成する。 */
    public static function generate(): string
    {
        $payload = '';
        for ($i = 0; $i < self::RANDOM_LENGTH; $i++) {
            $payload .= self::ALPHABET[random_int(0, 31)];
        }
        return $payload . self::checkCharacter($payload);
    }

    /** 乱数24文字から、チェック用の文字（25文字目）を求める。 */
    public static function checkCharacter(string $payload): string
    {
        $factor = 2;
        $sum = 0;
        for ($i = strlen($payload) - 1; $i >= 0; $i--) {
            $sum += self::luhnTerm($factor * strpos(self::ALPHABET, $payload[$i]));
            $factor = $factor === 2 ? 1 : 2;
        }
        return self::ALPHABET[(32 - ($sum % 32)) % 32];
    }

    /** 25文字すべての検査（チェック用の文字が正しいか）。文字の種類・長さは、validate() で先に検査する。 */
    public static function hasValidCheckCharacter(string $code): bool
    {
        $factor = 1;
        $sum = 0;
        for ($i = strlen($code) - 1; $i >= 0; $i--) {
            $sum += self::luhnTerm($factor * strpos(self::ALPHABET, $code[$i]));
            $factor = $factor === 2 ? 1 : 2;
        }
        return $sum % 32 === 0;
    }

    private static function luhnTerm(int $value): int
    {
        return intdiv($value, 32) + ($value % 32);
    }

    /** 画面に表示する形式（5文字ずつハイフン区切り）。 */
    public static function format(string $normalized): string
    {
        return implode('-', str_split($normalized, 5));
    }

    /**
     * 入力を正規化する（ApiSpec_Auth.md 0.6）。
     *  1. ハイフン（全角の －・ー を含む）と空白（全角を含む）を除去する
     *  2. 全角英数字を半角にし、小文字を大文字にする
     *  3. O → 0、I・L → 1
     */
    public static function normalize(string $input): string
    {
        $s = mb_convert_kana($input, 'as', 'UTF-8');
        $s = mb_strtoupper($s, 'UTF-8');
        $s = (string) preg_replace('/[\s\p{Z}\x{002D}\x{FF0D}\x{30FC}\x{2010}-\x{2015}]+/u', '', $s);
        return strtr($s, ['O' => '0', 'I' => '1', 'L' => '1']);
    }

    /**
     * 正規化済みの入力を検査する。
     *
     * @return string|null 問題がなければ null。あれば、エラーの種類
     *                     （INVALID_FORMAT: 25文字でない・使えない文字がある、CHECK_CHARACTER_MISMATCH: チェック用の文字が違う）
     */
    public static function validate(string $normalized): ?string
    {
        if (!preg_match('/^[0-9A-HJKMNP-TV-Z]{25}$/', $normalized)) {
            return 'INVALID_FORMAT';
        }
        return self::hasValidCheckCharacter($normalized) ? null : 'CHECK_CHARACTER_MISMATCH';
    }
}
