<?php

declare(strict_types=1);

namespace UecTst\Tests\Support;

use UecTst\Http\Response;

/** API のレスポンスを、テストで確認しやすい形にしたもの。 */
final class TestResponse
{
    public function __construct(private readonly Response $response)
    {
    }

    public function status(): int
    {
        return $this->response->status;
    }

    public function body(): string
    {
        return $this->response->body;
    }

    /** @return array<string, mixed> */
    public function json(): array
    {
        $data = json_decode($this->response->body, true, 32, JSON_THROW_ON_ERROR);
        return is_array($data) ? $data : [];
    }

    /** エラーレスポンスの code（なければ null）。 */
    public function errorCode(): ?string
    {
        return $this->json()['error']['code'] ?? null;
    }

    public function header(string $name): ?string
    {
        foreach ($this->response->headers as $key => $value) {
            if (strcasecmp($key, $name) === 0) {
                return $value;
            }
        }
        return null;
    }

    /** @return list<string> Set-Cookie ヘッダの値 */
    public function setCookies(): array
    {
        return $this->response->setCookies;
    }
}
