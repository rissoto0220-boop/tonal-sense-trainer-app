<?php

declare(strict_types=1);

namespace UecTst\Config;

/**
 * アプリケーション全体の設定（AppConfig.json）。環境ごとに値を変えられるよう、コードの外に置く。
 * 段階0では、CSRF 対策のオリジン、Cookie の属性、ログの出力先だけを持つ。
 * 鍵・メール・CAPTCHA・パスキーの RP ID などは、必要になった段階で追加する。
 */
final class AppConfig
{
    /**
     * @param list<string> $allowedOrigins
     */
    private function __construct(
        public readonly string $environment,
        public readonly array $allowedOrigins,
        public readonly bool $cookieSecure,
        public readonly bool $cookieUseHostPrefix,
        public readonly string $logFile,
    ) {
    }

    public static function load(?string $path = null): self
    {
        return self::fromArray(JsonFile::read($path ?? self::defaultPath()));
    }

    public static function defaultPath(): string
    {
        $fromEnv = getenv('UECTST_APP_CONFIG');
        if (is_string($fromEnv) && $fromEnv !== '') {
            return $fromEnv;
        }
        return dirname(__DIR__, 2) . '/config/AppConfig.json';
    }

    /**
     * @param array<string, mixed> $data
     */
    public static function fromArray(array $data): self
    {
        $environment = $data['environment'] ?? null;
        if (!in_array($environment, ['development', 'production'], true)) {
            throw new ConfigException('AppConfig: environment は development または production である必要があります');
        }

        $origins = $data['allowedOrigins'] ?? null;
        if (!is_array($origins) || $origins === [] || !array_is_list($origins)) {
            throw new ConfigException('AppConfig: allowedOrigins は1件以上の配列である必要があります');
        }
        foreach ($origins as $origin) {
            if (!is_string($origin) || !preg_match('#^https?://[^/\s?\#]+$#', $origin)) {
                throw new ConfigException('AppConfig: allowedOrigins の各要素は https://host[:port] の形式である必要があります（末尾の / やパスは付けない）');
            }
        }

        $cookie = $data['cookie'] ?? null;
        if (!is_array($cookie) || !is_bool($cookie['secure'] ?? null) || !is_bool($cookie['useHostPrefix'] ?? null)) {
            throw new ConfigException('AppConfig: cookie.secure と cookie.useHostPrefix は真偽値である必要があります');
        }

        if ($environment === 'production') {
            if (!$cookie['secure'] || !$cookie['useHostPrefix']) {
                throw new ConfigException('AppConfig: production では cookie.secure と cookie.useHostPrefix を true にしてください');
            }
            foreach ($origins as $origin) {
                if (!str_starts_with($origin, 'https://')) {
                    throw new ConfigException('AppConfig: production では allowedOrigins は https のみ指定できます');
                }
            }
        }

        $logFile = $data['logFile'] ?? 'storage/logs/app.log';
        if (!is_string($logFile) || trim($logFile) === '') {
            throw new ConfigException('AppConfig: logFile は空でない文字列である必要があります');
        }
        if (!str_starts_with($logFile, '/')) {
            $logFile = dirname(__DIR__, 2) . '/' . $logFile;
        }

        return new self(
            environment: $environment,
            allowedOrigins: array_values($origins),
            cookieSecure: $cookie['secure'],
            cookieUseHostPrefix: $cookie['useHostPrefix'],
            logFile: $logFile,
        );
    }

    public function isProduction(): bool
    {
        return $this->environment === 'production';
    }
}
