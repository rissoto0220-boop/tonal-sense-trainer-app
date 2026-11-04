<?php

declare(strict_types=1);

namespace UecTst\Captcha;

/** CAPTCHA の検証（仮登録メールの踏み台対策。基本方針 3.1）。 */
interface CaptchaVerifier
{
    public function verify(?string $token, string $clientIp): bool;
}
