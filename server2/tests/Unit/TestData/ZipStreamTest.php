<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\TestData;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;
use UecTst\TestData\ZipStream;
use ZipArchive;

final class ZipStreamTest extends TestCase
{
    private function open(string $bytes): ZipArchive
    {
        $path = tempnam(sys_get_temp_dir(), 'uectst-zip');
        file_put_contents($path, $bytes);
        $zip = new ZipArchive();
        $this->assertTrue($zip->open($path) === true);
        unlink($path);
        return $zip;
    }

    public function testFilesAreReadableByAStandardZipReader(): void
    {
        $out = '';
        $zip = new ZipStream(static function (string $chunk) use (&$out): void {
            $out .= $chunk;
        }, new DateTimeImmutable('2026-11-05 15:30:00'));

        $big = str_repeat("0192f3a0,training,日本語,\"quoted\"\r\n", 20000);
        $zip->startFile('training/responses_a.csv');
        $zip->write('header' . "\r\n");
        $zip->write($big);
        $zip->endFile();
        $zip->startFile('empty.csv');
        $zip->endFile();
        $zip->startFile('absolute_pitch/sessions_b.csv');
        $zip->write('x');
        $zip->finish();

        $archive = $this->open($out);
        $this->assertSame(3, $archive->numFiles);
        $this->assertSame("header\r\n" . $big, $archive->getFromName('training/responses_a.csv'));
        $this->assertSame('', $archive->getFromName('empty.csv'));
        $this->assertSame('x', $archive->getFromName('absolute_pitch/sessions_b.csv'));
        // 圧縮されている（繰り返しの多い CSV）。
        $this->assertLessThan(strlen($big) / 5, strlen($out));
        $stat = $archive->statName('training/responses_a.csv');
        $this->assertSame(crc32("header\r\n" . $big), $stat['crc']);
    }

    public function testEmptyZipIsValid(): void
    {
        $out = '';
        $zip = new ZipStream(static function (string $chunk) use (&$out): void {
            $out .= $chunk;
        }, new DateTimeImmutable());
        $zip->finish();
        $this->assertSame(0, $this->open($out)->numFiles);
    }
}
