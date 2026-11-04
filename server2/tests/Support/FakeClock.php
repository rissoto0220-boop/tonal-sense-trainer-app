<?php

declare(strict_types=1);

namespace UecTst\Tests\Support;

use DateTimeImmutable;
use UecTst\Support\Clock;

/** テスト用の時計。時刻を、好きなだけ進められる。 */
final class FakeClock implements Clock
{
    private DateTimeImmutable $now;

    public function __construct(string $start = '2026-11-04 09:00:00.000000')
    {
        $this->now = new DateTimeImmutable($start, new \DateTimeZone('UTC'));
    }

    public function now(): DateTimeImmutable
    {
        return $this->now;
    }

    /** @param string $modifier 例: '+10 minutes' */
    public function advance(string $modifier): void
    {
        $this->now = $this->now->modify($modifier);
    }
}
