<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Auth;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use UecTst\Auth\DeviceLabel;

final class DeviceLabelTest extends TestCase
{
    /** @return array<string, array{?string, string}> */
    public static function agents(): array
    {
        return [
            'iPhone Safari' => ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'iPhone / Safari'],
            'iPhone Chrome' => ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1', 'iPhone / Chrome'],
            'Android Chrome' => ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36', 'Android / Chrome'],
            'Samsung Internet' => ['Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0 Mobile Safari/537.36', 'Android / Samsung Internet'],
            'Mac Safari' => ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 'Mac / Safari'],
            'Windows Edge' => ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0', 'Windows / Edge'],
            'Windows Firefox' => ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0', 'Windows / Firefox'],
            'iPad Safari' => ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'iPad / Safari'],
            'なし' => [null, '不明な端末 / 不明なブラウザ'],
            '空' => ['', '不明な端末 / 不明なブラウザ'],
        ];
    }

    #[DataProvider('agents')]
    public function testLabel(?string $userAgent, string $expected): void
    {
        $this->assertSame($expected, DeviceLabel::fromUserAgent($userAgent));
    }

    public function testLabelNeverContainsTheRawUserAgentAndFitsTheColumn(): void
    {
        $ua = 'Mozilla/5.0 (X11; Linux x86_64) very-long-' . str_repeat('x', 500);
        $label = DeviceLabel::fromUserAgent($ua);
        $this->assertStringNotContainsString('very-long', $label);
        $this->assertLessThanOrEqual(50, mb_strlen($label));
    }
}
