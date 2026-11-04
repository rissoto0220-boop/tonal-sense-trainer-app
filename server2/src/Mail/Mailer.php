<?php

declare(strict_types=1);

namespace UecTst\Mail;

/** メール送信。送信方法（開発用のログ、本番の送信サービス）を、差し替えられるようにする。 */
interface Mailer
{
    /**
     * @throws MailException 送信に失敗した場合
     */
    public function send(string $to, string $subject, string $textBody): void;

    /** 送信元アドレス（送信完了画面で、迷惑メールの確認とあわせて案内する。基本方針 3.1）。 */
    public function sender(): string;
}
