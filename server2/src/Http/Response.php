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
        private readonly ?\Closure $streamer = null,
    ) {
    }

    /**
     * 本文を、少しずつ作りながら送るレスポンス（CSV・ZIP のダウンロード）。全体をメモリに載せない。
     * $producer は、本文の断片を受け取る関数 (string): void を受け取り、呼ぶたびに断片を送る。
     * 送り始めた後はステータスを変えられないため、$producer の中のエラーは、接続を切ることで伝える。
     *
     * @param array<string, string> $headers
     * @param \Closure(callable(string): void): void $producer
     */
    public static function streamed(int $status, array $headers, \Closure $producer): self
    {
        return new self($status, '', $headers, [], $producer);
    }

    public function isStreamed(): bool
    {
        return $this->streamer !== null;
    }

    /** 本文の全体を文字列にする（テスト用。ストリームのレスポンスは、ここで最後まで作る）。 */
    public function bodyContents(): string
    {
        if ($this->streamer === null) {
            return $this->body;
        }
        $buffer = '';
        ($this->streamer)(static function (string $chunk) use (&$buffer): void {
            $buffer .= $chunk;
        });
        return $buffer;
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
        return new self($this->status, $this->body, $headers + $this->headers, [...$this->setCookies, ...$setCookies], $this->streamer);
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
        if ($this->streamer !== null) {
            // 出力のバッファを外し、断片ごとに送る。
            while (ob_get_level() > 0) {
                ob_end_flush();
            }
            ($this->streamer)(static function (string $chunk): void {
                echo $chunk;
                flush();
            });
            return;
        }
        if ($this->status !== 204) {
            echo $this->body;
        }
    }
}
