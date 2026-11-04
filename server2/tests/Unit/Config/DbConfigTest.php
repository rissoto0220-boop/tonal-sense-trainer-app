<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Config;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use UecTst\Config\ConfigException;
use UecTst\Config\DbConfig;

final class DbConfigTest extends TestCase
{
    /** @return array<string, mixed> */
    private static function valid(): array
    {
        return [
            'host' => '127.0.0.1', 'port' => 3307, 'database' => 'UECTSTDB', 'user' => 'app',
            'password' => 's3cret-password', 'charset' => 'utf8mb4', 'timezone' => '+00:00',
            'connectTimeoutSeconds' => 5, 'ssl' => ['enabled' => false, 'caFile' => '', 'verifyServerCert' => true],
        ];
    }

    public function testValidConfigIsLoaded(): void
    {
        $config = DbConfig::fromArray(self::valid());
        $this->assertSame('mysql:host=127.0.0.1;port=3307;dbname=UECTSTDB;charset=utf8mb4', $config->dsn());
        $this->assertSame('app', $config->user());
        $this->assertSame('s3cret-password', $config->password());
    }

    public function testPasswordMayBeEmptyForLocalDevelopment(): void
    {
        $data = self::valid();
        $data['password'] = '';
        $this->assertSame('', DbConfig::fromArray($data)->password());
    }

    public function testSslAndTimeoutAreOptional(): void
    {
        $data = self::valid();
        unset($data['ssl'], $data['connectTimeoutSeconds']);
        $config = DbConfig::fromArray($data);
        $this->assertFalse($config->sslEnabled);
        $this->assertSame(5, $config->connectTimeoutSeconds);
    }

    /** @return array<string, array{string, mixed}> */
    public static function invalidValues(): array
    {
        return [
            'host なし' => ['host', null],
            'host が空' => ['host', ' '],
            'port が文字列' => ['port', '3306'],
            'port が範囲外' => ['port', 70000],
            'database に記号' => ['database', 'UEC;DROP'],
            'user なし' => ['user', null],
            'password なし' => ['password', null],
            'timezone の形式' => ['timezone', 'Asia/Tokyo'],
            'charset の形式' => ['charset', 'utf8mb4; --'],
            'timeout が範囲外' => ['connectTimeoutSeconds', 0],
        ];
    }

    #[DataProvider('invalidValues')]
    public function testInvalidValueIsRejected(string $key, mixed $value): void
    {
        $data = self::valid();
        if ($value === null) {
            unset($data[$key]);
        } else {
            $data[$key] = $value;
        }
        $this->expectException(ConfigException::class);
        DbConfig::fromArray($data);
    }

    public function testSslVerificationRequiresCaFile(): void
    {
        $data = self::valid();
        $data['ssl'] = ['enabled' => true, 'caFile' => '', 'verifyServerCert' => true];
        $this->expectException(ConfigException::class);
        DbConfig::fromArray($data);
    }

    public function testSslOptionsArePassedToPdo(): void
    {
        $data = self::valid();
        $data['ssl'] = ['enabled' => true, 'caFile' => '/etc/ssl/rds.pem', 'verifyServerCert' => true];
        $options = DbConfig::fromArray($data)->pdoOptions();
        $this->assertSame('/etc/ssl/rds.pem', $options[DbConfig::sslCaOption()]);
        $this->assertTrue($options[DbConfig::sslVerifyOption()]);
        $this->assertSame(\PDO::ERRMODE_EXCEPTION, $options[\PDO::ATTR_ERRMODE]);
        $this->assertFalse($options[\PDO::ATTR_EMULATE_PREPARES]);
    }

    public function testPasswordNeverAppearsInDebugOutputOrErrors(): void
    {
        $config = DbConfig::fromArray(self::valid());
        $this->assertStringNotContainsString('s3cret-password', print_r($config, true));
        $this->assertStringNotContainsString('s3cret-password', var_export($config->__debugInfo(), true));

        $data = self::valid();
        $data['port'] = 'bad';
        try {
            DbConfig::fromArray($data);
            $this->fail('例外が発生するはず');
        } catch (ConfigException $e) {
            $this->assertStringNotContainsString('s3cret-password', $e->getMessage());
        }
    }

    public function testLoadReadsFileAndReportsMissingFile(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'dbc');
        file_put_contents($path, json_encode(self::valid()));
        try {
            $this->assertSame('UECTSTDB', DbConfig::load($path)->database);
        } finally {
            unlink($path);
        }
        $this->expectException(ConfigException::class);
        DbConfig::load('/nonexistent/DBConfig.json');
    }

    public function testBrokenJsonDoesNotLeakContent(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'dbc');
        file_put_contents($path, '{"password": "s3cret-password", ');
        try {
            DbConfig::load($path);
            $this->fail('例外が発生するはず');
        } catch (ConfigException $e) {
            $this->assertStringNotContainsString('s3cret-password', $e->getMessage());
        } finally {
            unlink($path);
        }
    }
}
