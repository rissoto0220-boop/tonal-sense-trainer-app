<?php

declare(strict_types=1);

namespace UecTst\Tests\Support;

use UecTst\Mail\MailException;
use UecTst\Mail\Mailer;

/** テスト用のメール送信。送ったメールを記録する。失敗させることもできる。 */
final class RecordingMailer implements Mailer
{
    /** @var list<array{to: string, subject: string, body: string}> */
    public array $sent = [];
    public bool $failNext = false;

    public function send(string $to, string $subject, string $textBody): void
    {
        if ($this->failNext) {
            $this->failNext = false;
            throw new MailException('SMTP connection refused');
        }
        $this->sent[] = ['to' => $to, 'subject' => $subject, 'body' => $textBody];
    }

    public function sender(): string
    {
        return 'no-reply@example.com';
    }

    /** 最後に送ったメールの、本登録URL（http(s)://.../register#token=...）から、トークンを取り出す。 */
    public function lastRegistrationToken(): string
    {
        $last = end($this->sent);
        if ($last === false || !preg_match('/#token=([A-Za-z0-9_-]{43})/', $last['body'], $m)) {
            throw new \RuntimeException('本登録URLのメールが、まだ送られていません');
        }
        return $m[1];
    }

    /** 最後に送ったメールの、招待URL（http(s)://.../invite#token=...）から、トークンを取り出す。 */
    public function lastInvitationToken(): string
    {
        $last = end($this->sent);
        if ($last === false || !preg_match('#/invite\#token=([A-Za-z0-9_-]{43})#', $last['body'], $m)) {
            throw new \RuntimeException('招待URLのメールが、まだ送られていません');
        }
        return $m[1];
    }
}
