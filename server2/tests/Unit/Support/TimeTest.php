<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Support;

use DateTimeImmutable;
use DateTimeZone;
use PHPUnit\Framework\TestCase;
use UecTst\Support\Time;

final class TimeTest extends TestCase
{
    public function testDbAndIsoFormatsAreUtc(): void
    {
        $tokyo = new DateTimeImmutable('2026-11-04 18:30:00.123456', new DateTimeZone('Asia/Tokyo'));
        $this->assertSame('2026-11-04 09:30:00.123456', Time::toDb($tokyo));
        $this->assertSame('2026-11-04T09:30:00.123Z', Time::toIso($tokyo));
    }

    public function testRoundTripFromDb(): void
    {
        $time = Time::fromDb('2026-11-04 09:30:00.500000');
        $this->assertSame('2026-11-04 09:30:00.500000', Time::toDb($time));
        $this->assertSame('2026-11-04T09:30:00.500Z', Time::dbToIso('2026-11-04 09:30:00.500000'));
        $this->assertSame('UTC', $time->getTimezone()->getName());
    }
}
