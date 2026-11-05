<?php

declare(strict_types=1);

namespace UecTst\Validation;

use Normalizer;

/** 入力値の規則（ApiSpec_Auth.md 0.6）。 */
final class Input
{
    public const USER_NAME_MAX = 20;
    public const EMAIL_MAX = 254;
    public const PASSWORD_MIN = 4;
    public const PASSWORD_MAX = 64;
    public const ORGANIZATION_NAME_MAX = 100;
    public const LOGIN_ID_MIN = 4;
    public const LOGIN_ID_MAX = 64;

    /** メールアドレス。問題がなければ null、あれば理由。 */
    public static function emailError(string $email): ?string
    {
        if ($email === '' || strlen($email) > self::EMAIL_MAX) {
            return 'INVALID_FORMAT';
        }
        return filter_var($email, FILTER_VALIDATE_EMAIL) === false ? 'INVALID_FORMAT' : null;
    }

    /** ユーザ名を正規化する（前後の空白の除去（全角を含む）、Unicode の正規化（NFC））。 */
    public static function normalizeUserName(string $name): string
    {
        $trimmed = (string) preg_replace('/^[\s\p{Z}]+|[\s\p{Z}]+$/u', '', $name);
        $normalized = Normalizer::normalize($trimmed, Normalizer::FORM_C);
        return $normalized === false ? $trimmed : $normalized;
    }

    /** 文字列を正規化する（前後の空白の除去（全角を含む）、Unicode の正規化（NFC））。組織名など。 */
    public static function normalizeText(string $text): string
    {
        return self::normalizeUserName($text);
    }

    /**
     * 正規化後の組織名の検査（1〜100文字）。
     *
     * @return string|null 問題がなければ null。あれば、REQUIRED・TOO_LONG・INVALID_CHARACTER
     */
    public static function organizationNameError(string $normalized): ?string
    {
        if ($normalized === '') {
            return 'REQUIRED';
        }
        if (!mb_check_encoding($normalized, 'UTF-8') || preg_match('/[\p{C}]/u', $normalized)) {
            return 'INVALID_CHARACTER';
        }
        return mb_strlen($normalized, 'UTF-8') > self::ORGANIZATION_NAME_MAX ? 'TOO_LONG' : null;
    }

    /**
     * 小文字に正規化した後のログインIDの検査（英小文字・数字・. _ - のみの4〜64文字）。
     *
     * @return string|null 問題がなければ null。あれば、TOO_SHORT・TOO_LONG・INVALID_CHARACTER
     */
    public static function loginIdError(string $loginId): ?string
    {
        if (preg_match('/^[a-z0-9._-]*$/', $loginId) !== 1) {
            return 'INVALID_CHARACTER';
        }
        if (strlen($loginId) < self::LOGIN_ID_MIN) {
            return 'TOO_SHORT';
        }
        return strlen($loginId) > self::LOGIN_ID_MAX ? 'TOO_LONG' : null;
    }

    /**
     * 正規化後のユーザ名の検査。
     *
     * @return string|null 問題がなければ null。あれば、REQUIRED・TOO_LONG・INVALID_CHARACTER
     */
    public static function userNameError(string $normalized): ?string
    {
        if ($normalized === '') {
            return 'REQUIRED';
        }
        if (!mb_check_encoding($normalized, 'UTF-8') || preg_match('/[\p{C}]/u', $normalized)) {
            return 'INVALID_CHARACTER';
        }
        if (mb_strlen($normalized, 'UTF-8') > self::USER_NAME_MAX) {
            return 'TOO_LONG';
        }
        return null;
    }

    /**
     * スーパーユーザのパスワード（4〜64文字。文字の種類は問わない。前後の空白も含めて、そのまま扱う）。
     *
     * @return string|null 問題がなければ null。あれば、TOO_SHORT・TOO_LONG
     */
    public static function passwordError(string $password): ?string
    {
        $length = mb_strlen($password, 'UTF-8');
        if ($length < self::PASSWORD_MIN) {
            return 'TOO_SHORT';
        }
        return $length > self::PASSWORD_MAX ? 'TOO_LONG' : null;
    }
}
