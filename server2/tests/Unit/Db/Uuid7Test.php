<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Db;

use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use UecTst\Db\Uuid7;

final class Uuid7Test extends TestCase
{
    protected function setUp(): void
    {
        Uuid7::resetStateForTesting();
    }

    public function testFormatVersionAndVariant(): void
    {
        for ($i = 0; $i < 200; $i++) {
            $uuid = Uuid7::generate();
            $this->assertTrue(Uuid7::isValid($uuid), $uuid);
            $this->assertSame('7', $uuid[14], 'バージョンは 7');
            $this->assertContains($uuid[19], ['8', '9', 'a', 'b'], 'バリアントは 10xx');
        }
    }

    public function testBinaryRoundTrip(): void
    {
        $binary = Uuid7::generateBinary();
        $this->assertSame(16, strlen($binary));
        $this->assertSame($binary, Uuid7::toBinary(Uuid7::toString($binary)));
    }

    public function testTimestampIsEmbeddedInMilliseconds(): void
    {
        $millis = 1793700000123;
        $this->assertSame($millis, Uuid7::timestampMillis(Uuid7::generateBinary($millis)));
    }

    public function testGeneratedValuesAreStrictlyIncreasing(): void
    {
        $previous = '';
        for ($i = 0; $i < 5000; $i++) {
            $current = Uuid7::generateBinary();
            $this->assertGreaterThan($previous, $current, "{$i} 番目");
            $previous = $current;
        }
    }

    public function testLaterTimeSortsAfterEarlierTimeEvenAfterClockSkew(): void
    {
        $a = Uuid7::generateBinary(1893456000000);
        $b = Uuid7::generateBinary(1893456000000 - 5000); // 時計が戻っても、順序は保たれる
        $this->assertGreaterThan($a, $b);
    }

    public function testValuesAreUnique(): void
    {
        $seen = [];
        for ($i = 0; $i < 20000; $i++) {
            $seen[Uuid7::generate()] = true;
        }
        $this->assertCount(20000, $seen);
    }

    public function testStringValidationRejectsOtherForms(): void
    {
        $valid = Uuid7::generate();
        foreach ([strtoupper($valid), str_replace('-', '', $valid), '0192f3a0-0000-4000-8000-000000000001' /* v4 */, '', 'not-a-uuid', $valid . 'x'] as $bad) {
            $this->assertFalse(Uuid7::isValid($bad), $bad);
        }
    }

    public function testInvalidInputThrows(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Uuid7::toBinary('0192f3a0-0000-4000-8000-000000000001');
    }

    public function testBinaryOfWrongLengthThrows(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Uuid7::toString('short');
    }
}
