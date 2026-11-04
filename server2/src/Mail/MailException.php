<?php

declare(strict_types=1);

namespace UecTst\Mail;

use RuntimeException;

/** メール送信の失敗。メッセージは、失敗の理由（サポートのため、エラーログに記録する。基本方針 7.）。 */
final class MailException extends RuntimeException
{
}
