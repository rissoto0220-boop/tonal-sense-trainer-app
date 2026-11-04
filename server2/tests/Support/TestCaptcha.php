<?php

declare(strict_types=1);

namespace UecTst\Tests\Support;

use UecTst\Captcha\CaptchaVerifier;

/** テスト用の CAPTCHA。トークンが "ok" のときだけ成功する。 */
final class TestCaptcha implements CaptchaVerifier
{
    public function verify(?string $token, string $clientIp): bool
    {
        return $token === 'ok';
    }
}
