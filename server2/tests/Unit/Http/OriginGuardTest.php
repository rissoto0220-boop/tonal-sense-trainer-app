<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Http;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use UecTst\Http\ApiException;
use UecTst\Http\OriginGuard;
use UecTst\Http\Request;

final class OriginGuardTest extends TestCase
{
    private function guard(): OriginGuard
    {
        return new OriginGuard(['https://uec-tst.koto.jp', 'http://localhost:8888']);
    }

    /** @param array<string, string> $headers */
    private function request(string $method, array $headers, string $body = '{}'): Request
    {
        return new Request($method, '/api/v1/x', array_change_key_case($headers), [], [], $body);
    }

    private function assertForbidden(Request $request): void
    {
        try {
            $this->guard()->check($request);
            $this->fail('403 になるはず');
        } catch (ApiException $e) {
            $this->assertSame(403, $e->status);
            $this->assertSame('FORBIDDEN_ORIGIN', $e->errorCode);
        }
    }

    public function testSafeMethodsAreNotChecked(): void
    {
        foreach (['GET', 'HEAD', 'OPTIONS'] as $method) {
            $this->guard()->check($this->request($method, []));
        }
        $this->addToAssertionCount(1);
    }

    /** @return array<string, array{string}> */
    public static function mutatingMethods(): array
    {
        return ['POST' => ['POST'], 'PUT' => ['PUT'], 'PATCH' => ['PATCH'], 'DELETE' => ['DELETE']];
    }

    #[DataProvider('mutatingMethods')]
    public function testAllowedOriginWithJsonIsAccepted(string $method): void
    {
        $this->guard()->check($this->request($method, ['Origin' => 'https://uec-tst.koto.jp', 'Content-Type' => 'application/json; charset=utf-8', 'Content-Length' => '2']));
        $this->addToAssertionCount(1);
    }

    #[DataProvider('mutatingMethods')]
    public function testMissingOriginIsRejected(string $method): void
    {
        $this->assertForbidden($this->request($method, ['Content-Type' => 'application/json']));
    }

    public function testOtherOriginsAreRejected(): void
    {
        foreach (['https://evil.example', 'https://uec-tst.koto.jp.evil.example', 'http://uec-tst.koto.jp', 'https://uec-tst.koto.jp:8443', 'null', 'https://UEC-TST.KOTO.JP'] as $origin) {
            $this->assertForbidden($this->request('POST', ['Origin' => $origin, 'Content-Type' => 'application/json']));
        }
    }

    public function testFormContentTypesAreRejected(): void
    {
        foreach (['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain', ''] as $type) {
            $headers = ['Origin' => 'https://uec-tst.koto.jp'];
            if ($type !== '') {
                $headers['Content-Type'] = $type;
            }
            $this->assertForbidden($this->request('POST', $headers));
        }
    }

    public function testDeleteWithoutBodyNeedsNoContentType(): void
    {
        $this->guard()->check($this->request('DELETE', ['Origin' => 'https://uec-tst.koto.jp'], ''));
        $this->addToAssertionCount(1);
    }

    public function testDeleteWithBodyNeedsJsonContentType(): void
    {
        $this->assertForbidden($this->request('DELETE', ['Origin' => 'https://uec-tst.koto.jp', 'Content-Length' => '5', 'Content-Type' => 'text/plain']));
    }

    public function testDeleteStillNeedsOrigin(): void
    {
        $this->assertForbidden($this->request('DELETE', [], ''));
    }
}
