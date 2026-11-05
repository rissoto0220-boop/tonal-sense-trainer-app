<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Config;

use PHPUnit\Framework\TestCase;
use UecTst\Config\AppConfig;
use UecTst\Config\ConfigException;

final class AppConfigTest extends TestCase
{
    private const DEV_KEY_1 = 'ZGV2LW9ubHktcmVjb3ZlcnktY29kZS1obWFjLWtleS0wMQ==';
    private const DEV_KEY_2 = 'ZGV2LW9ubHktcmF0ZS1saW1pdC1obWFjLWtleS0wMDAx';

    /** @return array<string, mixed> */
    public static function dev(): array
    {
        return [
            'environment' => 'development',
            'allowedOrigins' => ['http://localhost:8888'],
            'publicBaseUrl' => 'http://localhost:8888',
            'cookie' => ['secure' => false, 'useHostPrefix' => false],
            'mail' => ['driver' => 'log', 'from' => 'no-reply@example.com'],
            'captcha' => ['driver' => 'none', 'secretKey' => ''],
            'secrets' => [
                'recoveryCodeKeys' => ['1' => self::DEV_KEY_1],
                'currentRecoveryCodeKeyId' => 1,
                'rateLimitKey' => self::DEV_KEY_2,
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function production(): array
    {
        $data = self::dev();
        $data['environment'] = 'production';
        $data['allowedOrigins'] = ['https://uec-tst.koto.jp'];
        $data['publicBaseUrl'] = 'https://uec-tst.koto.jp';
        $data['cookie'] = ['secure' => true, 'useHostPrefix' => true];
        $data['captcha'] = ['driver' => 'turnstile', 'secretKey' => 'turnstile-secret'];
        $data['secrets'] = [
            'recoveryCodeKeys' => ['1' => base64_encode(random_bytes(32)), '2' => base64_encode(random_bytes(32))],
            'currentRecoveryCodeKeyId' => 2,
            'rateLimitKey' => base64_encode(random_bytes(32)),
        ];
        return $data;
    }

    /** @param array<string, mixed> $data */
    private function assertRejected(array $data, string $why): void
    {
        try {
            AppConfig::fromArray($data);
            $this->fail("拒否されるはず: {$why}");
        } catch (ConfigException) {
            $this->addToAssertionCount(1);
        }
    }

    public function testDevelopmentConfigIsLoaded(): void
    {
        $config = AppConfig::fromArray(self::dev());
        $this->assertFalse($config->isProduction());
        $this->assertSame(['http://localhost:8888'], $config->allowedOrigins);
        $this->assertSame('http://localhost:8888', $config->publicBaseUrl);
        $this->assertStringEndsWith('/storage/logs/app.log', $config->logFile);
        $this->assertStringEndsWith('/storage/logs/mail.log', $config->mailLogFile);
        $this->assertNull($config->trustedProxyHeader);
        $this->assertSame(1, $config->currentRecoveryCodeKeyId);
        $this->assertGreaterThanOrEqual(32, strlen($config->recoveryCodeKeys()[1]));
        $this->assertGreaterThanOrEqual(32, strlen($config->rateLimitKey()));
    }

    public function testProductionConfigIsAccepted(): void
    {
        $config = AppConfig::fromArray(self::production());
        $this->assertTrue($config->isProduction());
        $this->assertSame(2, $config->currentRecoveryCodeKeyId);
        $this->assertCount(2, $config->recoveryCodeKeys());
    }

    public function testProductionRequiresSecureCookiesHttpsAndTurnstile(): void
    {
        $insecureCookie = self::production();
        $insecureCookie['cookie']['secure'] = false;
        $this->assertRejected($insecureCookie, 'Secure でない Cookie');

        $noPrefix = self::production();
        $noPrefix['cookie']['useHostPrefix'] = false;
        $this->assertRejected($noPrefix, '__Host- なし');

        $httpOrigin = self::production();
        $httpOrigin['allowedOrigins'] = ['http://uec-tst.koto.jp'];
        $this->assertRejected($httpOrigin, 'http のオリジン');

        $httpBase = self::production();
        $httpBase['publicBaseUrl'] = 'http://uec-tst.koto.jp';
        $this->assertRejected($httpBase, 'http の公開 URL');

        $noCaptcha = self::production();
        $noCaptcha['captcha'] = ['driver' => 'none', 'secretKey' => ''];
        $this->assertRejected($noCaptcha, 'CAPTCHA なし');
    }

    public function testProductionRejectsTheSampleDevelopmentKeys(): void
    {
        $recovery = self::production();
        $recovery['secrets']['recoveryCodeKeys']['2'] = self::DEV_KEY_1;
        $this->assertRejected($recovery, 'サンプルの復旧コードの鍵');

        $rate = self::production();
        $rate['secrets']['rateLimitKey'] = self::DEV_KEY_2;
        $this->assertRejected($rate, 'サンプルの回数制限の鍵');
    }

    public function testKeysMustBeLongBase64(): void
    {
        foreach (['', 'not base64 !!!', base64_encode('short')] as $bad) {
            $data = self::dev();
            $data['secrets']['rateLimitKey'] = $bad;
            $this->assertRejected($data, "鍵: {$bad}");
        }
    }

    public function testCurrentKeyIdMustExist(): void
    {
        $data = self::dev();
        $data['secrets']['currentRecoveryCodeKeyId'] = 9;
        $this->assertRejected($data, '存在しない鍵の識別子');
    }

    public function testOriginWithPathOrTrailingSlashIsRejected(): void
    {
        foreach (['https://uec-tst.koto.jp/', 'https://uec-tst.koto.jp/app', 'uec-tst.koto.jp'] as $origin) {
            $data = self::dev();
            $data['allowedOrigins'] = [$origin];
            $this->assertRejected($data, $origin);
        }
    }

    public function testPublicBaseUrlMayHaveAPathButNotATrailingSlash(): void
    {
        $data = self::dev();
        $data['publicBaseUrl'] = 'https://uec-tst.koto.jp/server';
        $this->assertSame('https://uec-tst.koto.jp/server', AppConfig::fromArray($data)->publicBaseUrl);

        $data['publicBaseUrl'] = 'https://uec-tst.koto.jp/';
        $this->assertRejected($data, '末尾の /');
    }

    public function testInvalidEnvironmentAndMailAndCaptchaAreRejected(): void
    {
        $env = self::dev();
        $env['environment'] = 'staging';
        $this->assertRejected($env, 'environment');

        $mail = self::dev();
        $mail['mail']['driver'] = 'smtp';
        $this->assertRejected($mail, 'mail.driver');

        $from = self::dev();
        $from['mail']['from'] = 'not-an-email';
        $this->assertRejected($from, 'mail.from');

        $captcha = self::dev();
        $captcha['captcha'] = ['driver' => 'turnstile', 'secretKey' => ''];
        $this->assertRejected($captcha, 'turnstile の秘密鍵なし');
    }

    public function testTrustedProxyHeaderMustBeAHeaderName(): void
    {
        $data = self::dev();
        $data['trustedProxyHeader'] = 'X-Forwarded-For';
        $this->assertSame('X-Forwarded-For', AppConfig::fromArray($data)->trustedProxyHeader);

        $data['trustedProxyHeader'] = "X-Forwarded-For\r\nSet-Cookie: x";
        $this->assertRejected($data, 'ヘッダの注入');
    }

    public function testSecretsNeverAppearInDebugOutput(): void
    {
        $config = AppConfig::fromArray(self::dev());
        $dump = print_r($config, true) . var_export($config->__debugInfo(), true);
        $this->assertStringNotContainsString(self::DEV_KEY_1, $dump);
        $this->assertStringNotContainsString(self::DEV_KEY_2, $dump);
        $this->assertStringNotContainsString(base64_decode(self::DEV_KEY_1), $dump);
    }

    public function testWebauthnDefaultsToPublicBaseUrlHost(): void
    {
        $config = AppConfig::fromArray(self::dev());
        $this->assertSame('localhost', $config->webauthnRpId);
        $this->assertSame('TonalSenseTrainer', $config->webauthnRpName);
    }

    public function testWebauthnCanBeConfiguredAndIsValidated(): void
    {
        $config = AppConfig::fromArray(['webauthn' => ['rpId' => 'Example.COM', 'rpName' => 'テスト']] + self::dev());
        $this->assertSame('example.com', $config->webauthnRpId);
        $this->assertSame('テスト', $config->webauthnRpName);

        foreach ([['rpId' => 'bad host'], ['rpId' => 'https://example.com'], ['rpName' => ' ']] as $bad) {
            try {
                AppConfig::fromArray(['webauthn' => $bad] + self::dev());
                $this->fail('拒否されるはずです: ' . json_encode($bad));
            } catch (ConfigException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function testExportMaxSessionsDefaultsAndIsValidated(): void
    {
        $this->assertSame(5000, AppConfig::fromArray(self::dev())->exportMaxSessions);
        $config = AppConfig::fromArray(['testData' => ['exportMaxSessions' => 20000]] + self::dev());
        $this->assertSame(20000, $config->exportMaxSessions);

        foreach ([0, -1, 100001, '5000', 1.5, true] as $bad) {
            try {
                AppConfig::fromArray(['testData' => ['exportMaxSessions' => $bad]] + self::dev());
                $this->fail('拒否されるはずです: ' . json_encode($bad));
            } catch (ConfigException) {
                $this->addToAssertionCount(1);
            }
        }
        $this->expectException(ConfigException::class);
        AppConfig::fromArray(['testData' => 'x'] + self::dev());
    }
}
