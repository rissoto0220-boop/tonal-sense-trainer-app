<?php

declare(strict_types=1);

namespace UecTst\Support;

use DateTimeImmutable;
use DateTimeZone;

/** DB（DATETIME(6)、UTC）と API（ISO 8601、UTC）の、日時の変換。 */
final class Time
{
    public static function utc(): DateTimeZone
    {
        return new DateTimeZone('UTC');
    }

    /** DB に保存・比較する形式（2026-11-04 09:30:00.000000）。 */
    public static function toDb(DateTimeImmutable $time): string
    {
        return $time->setTimezone(self::utc())->format('Y-m-d H:i:s.u');
    }

    public static function fromDb(string $value): DateTimeImmutable
    {
        return new DateTimeImmutable($value, self::utc());
    }

    /** API で返す形式（2026-11-04T09:30:00.000Z）。 */
    public static function toIso(DateTimeImmutable $time): string
    {
        return $time->setTimezone(self::utc())->format('Y-m-d\TH:i:s.v\Z');
    }

    public static function dbToIso(string $value): string
    {
        return self::toIso(self::fromDb($value));
    }
}
