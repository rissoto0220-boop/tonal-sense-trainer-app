<?php

declare(strict_types=1);

namespace UecTst\Mail;

/**
 * 開発用。メールを送らずに、ファイル（storage/logs/mail.log）に書き出す。本登録URLなどを、ここで確認する。
 * 本番の送信サービスが決まったら、別の実装に差し替える。アプリのログ（app.log）とは、別のファイルにする。
 */
final class LogMailer implements Mailer
{
    public function __construct(private readonly string $file, private readonly string $from)
    {
    }

    public function send(string $to, string $subject, string $textBody): void
    {
        $dir = dirname($this->file);
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new MailException('メールのログの出力先を作れません');
        }
        $entry = sprintf(
            "=== %s ===\nFrom: %s\nTo: %s\nSubject: %s\n\n%s\n\n",
            gmdate('Y-m-d\TH:i:s\Z'),
            $this->from,
            $to,
            $subject,
            $textBody,
        );
        if (@file_put_contents($this->file, $entry, FILE_APPEND | LOCK_EX) === false) {
            throw new MailException('メールのログを書き込めません');
        }
    }

    public function sender(): string
    {
        return $this->from;
    }
}
