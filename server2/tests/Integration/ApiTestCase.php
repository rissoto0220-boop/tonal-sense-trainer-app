<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use PDO;
use PHPUnit\Framework\TestCase;
use UecTst\App;
use UecTst\Config\AppConfig;
use UecTst\Http\Kernel;
use UecTst\Log\Logger;
use UecTst\Services;
use UecTst\Tests\Support\FakeClock;
use UecTst\Tests\Support\RecordingMailer;
use UecTst\Tests\Support\TestCaptcha;
use UecTst\Tests\Support\TestClient;
use UecTst\Tests\Support\TestDatabase;
use UecTst\Tests\Support\TestResponse;
use UecTst\Tests\Unit\Config\AppConfigTest;

/**
 * API の結合テストの土台。専用のテスト用データベース（<開発用>_TEST）と、偽の時計・メール・CAPTCHA で、
 * 実際の MySQL を使って、API を呼び出す（HTTP は通さず、Kernel を直接呼ぶ）。
 */
abstract class ApiTestCase extends TestCase
{
    protected PDO $pdo;
    protected FakeClock $clock;
    protected RecordingMailer $mailer;
    protected Services $services;
    protected Kernel $kernel;
    protected string $logFile;

    protected function setUp(): void
    {
        $pdo = TestDatabase::connection();
        if ($pdo === null) {
            $this->markTestSkipped('テスト用のデータベースを用意できないため、スキップします（DBConfig.json の接続先を確認してください）');
        }
        $this->pdo = $pdo;
        TestDatabase::truncateAll($pdo);

        $this->logFile = sys_get_temp_dir() . '/uectst-api-' . bin2hex(random_bytes(4)) . '.log';
        $config = AppConfig::fromArray(AppConfigTest::dev() + ['logFile' => $this->logFile]);
        $this->clock = new FakeClock();
        $this->mailer = new RecordingMailer();
        $this->services = new Services($config, $pdo, $this->clock, $this->mailer, new TestCaptcha(), new Logger($this->logFile));
        $this->kernel = App::createKernelWith($this->services);
    }

    protected function tearDown(): void
    {
        if (isset($this->logFile)) {
            @unlink($this->logFile);
        }
    }

    protected function client(string $ip = '198.51.100.1', string $userAgent = TestClient::IPHONE): TestClient
    {
        return new TestClient($this->kernel, $ip, $userAgent);
    }

    /**
     * 仮登録 → 本登録まで行い、この端末（クライアント）をログインした状態にする。
     *
     * @param list<string> $names
     * @return array{recoveryCode: string, family: array<string, mixed>}
     */
    protected function registerFamily(TestClient $client, array $names = ['おとうさん', 'はなこ']): array
    {
        $start = $client->post('/api/v1/registrations', ['email' => 'parent@example.com', 'captchaToken' => 'ok']);
        $this->assertSame(202, $start->status(), $start->body());

        $complete = $client->post('/api/v1/registrations/complete', [
            'token' => $this->mailer->lastRegistrationToken(),
            'users' => array_map(static fn (string $n): array => ['name' => $n], $names),
        ]);
        $this->assertSame(201, $complete->status(), $complete->body());
        $json = $complete->json();
        return ['recoveryCode' => $json['recoveryCode'], 'family' => $json['family']];
    }

    /** 復旧コードで、重要な操作の確認を済ませる（5分間）。 */
    protected function elevate(TestClient $client, string $recoveryCode): TestResponse
    {
        $response = $client->post('/api/v1/elevation', ['recoveryCode' => $recoveryCode]);
        $this->assertSame(200, $response->status(), $response->body());
        return $response;
    }

    /** エラーレスポンスの、HTTP ステータスとコードを確認する。 */
    protected function assertError(TestResponse $response, int $status, string $code): void
    {
        $this->assertSame($status, $response->status(), $response->body());
        $this->assertSame($code, $response->errorCode(), $response->body());
    }
}
