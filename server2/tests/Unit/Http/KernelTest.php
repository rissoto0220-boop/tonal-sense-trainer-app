<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Http;

use PHPUnit\Framework\TestCase;
use UecTst\Http\ApiException;
use UecTst\Http\Kernel;
use UecTst\Http\OriginGuard;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Http\Router;
use UecTst\Log\Logger;

final class KernelTest extends TestCase
{
    private string $logFile;

    protected function setUp(): void
    {
        $this->logFile = sys_get_temp_dir() . '/uectst-kernel-' . bin2hex(random_bytes(4)) . '.log';
    }

    protected function tearDown(): void
    {
        @unlink($this->logFile);
    }

    private function kernel(Router $router): Kernel
    {
        return new Kernel($router, new OriginGuard(['https://uec-tst.koto.jp']), new Logger($this->logFile));
    }

    public function testSuccessfulResponseIsReturned(): void
    {
        $router = new Router();
        $router->add('GET', '/ok', static fn (Request $r, array $p): Response => Response::json(200, ['ok' => true]));
        $response = $this->kernel($router)->handle(new Request('GET', '/ok'));
        $this->assertSame(200, $response->status);
        $this->assertSame('{"ok":true}', $response->body);
        $this->assertSame('application/json; charset=utf-8', $response->headers['Content-Type']);
    }

    public function testApiExceptionBecomesSpecErrorFormat(): void
    {
        $router = new Router();
        $router->add('POST', '/v', static function (Request $r, array $p): Response {
            throw ApiException::validationFailed('ユーザ名を入力してください。', [['field' => 'users[1].name', 'code' => 'REQUIRED']]);
        });
        $response = $this->kernel($router)->handle(new Request('POST', '/v', ['origin' => 'https://uec-tst.koto.jp', 'content-type' => 'application/json']));
        $this->assertSame(422, $response->status);
        $this->assertSame(
            '{"error":{"code":"VALIDATION_FAILED","message":"ユーザ名を入力してください。","details":[{"field":"users[1].name","code":"REQUIRED"}]}}',
            $response->body,
        );
    }

    public function testNotFoundAndMethodNotAllowedUseErrorFormat(): void
    {
        $router = new Router();
        $router->add('GET', '/x', static fn (Request $r, array $p): Response => Response::json(200, []));
        $kernel = $this->kernel($router);

        $notFound = $kernel->handle(new Request('GET', '/none'));
        $this->assertSame(404, $notFound->status);
        $this->assertStringContainsString('"code":"NOT_FOUND"', $notFound->body);

        $notAllowed = $kernel->handle(new Request('GET', '/x'));
        $this->assertSame(200, $notAllowed->status);
    }

    public function testRateLimitedCarriesRetryAfter(): void
    {
        $router = new Router();
        $router->add('GET', '/r', static function (Request $r, array $p): Response {
            throw ApiException::rateLimited(120);
        });
        $response = $this->kernel($router)->handle(new Request('GET', '/r'));
        $this->assertSame(429, $response->status);
        $this->assertSame('120', $response->headers['Retry-After']);
        $this->assertStringContainsString('"code":"RATE_LIMITED"', $response->body);
    }

    public function testCsrfGuardRunsBeforeRouting(): void
    {
        $router = new Router();
        $router->add('POST', '/p', static fn (Request $r, array $p): Response => Response::json(200, []));
        $response = $this->kernel($router)->handle(new Request('POST', '/p', ['content-type' => 'application/json']));
        $this->assertSame(403, $response->status);
        $this->assertStringContainsString('"code":"FORBIDDEN_ORIGIN"', $response->body);
    }

    public function testUnexpectedExceptionIsHiddenFromClientAndLogged(): void
    {
        $router = new Router();
        $router->add('GET', '/boom', static function (Request $r, array $p): Response {
            throw new \RuntimeException('SQLSTATE[HY000] password=s3cret-password');
        });
        $response = $this->kernel($router)->handle(new Request('GET', '/boom'));

        $this->assertSame(500, $response->status);
        $this->assertStringContainsString('"code":"INTERNAL_ERROR"', $response->body);
        $this->assertStringNotContainsString('s3cret-password', $response->body);
        $this->assertStringNotContainsString('SQLSTATE', $response->body);

        $log = (string) file_get_contents($this->logFile);
        $this->assertStringContainsString('unhandled exception', $log);
        $this->assertStringContainsString('RuntimeException', $log);
        $this->assertStringNotContainsString('s3cret-password', $log, '例外のメッセージは、ログにも残さない');
    }
}
