<?php

declare(strict_types=1);

namespace UecTst\TestData;

/** CSV の1行を作る。BOM 付き UTF-8・CRLF・値に , " 改行を含む場合は " で囲む（DataFormat_TestData.md 8.1）。 */
final class Csv
{
    public const BOM = "\xEF\xBB\xBF";

    /** @param list<scalar|null> $values */
    public static function line(array $values): string
    {
        return implode(',', array_map(self::field(...), $values)) . "\r\n";
    }

    private static function field(mixed $value): string
    {
        $text = $value === null ? '' : (is_bool($value) ? ($value ? '1' : '0') : (string) $value);
        if (preg_match('/[",\r\n]/', $text)) {
            return '"' . str_replace('"', '""', $text) . '"';
        }
        return $text;
    }
}
