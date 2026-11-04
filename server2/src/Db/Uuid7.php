<?php

declare(strict_types=1);

namespace UecTst\Db;

use InvalidArgumentException;

/**
 * UUID v7（時刻順に並ぶ UUID）。主キーは BINARY(16) で保存する（TableSpec_Account.md 0. 共通事項）。
 * MySQL には UUID v7 を生成する関数がないため、アプリケーションで生成する。
 *
 * 構造（RFC 9562）: 48bit のミリ秒時刻 | 4bit のバージョン(7) | 12bit の乱数 | 2bit のバリアント(10) | 62bit の乱数
 */
final class Uuid7
{
    private const STRING_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/';

    /** 同じミリ秒に複数生成しても、生成順に並ぶよう、直前の値を覚えておく。 */
    private static int $lastMillis = 0;
    private static int $sequence = 0;

    /**
     * 直前の値の記憶を消す。テストが、他のテストの生成履歴に影響されないようにするためのもの。
     *
     * @internal
     */
    public static function resetStateForTesting(): void
    {
        self::$lastMillis = 0;
        self::$sequence = 0;
    }

    /**
     * @param int|null $millis テスト用。通常は指定しない（現在時刻）
     * @return string 16バイトのバイナリ
     */
    public static function generateBinary(?int $millis = null): string
    {
        $now = $millis ?? (int) floor(microtime(true) * 1000);

        if ($now <= self::$lastMillis) {
            // 時計が戻った・同じミリ秒の場合は、時刻を進めずに、12bit の連番を増やす。
            $now = self::$lastMillis;
            self::$sequence++;
            if (self::$sequence > 0x0FFF) {
                $now++;
                self::$sequence = 0;
            }
        } else {
            self::$sequence = random_int(0, 0x01FF);
        }
        self::$lastMillis = $now;

        $time = pack('J', $now);               // 8バイトのビッグエンディアン
        $bytes = substr($time, 2, 6);          // 下位 48bit
        $bytes .= chr(0x70 | (self::$sequence >> 8)) . chr(self::$sequence & 0xFF);
        $random = random_bytes(8);
        $random[0] = chr((ord($random[0]) & 0x3F) | 0x80); // バリアント 10
        return $bytes . $random;
    }

    /** 小文字のハイフン付き文字列（xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx）。 */
    public static function generate(): string
    {
        return self::toString(self::generateBinary());
    }

    public static function toString(string $binary): string
    {
        if (strlen($binary) !== 16) {
            throw new InvalidArgumentException('UUID のバイナリは 16 バイトである必要があります');
        }
        $hex = bin2hex($binary);
        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
    }

    public static function toBinary(string $uuid): string
    {
        if (!self::isValid($uuid)) {
            throw new InvalidArgumentException('UUID v7 の形式（小文字・ハイフン付き）ではありません');
        }
        return hex2bin(str_replace('-', '', $uuid));
    }

    /** API で受け取る ID の検証（UUID v7 の文字列表現）。 */
    public static function isValid(string $uuid): bool
    {
        return (bool) preg_match(self::STRING_PATTERN, $uuid);
    }

    /** 生成時刻（ミリ秒）。デバッグ・テスト用。 */
    public static function timestampMillis(string $binary): int
    {
        if (strlen($binary) !== 16) {
            throw new InvalidArgumentException('UUID のバイナリは 16 バイトである必要があります');
        }
        return (int) unpack('J', "\0\0" . substr($binary, 0, 6))[1];
    }
}
