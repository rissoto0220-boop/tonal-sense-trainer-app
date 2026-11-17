<?php

declare(strict_types=1);

namespace UecTst\Log;

/**
 * 単純なファイルのロガー。パスワード・トークン・メールアドレスなどは、呼び出し側が渡さないこと。
 */
final class Logger
{
    public function __construct(private readonly string $file)
    {
    }

    /**
     * 操作の記録（ApiSpec_Belonging.md 8.）など。パスワード・トークン・メールアドレスは、渡さないこと。
     *
     * @param array<string, scalar|null> $context
     */
    public function info(string $message, array $context = []): void
    {
        $this->write('INFO', $message, $context);
    }

    /**
     * @param array<string, scalar|null> $context
     */
    public function error(string $message, array $context = []): void
    {
        $this->write('ERROR', $message, $context);
    }

    /**
     * @param array<string, scalar|null> $context
     */
    public function warning(string $message, array $context = []): void
    {
        $this->write('WARNING', $message, $context);
    }

    /**
     * @param array<string, scalar|null> $context
     */
    private function write(string $level, string $message, array $context): void
    {
        $dir = dirname($this->file);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        $line = sprintf(
            "%s %s %s%s\n",
            gmdate('Y-m-d\TH:i:s\Z'),
            $level,
            str_replace(["\r", "\n"], ' ', $message),
            $context === [] ? '' : ' ' . json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        );
        @file_put_contents($this->file, $line, FILE_APPEND | LOCK_EX);
    }
}
