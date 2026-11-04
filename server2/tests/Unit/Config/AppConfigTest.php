<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Config;

use PHPUnit\Framework\TestCase;
use UecTst\Config\AppConfig;
use UecTst\Config\ConfigException;

final class AppConfigTest extends TestCase
{
    /** @return array<string, mixed> */
    private static function dev(): array
    {
        return ['environment' => 'development', 'allowedOrigins' => ['http://localhost:8888'], 'cookie' => ['secure' => false, 'useHostPrefix' => false]];
    }

    public function testDevelopmentConfigIsLoaded(): void
    {
        $config = AppConfig::fromArray(self::dev());
        $this->assertFalse($config->isProduction());
        $this->assertSame(['http://localhost:8888'], $config->allowedOrigins);
        $this->assertStringEndsWith('/storage/logs/app.log', $config->logFile);
    }

    public function testProductionRequiresSecureCookiesAndHttps(): void
    {
        $prod = ['environment' => 'production', 'allowedOrigins' => ['https://uec-tst.koto.jp'], 'cookie' => ['secure' => true, 'useHostPrefix' => true]];
        $this->assertTrue(AppConfig::fromArray($prod)->isProduction());

        $insecureCookie = $prod;
        $insecureCookie['cookie']['secure'] = false;
        $this->expectException(ConfigException::class);
        AppConfig::fromArray($insecureCookie);
    }

    public function testProductionRejectsHttpOrigin(): void
    {
        $this->expectException(ConfigException::class);
        AppConfig::fromArray(['environment' => 'production', 'allowedOrigins' => ['http://uec-tst.koto.jp'], 'cookie' => ['secure' => true, 'useHostPrefix' => true]]);
    }

    public function testOriginWithPathOrTrailingSlashIsRejected(): void
    {
        foreach (['https://uec-tst.koto.jp/', 'https://uec-tst.koto.jp/app', 'uec-tst.koto.jp'] as $origin) {
            $data = self::dev();
            $data['allowedOrigins'] = [$origin];
            try {
                AppConfig::fromArray($data);
                $this->fail("拒否されるはず: {$origin}");
            } catch (ConfigException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function testInvalidEnvironmentIsRejected(): void
    {
        $data = self::dev();
        $data['environment'] = 'staging';
        $this->expectException(ConfigException::class);
        AppConfig::fromArray($data);
    }
}
