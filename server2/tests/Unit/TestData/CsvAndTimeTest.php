<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\TestData;

use PHPUnit\Framework\TestCase;
use UecTst\TestData\Csv;
use UecTst\TestData\ExportFormat;
use UecTst\TestData\SessionValidator;

final class CsvAndTimeTest extends TestCase
{
    public function testCsvLineQuotesAndUsesCrlf(): void
    {
        $this->assertSame("a,,1,\"x,y\",\"say \"\"hi\"\"\",\"l1\nl2\"\r\n", Csv::line(['a', null, 1, 'x,y', 'say "hi"', "l1\nl2"]));
        $this->assertSame("\xEF\xBB\xBF", Csv::BOM);
    }

    public function testParseTimeNormalizesToUtcAndTruncatesToMilliseconds(): void
    {
        [$time, $offset] = SessionValidator::parseTime('2026-10-29T08:54:03.875999+09:00');
        $this->assertSame('2026-10-28 23:54:03.875', SessionValidator::toDb($time));
        $this->assertSame(540, $offset);
        [$time, $offset] = SessionValidator::parseTime('2026-10-29T10:00:00Z');
        $this->assertSame('2026-10-29 10:00:00.000', SessionValidator::toDb($time));
        $this->assertSame(0, $offset);
        [, $offset] = SessionValidator::parseTime('2026-10-29T10:00:00-05:30');
        $this->assertSame(-330, $offset);
    }

    public function testParseTimeRejectsBadValues(): void
    {
        foreach (['', '2026-10-29', '2026-10-29T10:00:00', '2026-10-29 10:00:00+09:00', '2026-13-01T00:00:00+09:00', '2026-02-29T00:00:00+09:00',
            '2026-10-29T24:00:00+09:00', '2026-10-29T10:00:00+15:00', '2026-10-29T10:00:00-13:00', '2026-10-29T10:00:00+09:60', '1999-01-01T00:00:00Z'] as $bad) {
            $this->assertNull(SessionValidator::parseTime($bad), $bad);
        }
    }

    public function testLocalTimeIsRenderedWithTheSessionsOffset(): void
    {
        $this->assertSame('2026-10-29T08:54:03.875+09:00', ExportFormat::local('2026-10-28 23:54:03.875', 540));
        $this->assertSame('2026-10-28T18:24:03.000-05:30', ExportFormat::local('2026-10-28 23:54:03.000', -330));
        $this->assertSame('2026-10-28T23:54:03.000+00:00', ExportFormat::local('2026-10-28 23:54:03.000', 0));
        $this->assertNull(ExportFormat::local(null, 540));
    }
}
