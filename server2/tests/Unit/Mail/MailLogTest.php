<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Mail;

use PHPUnit\Framework\TestCase;
use UecTst\Mail\MailLog;

final class MailLogTest extends TestCase
{
    private string $file;

    protected function setUp(): void
    {
        $this->file = sys_get_temp_dir() . '/uectst-maillog-' . bin2hex(random_bytes(4)) . '.log';
    }

    protected function tearDown(): void
    {
        @unlink($this->file);
    }

    private function add(MailLog $log, string $id, string $to): void
    {
        $log->append(['id' => $id, 'sentAt' => '2026-11-19T00:00:00Z', 'from' => 'f@example.com', 'to' => $to, 'subject' => 's', 'body' => 'b']);
    }

    public function testDeleteOneKeepsTheOthers(): void
    {
        $log = new MailLog($this->file);
        $this->add($log, '20261119000000-aaaaaaaa', 'a@example.com');
        $this->add($log, '20261119000001-bbbbbbbb', 'b@example.com');
        $this->add($log, '20261119000002-cccccccc', 'c@example.com');

        $this->assertSame(1, $log->delete('20261119000001-bbbbbbbb'));
        $this->assertSame(['c@example.com', 'a@example.com'], array_column($log->recent(), 'to'));
        $this->assertSame(0, $log->delete('20261119000001-bbbbbbbb'));

        $this->add($log, '20261119000003-dddddddd', 'd@example.com'); // 削除後も、追記できる
        $this->assertSame(['d@example.com', 'c@example.com', 'a@example.com'], array_column($log->recent(), 'to'));
    }

    public function testDeleteAllEmptiesTheFile(): void
    {
        $log = new MailLog($this->file);
        $this->add($log, '20261119000000-aaaaaaaa', 'a@example.com');
        $this->add($log, '20261119000001-bbbbbbbb', 'b@example.com');

        $this->assertSame(2, $log->delete(null));
        $this->assertSame([], $log->recent());
        $this->assertSame(0, $log->delete(null));
    }

    public function testDeleteWithoutFileDoesNothing(): void
    {
        $this->assertSame(0, (new MailLog($this->file))->delete(null));
        $this->assertFileDoesNotExist($this->file);
    }
}
