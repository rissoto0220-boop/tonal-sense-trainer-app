<?php

declare(strict_types=1);

namespace UecTst\Tests\Unit\Http;

use PHPUnit\Framework\TestCase;
use UecTst\Http\ApiException;
use UecTst\Http\Request;

final class RequestTest extends TestCase
{
    public function testPathIsRelativeToFrontControllerDirectory(): void
    {
        $request = Request::fromGlobals(
            ['REQUEST_METHOD' => 'post', 'REQUEST_URI' => '/uec-tst/server2/public/api/v1/sessions?x=1', 'SCRIPT_NAME' => '/uec-tst/server2/public/index.php'],
            [], [], '',
        );
        $this->assertSame('POST', $request->method);
        $this->assertSame('/api/v1/sessions', $request->path);
    }

    public function testIndexPhpInTheUrlIsAlsoStripped(): void
    {
        // URL Rewrite が使えない環境（MAMP の初期設定など）では、index.php を含む URL で呼ばれる。
        $server = ['REQUEST_METHOD' => 'GET', 'SCRIPT_NAME' => '/uec-tst/server2/public/index.php'];
        $request = Request::fromGlobals($server + ['REQUEST_URI' => '/uec-tst/server2/public/index.php/api/v1/sessions?x=1'], [], [], '');
        $this->assertSame('/api/v1/sessions', $request->path);
        $this->assertSame('/uec-tst/server2/public/index.php', $request->basePath);

        $rewritten = Request::fromGlobals($server + ['REQUEST_URI' => '/uec-tst/server2/public/debug/mails'], [], [], '');
        $this->assertSame('/debug/mails', $rewritten->path);
        $this->assertSame('/uec-tst/server2/public', $rewritten->basePath);

        $root = Request::fromGlobals($server + ['REQUEST_URI' => '/uec-tst/server2/public/index.php'], [], [], '');
        $this->assertSame('/', $root->path);
    }

    public function testBasePathIsEmptyAtDocumentRoot(): void
    {
        $request = Request::fromGlobals(['REQUEST_METHOD' => 'GET', 'REQUEST_URI' => '/debug/mails', 'SCRIPT_NAME' => '/index.php'], [], [], '');
        $this->assertSame('/debug/mails', $request->path);
        $this->assertSame('', $request->basePath);
    }

    public function testPathAtDocumentRootIsUnchanged(): void
    {
        $request = Request::fromGlobals(['REQUEST_METHOD' => 'GET', 'REQUEST_URI' => '/api/v1/users', 'SCRIPT_NAME' => '/index.php'], [], [], '');
        $this->assertSame('/api/v1/users', $request->path);
    }

    public function testHeadersAreNormalizedToLowercase(): void
    {
        $request = Request::fromGlobals(
            ['REQUEST_METHOD' => 'POST', 'REQUEST_URI' => '/', 'SCRIPT_NAME' => '/index.php', 'HTTP_ORIGIN' => 'https://example.com', 'CONTENT_TYPE' => 'application/json; charset=utf-8', 'HTTP_X_FORWARDED_FOR' => '1.2.3.4'],
            [], [], '{}',
        );
        $this->assertSame('https://example.com', $request->header('Origin'));
        $this->assertTrue($request->isJson());
        $this->assertSame('1.2.3.4', $request->header('x-forwarded-for'));
    }

    public function testJsonObjectIsParsed(): void
    {
        $request = new Request('POST', '/', [], [], [], '{"name":"はなこ","n":1}');
        $this->assertSame(['name' => 'はなこ', 'n' => 1], $request->json());
    }

    public function testEmptyBodyIsEmptyObject(): void
    {
        $this->assertSame([], (new Request('POST', '/'))->json());
    }

    public function testInvalidJsonAndNonObjectAreBadRequest(): void
    {
        foreach (['{broken', '[1,2]', '"text"', '123'] as $body) {
            try {
                (new Request('POST', '/', [], [], [], $body))->json();
                $this->fail("拒否されるはず: {$body}");
            } catch (ApiException $e) {
                $this->assertSame(400, $e->status);
                $this->assertSame('BAD_REQUEST', $e->errorCode);
            }
        }
    }
}
