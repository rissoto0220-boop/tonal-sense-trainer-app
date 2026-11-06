<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Mail;

use PHPUnit\Framework\TestCase;
use UecTst\Mail\LogMailer;
use UecTst\Mail\MailLog;

final class LogMailerTest extends TestCase
{
    private string $file;

    protected function setUp(): void
    {
        $this->file = sys_get_temp_dir() . '/uectst-mail-' . bin2hex(random_bytes(4)) . '/mail.log';
    }

    protected function tearDown(): void
    {
        @unlink($this->file);
        @rmdir(dirname($this->file));
    }

    public function testSentMailIsRecordedAndReadNewestFirst(): void
    {
        $mailer = new LogMailer($this->file, 'no-reply@example.com');
        $mailer->send('a@example.com', '件名1', "本文1\nhttp://localhost/register#token=abc");
        $first = $mailer->takeLastMailId();
        $mailer->send('b@example.com', '件名2 <b>"quote"</b>', '本文2');
        $second = $mailer->takeLastMailId();

        $this->assertNotNull($first);
        $this->assertNotNull($second);
        $this->assertNotSame($first, $second);
        $this->assertNull($mailer->takeLastMailId(), '取り出したら忘れる');

        $mails = (new MailLog($this->file))->recent();
        $this->assertSame([$second, $first], array_column($mails, 'id'));
        $this->assertSame('b@example.com', $mails[0]['to']);
        $this->assertSame('件名2 <b>"quote"</b>', $mails[0]['subject']);
        $this->assertSame('no-reply@example.com', $mails[0]['from']);
        $this->assertSame("本文1\nhttp://localhost/register#token=abc", $mails[1]['body']);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $mails[0]['sentAt']);
        $this->assertSame('no-reply@example.com', $mailer->sender());
    }

    public function testRecentRespectsTheLimitAndSkipsUnreadableLines(): void
    {
        $dir = dirname($this->file);
        mkdir($dir, 0775, true);
        // 古い形式（テキスト）の行や、壊れた行が混ざっていても、読める行だけを返す。
        file_put_contents($this->file, "=== 2026-01-01T00:00:00Z ===\nFrom: x\n\n{broken\n");
        $mailer = new LogMailer($this->file, 'no-reply@example.com');
        for ($i = 1; $i <= 5; $i++) {
            $mailer->send("u{$i}@example.com", "件名{$i}", '本文');
        }
        $log = new MailLog($this->file);
        $this->assertCount(5, $log->recent());
        $this->assertSame(['u5@example.com', 'u4@example.com'], array_column($log->recent(2), 'to'));
    }

    public function testMissingFileIsEmpty(): void
    {
        $this->assertSame([], (new MailLog($this->file))->recent());
    }
}
