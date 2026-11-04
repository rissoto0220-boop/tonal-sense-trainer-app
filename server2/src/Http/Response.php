<?php

declare(strict_types=1);

namespace UecTst\Http;

/**
 * レスポンス。すべてのレスポンスに Cache-Control: no-store を付ける（ApiSpec_Auth.md 0.1）。
 */
final class Response
{
    /**
     * @param array<string, string> $headers
     * @param list<string> $setCookies Set-Cookie ヘッダの値（複数あるため、別に持つ）
     */
    public function __construct(
        public readonly int $status,
        public readonly string $body = '',
        public readonly array $headers = [],
        public readonly array $setCookies = [],
    ) {
    }

    /**
     * @param array<string, mixed>|list<mixed> $data
     * @param array<string, string> $headers
     * @param list<string> $setCookies
     */
    public static function json(int $status, array $data, array $headers = [], array $setCookies = []): self
    {
        $body = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        return new self($status, $body, $headers + ['Content-Type' => 'application/json; charset=utf-8'], $setCookies);
    }

    public static function noContent(array $headers = [], array $setCookies = []): self
    {
        return new self(204, '', $headers, $setCookies);
    }

    /**
     * @param array<string, string> $headers
     * @param list<string> $setCookies
     */
    public function withAddedHeaders(array $headers, array $setCookies = []): self
    {
        return new self($this->status, $this->body, $headers + $this->headers, [...$this->setCookies, ...$setCookies]);
    }

    /** ヘッダと本文を出力する。 */
    public function send(): void
    {
        http_response_code($this->status);
        header('Cache-Control: no-store');
        foreach ($this->headers as $name => $value) {
            header("{$name}: {$value}");
        }
        foreach ($this->setCookies as $cookie) {
            header('Set-Cookie: ' . $cookie, false);
        }
        if ($this->status !== 204) {
            echo $this->body;
        }
    }
}
