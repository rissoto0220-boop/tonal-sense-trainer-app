<?php

declare(strict_types=1);

namespace UecTst\Auth;

/**
 * User-Agent から、OS とブラウザの種類だけを取り出して、端末一覧に表示する名前を作る
 * （例: 「iPhone / Safari」）。User-Agent の全文は保存しない（TableSpec_Auth.md 2.3）。
 */
final class DeviceLabel
{
    public static function fromUserAgent(?string $userAgent): string
    {
        $ua = $userAgent ?? '';
        return self::os($ua) . ' / ' . self::browser($ua);
    }

    private static function os(string $ua): string
    {
        return match (true) {
            str_contains($ua, 'iPhone') => 'iPhone',
            str_contains($ua, 'iPad') => 'iPad',
            str_contains($ua, 'Android') => 'Android',
            str_contains($ua, 'Windows') => 'Windows',
            str_contains($ua, 'Macintosh'), str_contains($ua, 'Mac OS X') => 'Mac',
            str_contains($ua, 'CrOS') => 'ChromeOS',
            str_contains($ua, 'Linux') => 'Linux',
            default => '不明な端末',
        };
    }

    private static function browser(string $ua): string
    {
        return match (true) {
            str_contains($ua, 'SamsungBrowser') => 'Samsung Internet',
            str_contains($ua, 'Edg/'), str_contains($ua, 'EdgA/'), str_contains($ua, 'EdgiOS/') => 'Edge',
            str_contains($ua, 'Firefox/'), str_contains($ua, 'FxiOS/') => 'Firefox',
            str_contains($ua, 'OPR/'), str_contains($ua, 'Opera') => 'Opera',
            str_contains($ua, 'CriOS/'), str_contains($ua, 'Chrome/') => 'Chrome',
            str_contains($ua, 'Safari/') => 'Safari',
            default => '不明なブラウザ',
        };
    }
}
