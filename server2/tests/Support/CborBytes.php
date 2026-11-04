<?php

declare(strict_types=1);

namespace UecTst\Tests\Support;

/** バイト列（CBOR の byte string）を表す。 */
final class CborBytes
{
    public function __construct(public readonly string $bytes)
    {
    }
}
