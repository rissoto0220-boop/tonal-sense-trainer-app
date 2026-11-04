<?php

declare(strict_types=1);

namespace UecTst\Captcha;

/** 開発用。常に成功する（production では、設定で使えない）。 */
final class NullCaptchaVerifier implements CaptchaVerifier
{
    public function verify(?string $token, string $clientIp): bool
    {
        return true;
    }
}
