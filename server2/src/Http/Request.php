<?php

declare(strict_types=1);

namespace UecTst\Http;

/**
 * リクエスト。スーパーグローバルに直接触れないよう、ここで一度だけ読み取る（テストでは任意の値を渡せる）。
 */
final class Request
{
    /**
     * @param array<string, string> $headers 小文字のヘッダ名 => 値
     * @param array<string, string> $cookies
     * @param array<string, string> $query
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $headers = [],
        public readonly array $cookies = [],
        public readonly array $query = [],
        private readonly string $rawBody = '',
        public readonly string $clientIp = '0.0.0.0',
    ) {
    }

    /**
     * @param array<string, mixed> $server
     * @param array<string, string> $cookies
     * @param array<string, string> $query
     * @param string|null $trustedProxyHeader クライアントの IP アドレスを、リバースプロキシが付けるヘッダから取る場合のヘッダ名（最後の値を使う）。
     *                                        信頼できるプロキシの背後でだけ指定する（偽装できてしまうため）。null なら、接続元の IP アドレスを使う
     */
    public static function fromGlobals(array $server, array $cookies, array $query, string $rawBody, ?string $trustedProxyHeader = null): self
    {
        $headers = [];
        foreach ($server as $key => $value) {
            if (!is_string($value)) {
                continue;
            }
            if (str_starts_with($key, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr($key, 5)))] = $value;
            } elseif ($key === 'CONTENT_TYPE') {
                $headers['content-type'] = $value;
            } elseif ($key === 'CONTENT_LENGTH') {
                $headers['content-length'] = $value;
            }
        }

        $uri = is_string($server['REQUEST_URI'] ?? null) ? $server['REQUEST_URI'] : '/';
        $path = parse_url($uri, PHP_URL_PATH);
        $path = is_string($path) ? rawurldecode($path) : '/';

        // front controller（index.php）の置き場所を、アプリの基準パスとして取り除く。
        $script = is_string($server['SCRIPT_NAME'] ?? null) ? $server['SCRIPT_NAME'] : '/index.php';
        $base = rtrim(str_replace('\\', '/', dirname($script)), '/');
        if ($base !== '' && str_starts_with($path, $base . '/')) {
            $path = substr($path, strlen($base));
        } elseif ($path === $base) {
            $path = '/';
        }

        $method = is_string($server['REQUEST_METHOD'] ?? null) ? strtoupper($server['REQUEST_METHOD']) : 'GET';
        return new self($method, $path, $headers, $cookies, $query, $rawBody, self::resolveClientIp($server, $headers, $trustedProxyHeader));
    }

    /**
     * @param array<string, mixed> $server
     * @param array<string, string> $headers
     */
    private static function resolveClientIp(array $server, array $headers, ?string $trustedProxyHeader): string
    {
        $remote = is_string($server['REMOTE_ADDR'] ?? null) ? $server['REMOTE_ADDR'] : '0.0.0.0';
        if ($trustedProxyHeader !== null) {
            $value = $headers[strtolower($trustedProxyHeader)] ?? null;
            if ($value !== null) {
                $parts = array_map('trim', explode(',', $value));
                $last = end($parts);
                if (is_string($last) && filter_var($last, FILTER_VALIDATE_IP) !== false) {
                    return $last;
                }
            }
        }
        return filter_var($remote, FILTER_VALIDATE_IP) !== false ? $remote : '0.0.0.0';
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    /** 本文の大きさ（バイト）。 */
    public function bodyLength(): int
    {
        return strlen($this->rawBody);
    }

    public function cookie(string $name): ?string
    {
        return $this->cookies[$name] ?? null;
    }

    public function isJson(): bool
    {
        $type = $this->header('content-type');
        if ($type === null) {
            return false;
        }
        return strtolower(trim(explode(';', $type)[0])) === 'application/json';
    }

    /**
     * 本文を JSON のオブジェクトとして読み取る。本文なしは空の配列（{} と同じ）として扱う。
     *
     * @return array<string, mixed>
     */
    public function json(): array
    {
        if (trim($this->rawBody) === '') {
            return [];
        }
        try {
            $data = json_decode($this->rawBody, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw ApiException::badRequest('リクエストの本文が JSON として読めません。');
        }
        if (!is_array($data) || ($data !== [] && array_is_list($data))) {
            throw ApiException::badRequest('リクエストの本文は JSON のオブジェクトである必要があります。');
        }
        return $data;
    }
}
