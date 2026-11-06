<?php

declare(strict_types=1);

namespace UecTst\Mail;

/**
 * 開発用。メールを送らずに、ファイル（storage/logs/mail.log。1行1件の JSON）に書き出す。
 * 内容は、メール表示ページ（debug.features.mailViewer）で見る。
 * 本番の送信サービスが決まったら、別の実装に差し替える。アプリのログ（app.log）とは、別のファイルにする。
 */
final class LogMailer implements Mailer, RecordsSentMail
{
    private readonly MailLog $log;
    private ?string $lastId = null;

    public function __construct(string $file, private readonly string $from)
    {
        $this->log = new MailLog($file);
    }

    public function send(string $to, string $subject, string $textBody): void
    {
        $id = gmdate('YmdHis') . '-' . bin2hex(random_bytes(4));
        $this->log->append([
            'id' => $id,
            'sentAt' => gmdate('Y-m-d\TH:i:s\Z'),
            'from' => $this->from,
            'to' => $to,
            'subject' => $subject,
            'body' => $textBody,
        ]);
        $this->lastId = $id;
    }

    public function sender(): string
    {
        return $this->from;
    }

    public function takeLastMailId(): ?string
    {
        $id = $this->lastId;
        $this->lastId = null;
        return $id;
    }
}
