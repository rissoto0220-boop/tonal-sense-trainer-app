<?php

declare(strict_types=1);

namespace UecTst\Mail;

/**
 * 送った（記録した）メールの ID を覚えている Mailer。メール表示ページへのリンクを、API のレスポンスに付けるために使う。
 */
interface RecordsSentMail
{
    /** 直前に送ったメールの ID を返し、忘れる（送っていなければ null）。 */
    public function takeLastMailId(): ?string;
}
