<?php

declare(strict_types=1);

namespace UecTst\Config;

/**
 * アプリケーション全体の設定（AppConfig.json）。環境ごとに値を変えられるよう、コードの外に置く。
 * 鍵などの秘密の値は、文字列化・デバッグ出力に含めない。
 */
final class AppConfig
{
    /** サンプル（AppConfig.sample.json）の開発専用の鍵。本番では、これらの値を使うことを拒否する。 */
    private const DEV_SAMPLE_KEYS = [
        'ZGV2LW9ubHktcmVjb3ZlcnktY29kZS1obWFjLWtleS0wMQ==',
        'ZGV2LW9ubHktcmF0ZS1saW1pdC1obWFjLWtleS0wMDAx',
    ];

    private const MIN_KEY_BYTES = 32;

    /**
     * @param list<string> $allowedOrigins
     * @param array<int, string> $recoveryCodeKeys 鍵の識別子 => 鍵（バイナリ）
     */
    private function __construct(
        public readonly string $environment,
        public readonly array $allowedOrigins,
        public readonly string $publicBaseUrl,
        public readonly bool $cookieSecure,
        public readonly bool $cookieUseHostPrefix,
        public readonly string $mailDriver,
        public readonly string $mailFrom,
        public readonly string $mailLogFile,
        public readonly string $captchaDriver,
        private readonly string $captchaSecretKey,
        private readonly array $recoveryCodeKeys,
        public readonly int $currentRecoveryCodeKeyId,
        private readonly string $rateLimitKey,
        public readonly ?string $trustedProxyHeader,
        public readonly string $logFile,
        public readonly string $webauthnRpId,
        public readonly string $webauthnRpName,
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
        $isProduction = $environment === 'production';

        $origins = $data['allowedOrigins'] ?? null;
        if (!is_array($origins) || $origins === [] || !array_is_list($origins)) {
            throw new ConfigException('AppConfig: allowedOrigins は1件以上の配列である必要があります');
        }
        foreach ($origins as $origin) {
            if (!is_string($origin) || !preg_match('#^https?://[^/\s?\#]+$#', $origin)) {
                throw new ConfigException('AppConfig: allowedOrigins の各要素は https://host[:port] の形式である必要があります（末尾の / やパスは付けない）');
            }
            if ($isProduction && !str_starts_with($origin, 'https://')) {
                throw new ConfigException('AppConfig: production では allowedOrigins は https のみ指定できます');
            }
        }

        $publicBaseUrl = $data['publicBaseUrl'] ?? null;
        if (!is_string($publicBaseUrl) || !preg_match('#^https?://[^/\s?\#]+(/[^\s?\#]*)?$#', $publicBaseUrl) || str_ends_with($publicBaseUrl, '/')) {
            throw new ConfigException('AppConfig: publicBaseUrl は https://host[:port][/path] の形式（末尾の / なし）である必要があります');
        }
        if ($isProduction && !str_starts_with($publicBaseUrl, 'https://')) {
            throw new ConfigException('AppConfig: production では publicBaseUrl は https のみ指定できます');
        }

        $cookie = $data['cookie'] ?? null;
        if (!is_array($cookie) || !is_bool($cookie['secure'] ?? null) || !is_bool($cookie['useHostPrefix'] ?? null)) {
            throw new ConfigException('AppConfig: cookie.secure と cookie.useHostPrefix は真偽値である必要があります');
        }
        if ($isProduction && (!$cookie['secure'] || !$cookie['useHostPrefix'])) {
            throw new ConfigException('AppConfig: production では cookie.secure と cookie.useHostPrefix を true にしてください');
        }

        $mail = $data['mail'] ?? null;
        if (!is_array($mail) || !in_array($mail['driver'] ?? null, ['log'], true)) {
            throw new ConfigException('AppConfig: mail.driver は log である必要があります（他の送信方法は、今後追加します）');
        }
        $mailFrom = $mail['from'] ?? null;
        if (!is_string($mailFrom) || filter_var($mailFrom, FILTER_VALIDATE_EMAIL) === false) {
            throw new ConfigException('AppConfig: mail.from はメールアドレスである必要があります');
        }
        $mailLogFile = $mail['logFile'] ?? 'storage/logs/mail.log';
        if (!is_string($mailLogFile) || trim($mailLogFile) === '') {
            throw new ConfigException('AppConfig: mail.logFile は空でない文字列である必要があります');
        }

        $captcha = $data['captcha'] ?? null;
        if (!is_array($captcha) || !in_array($captcha['driver'] ?? null, ['none', 'turnstile'], true)) {
            throw new ConfigException('AppConfig: captcha.driver は none または turnstile である必要があります');
        }
        $captchaSecret = $captcha['secretKey'] ?? '';
        if (!is_string($captchaSecret)) {
            throw new ConfigException('AppConfig: captcha.secretKey は文字列である必要があります');
        }
        if ($captcha['driver'] === 'turnstile' && $captchaSecret === '') {
            throw new ConfigException('AppConfig: captcha.driver が turnstile の場合は、captcha.secretKey が必要です');
        }
        if ($isProduction && $captcha['driver'] !== 'turnstile') {
            throw new ConfigException('AppConfig: production では captcha.driver を turnstile にしてください（仮登録メールの踏み台対策）');
        }

        $secrets = $data['secrets'] ?? null;
        if (!is_array($secrets)) {
            throw new ConfigException('AppConfig: secrets が必要です');
        }
        $rawKeys = $secrets['recoveryCodeKeys'] ?? null;
        if (!is_array($rawKeys) || $rawKeys === []) {
            throw new ConfigException('AppConfig: secrets.recoveryCodeKeys は1件以上のオブジェクトである必要があります');
        }
        $recoveryKeys = [];
        foreach ($rawKeys as $id => $encoded) {
            if (!preg_match('/^[1-9][0-9]{0,4}$/', (string) $id) || (int) $id > 65535) {
                throw new ConfigException('AppConfig: secrets.recoveryCodeKeys の識別子は 1〜65535 の整数である必要があります');
            }
            $recoveryKeys[(int) $id] = self::decodeKey($encoded, "secrets.recoveryCodeKeys.{$id}", $isProduction);
        }
        $currentKeyId = $secrets['currentRecoveryCodeKeyId'] ?? null;
        if (!is_int($currentKeyId) || !isset($recoveryKeys[$currentKeyId])) {
            throw new ConfigException('AppConfig: secrets.currentRecoveryCodeKeyId は、secrets.recoveryCodeKeys にある識別子である必要があります');
        }
        $rateLimitKey = self::decodeKey($secrets['rateLimitKey'] ?? null, 'secrets.rateLimitKey', $isProduction);

        $proxyHeader = $data['trustedProxyHeader'] ?? null;
        if ($proxyHeader !== null && (!is_string($proxyHeader) || !preg_match('/^[A-Za-z][A-Za-z0-9-]*$/', $proxyHeader))) {
            throw new ConfigException('AppConfig: trustedProxyHeader は null またはヘッダ名（例: X-Forwarded-For）である必要があります');
        }

        $logFile = $data['logFile'] ?? 'storage/logs/app.log';
        if (!is_string($logFile) || trim($logFile) === '') {
            throw new ConfigException('AppConfig: logFile は空でない文字列である必要があります');
        }

        $webauthn = $data['webauthn'] ?? [];
        if (!is_array($webauthn)) {
            throw new ConfigException('AppConfig: webauthn はオブジェクトである必要があります');
        }
        $rpId = $webauthn['rpId'] ?? parse_url($publicBaseUrl, PHP_URL_HOST);
        if (!is_string($rpId) || !preg_match('/^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/', $rpId)) {
            throw new ConfigException('AppConfig: webauthn.rpId はドメイン名である必要があります（省略時は publicBaseUrl のホスト名）');
        }
        $rpName = $webauthn['rpName'] ?? 'TonalSenseTrainer';
        if (!is_string($rpName) || trim($rpName) === '') {
            throw new ConfigException('AppConfig: webauthn.rpName は空でない文字列である必要があります');
        }

        return new self(
            environment: $environment,
            allowedOrigins: array_values($origins),
            publicBaseUrl: $publicBaseUrl,
            cookieSecure: $cookie['secure'],
            cookieUseHostPrefix: $cookie['useHostPrefix'],
            mailDriver: $mail['driver'],
            mailFrom: $mailFrom,
            mailLogFile: self::absolutePath($mailLogFile),
            captchaDriver: $captcha['driver'],
            captchaSecretKey: $captchaSecret,
            recoveryCodeKeys: $recoveryKeys,
            currentRecoveryCodeKeyId: $currentKeyId,
            rateLimitKey: $rateLimitKey,
            trustedProxyHeader: $proxyHeader,
            logFile: self::absolutePath($logFile),
            webauthnRpId: strtolower($rpId),
            webauthnRpName: $rpName,
        );
    }

    private static function absolutePath(string $path): string
    {
        return str_starts_with($path, '/') ? $path : dirname(__DIR__, 2) . '/' . $path;
    }

    private static function decodeKey(mixed $encoded, string $name, bool $isProduction): string
    {
        if (!is_string($encoded) || $encoded === '') {
            throw new ConfigException("AppConfig: {$name} が必要です（base64 の文字列）");
        }
        $binary = base64_decode($encoded, true);
        if ($binary === false || strlen($binary) < self::MIN_KEY_BYTES) {
            throw new ConfigException("AppConfig: {$name} は、32バイト以上の鍵を base64 で表した文字列である必要があります");
        }
        if ($isProduction && in_array($encoded, self::DEV_SAMPLE_KEYS, true)) {
            throw new ConfigException("AppConfig: {$name} に、サンプルの開発用の鍵が指定されています。production では、新しく生成した鍵を使ってください");
        }
        return $binary;
    }

    public function isProduction(): bool
    {
        return $this->environment === 'production';
    }

    /** @return array<int, string> 鍵の識別子 => 鍵（バイナリ）。復旧コードの HMAC に使う */
    public function recoveryCodeKeys(): array
    {
        return $this->recoveryCodeKeys;
    }

    /** 回数制限のカウンターのキー（IP アドレスなど）を HMAC 化するための鍵。 */
    public function rateLimitKey(): string
    {
        return $this->rateLimitKey;
    }

    public function captchaSecretKey(): string
    {
        return $this->captchaSecretKey;
    }

    /** var_dump などで、鍵が出ないようにする。 */
    public function __debugInfo(): array
    {
        return [
            'environment' => $this->environment,
            'publicBaseUrl' => $this->publicBaseUrl,
            'allowedOrigins' => $this->allowedOrigins,
            'secrets' => '(hidden)',
        ];
    }
}
