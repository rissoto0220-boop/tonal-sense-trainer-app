<?php

declare(strict_types=1);

namespace UecTst\Tests\Support;

/** テスト用の最小の CBOR エンコーダ（整数・バイト列・文字列・マップ）。空のマップは stdClass で表す。 */
final class Cbor
{
    public static function encode(mixed $value): string
    {
        if (is_int($value)) {
            return $value >= 0 ? self::head(0, $value) : self::head(1, -1 - $value);
        }
        if ($value instanceof CborBytes) {
            return self::head(2, strlen($value->bytes)) . $value->bytes;
        }
        if (is_string($value)) {
            return self::head(3, strlen($value)) . $value;
        }
        if ($value instanceof \stdClass) {
            return self::head(5, 0);
        }
        if (is_array($value)) {
            $out = self::head(5, count($value));
            foreach ($value as $k => $v) {
                $out .= self::encode($k) . self::encode($v);
            }
            return $out;
        }
        throw new \InvalidArgumentException('未対応の型です');
    }

    private static function head(int $major, int $n): string
    {
        $m = $major << 5;
        return match (true) {
            $n < 24 => chr($m | $n),
            $n < 256 => chr($m | 24) . chr($n),
            $n < 65536 => chr($m | 25) . pack('n', $n),
            default => chr($m | 26) . pack('N', $n),
        };
    }
}
