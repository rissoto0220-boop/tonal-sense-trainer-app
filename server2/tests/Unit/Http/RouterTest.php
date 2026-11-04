<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Http;

use PHPUnit\Framework\TestCase;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Http\Router;

final class RouterTest extends TestCase
{
    private function router(): Router
    {
        $router = new Router();
        $router->add('GET', '/api/v1/users', static fn (Request $r, array $p): Response => Response::json(200, ['route' => 'list']));
        $router->add('DELETE', '/api/v1/users/{userId}', static fn (Request $r, array $p): Response => Response::json(200, ['route' => 'delete', 'params' => $p]));
        $router->add('PUT', '/api/v1/users/order', static fn (Request $r, array $p): Response => Response::json(200, ['route' => 'order']));
        $router->add('DELETE', '/api/v1/org/organizations/{organizationId}/password-reset', static fn (Request $r, array $p): Response => Response::json(200, ['params' => $p]));
        return $router;
    }

    public function testExactPathIsMatched(): void
    {
        $response = $this->router()->dispatch(new Request('GET', '/api/v1/users'));
        $this->assertSame('{"route":"list"}', $response->body);
    }

    public function testPathParameterIsCaptured(): void
    {
        $response = $this->router()->dispatch(new Request('DELETE', '/api/v1/users/0192f3a0-0000-7000-8000-000000000001'));
        $this->assertSame('{"route":"delete","params":{"userId":"0192f3a0-0000-7000-8000-000000000001"}}', $response->body);
    }

    public function testLiteralSegmentWinsWhenRegisteredAndMatches(): void
    {
        $response = $this->router()->dispatch(new Request('PUT', '/api/v1/users/order'));
        $this->assertSame('{"route":"order"}', $response->body);
    }

    public function testParameterDoesNotMatchAcrossSlashes(): void
    {
        $this->expectException(ApiException::class);
        $this->router()->dispatch(new Request('DELETE', '/api/v1/users/a/b'));
    }

    public function testUnknownPathIsNotFound(): void
    {
        try {
            $this->router()->dispatch(new Request('GET', '/api/v1/nothing'));
            $this->fail('例外が発生するはず');
        } catch (ApiException $e) {
            $this->assertSame(404, $e->status);
            $this->assertSame('NOT_FOUND', $e->errorCode);
        }
    }

    public function testWrongMethodIsMethodNotAllowedWithAllowHeader(): void
    {
        try {
            $this->router()->dispatch(new Request('POST', '/api/v1/users'));
            $this->fail('例外が発生するはず');
        } catch (ApiException $e) {
            $this->assertSame(405, $e->status);
            $this->assertSame('GET', $e->headers['Allow']);
        }
    }

    public function testRegexCharactersInRoutesAreTreatedLiterally(): void
    {
        $router = new Router();
        $router->add('GET', '/api/v1/a.b', static fn (Request $r, array $p): Response => Response::json(200, []));
        $this->expectException(ApiException::class);
        $router->dispatch(new Request('GET', '/api/v1/aXb'));
    }

    public function testHyphenatedSegmentsAndTrailingLiteralAfterParameter(): void
    {
        $response = $this->router()->dispatch(new Request('DELETE', '/api/v1/org/organizations/abc/password-reset'));
        $this->assertSame('{"params":{"organizationId":"abc"}}', $response->body);
    }
}
