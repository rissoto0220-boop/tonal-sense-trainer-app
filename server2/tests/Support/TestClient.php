<?php

declare(strict_types=1);

namespace UecTst\Tests\Support;

use UecTst\Http\Kernel;
use UecTst\Http\Request;

/**
 * ブラウザの代わりに、API を呼び出すテスト用のクライアント。Cookie を保持し、Origin・Content-Type を自動で付ける。
 */
final class TestClient
{
    public const ORIGIN = 'http://localhost:8888';
    public const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

    /** @var array<string, string> */
    public array $cookies = [];

    public function __construct(
        private readonly Kernel $kernel,
        public string $ip = '198.51.100.1',
        public string $userAgent = self::IPHONE,
    ) {
    }

    /**
     * @param array<string, mixed>|null $body JSON の本文。null なら、本文なし
     * @param array<string, string> $headers 追加のヘッダ（小文字の名前）
     */
    public function request(string $method, string $path, ?array $body = null, array $headers = []): TestResponse
    {
        $baseHeaders = ['origin' => self::ORIGIN, 'user-agent' => $this->userAgent];
        $raw = '';
        if ($body !== null) {
            $baseHeaders['content-type'] = 'application/json';
            $raw = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $baseHeaders['content-length'] = (string) strlen($raw);
        }
        $request = new Request($method, $path, $headers + $baseHeaders, $this->cookies, [], $raw, $this->ip);
        $response = new TestResponse($this->kernel->handle($request));
        $this->absorbCookies($response);
        return $response;
    }

    /** @param array<string, string> $headers */
    public function get(string $path, array $headers = []): TestResponse
    {
        return $this->request('GET', $path, null, $headers);
    }

    /** @param array<string, mixed> $body */
    public function post(string $path, array $body = []): TestResponse
    {
        return $this->request('POST', $path, $body);
    }

    /** @param array<string, mixed> $body */
    public function put(string $path, array $body = []): TestResponse
    {
        return $this->request('PUT', $path, $body);
    }

    /** @param array<string, mixed> $body */
    public function patch(string $path, array $body = []): TestResponse
    {
        return $this->request('PATCH', $path, $body);
    }

    public function delete(string $path): TestResponse
    {
        return $this->request('DELETE', $path);
    }

    public function sessionCookie(): ?string
    {
        return $this->cookies['sid'] ?? null;
    }

    private function absorbCookies(TestResponse $response): void
    {
        foreach ($response->setCookies() as $header) {
            $parts = array_map('trim', explode(';', $header));
            [$name, $value] = explode('=', array_shift($parts), 2) + [1 => ''];
            $maxAge = null;
            foreach ($parts as $attribute) {
                if (stripos($attribute, 'Max-Age=') === 0) {
                    $maxAge = (int) substr($attribute, 8);
                }
            }
            if ($value === '' || $maxAge === 0) {
                unset($this->cookies[$name]);
            } else {
                $this->cookies[$name] = $value;
            }
        }
    }
}
