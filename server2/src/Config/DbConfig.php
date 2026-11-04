<?php

declare(strict_types=1);

namespace UecTst\Config;

/**
 * DB の接続情報（DBConfig.json）。環境（開発・本番）ごとに値を変えられるよう、コードの外に置く。
 * パスワードは、文字列化・デバッグ出力・例外メッセージのいずれにも含めない。
 */
final class DbConfig
{
    private function __construct(
        public readonly string $host,
        public readonly int $port,
        public readonly string $database,
        public readonly string $user,
        private readonly string $password,
        public readonly string $charset,
        public readonly string $timezone,
        public readonly int $connectTimeoutSeconds,
        public readonly bool $sslEnabled,
        public readonly string $sslCaFile,
        public readonly bool $sslVerifyServerCert,
    ) {
    }

    /**
     * 既定の置き場所: 環境変数 UECTST_DB_CONFIG、なければ config/DBConfig.json。
     */
    public static function load(?string $path = null): self
    {
        return self::fromArray(JsonFile::read($path ?? self::defaultPath()));
    }

    public static function defaultPath(): string
    {
        $fromEnv = getenv('UECTST_DB_CONFIG');
        if (is_string($fromEnv) && $fromEnv !== '') {
            return $fromEnv;
        }
        return dirname(__DIR__, 2) . '/config/DBConfig.json';
    }

    /**
     * @param array<string, mixed> $data
     */
    public static function fromArray(array $data): self
    {
        $string = static function (string $key, bool $allowEmpty = false) use ($data): string {
            if (!array_key_exists($key, $data)) {
                throw new ConfigException("DBConfig: 必須の項目がありません: {$key}");
            }
            if (!is_string($data[$key])) {
                throw new ConfigException("DBConfig: {$key} は文字列である必要があります");
            }
            if (!$allowEmpty && trim($data[$key]) === '') {
                throw new ConfigException("DBConfig: {$key} が空です");
            }
            return $data[$key];
        };

        if (!array_key_exists('port', $data) || !is_int($data['port']) || $data['port'] < 1 || $data['port'] > 65535) {
            throw new ConfigException('DBConfig: port は 1〜65535 の整数である必要があります');
        }

        $timezone = $string('timezone');
        if (!preg_match('/^[+-](0\d|1[0-4]):[0-5]\d$/', $timezone)) {
            throw new ConfigException('DBConfig: timezone は +00:00 のような UTC からのずれで指定してください');
        }

        $charset = $string('charset');
        if (!preg_match('/^[a-z0-9_]+$/', $charset)) {
            throw new ConfigException('DBConfig: charset の形式が正しくありません');
        }

        $database = $string('database');
        if (!preg_match('/^[A-Za-z0-9_]+$/', $database)) {
            throw new ConfigException('DBConfig: database は英数字と _ のみで指定してください');
        }

        $timeout = $data['connectTimeoutSeconds'] ?? 5;
        if (!is_int($timeout) || $timeout < 1 || $timeout > 60) {
            throw new ConfigException('DBConfig: connectTimeoutSeconds は 1〜60 の整数である必要があります');
        }

        $ssl = $data['ssl'] ?? [];
        if (!is_array($ssl)) {
            throw new ConfigException('DBConfig: ssl はオブジェクトである必要があります');
        }
        $sslEnabled = $ssl['enabled'] ?? false;
        $sslCaFile = $ssl['caFile'] ?? '';
        $sslVerify = $ssl['verifyServerCert'] ?? true;
        if (!is_bool($sslEnabled) || !is_string($sslCaFile) || !is_bool($sslVerify)) {
            throw new ConfigException('DBConfig: ssl.enabled / ssl.verifyServerCert は真偽値、ssl.caFile は文字列である必要があります');
        }
        if ($sslEnabled && $sslVerify && $sslCaFile === '') {
            throw new ConfigException('DBConfig: ssl を有効にして証明書を検証する場合は、ssl.caFile を指定してください');
        }

        return new self(
            host: $string('host'),
            port: $data['port'],
            database: $database,
            user: $string('user'),
            password: $string('password', allowEmpty: true),
            charset: $charset,
            timezone: $timezone,
            connectTimeoutSeconds: $timeout,
            sslEnabled: $sslEnabled,
            sslCaFile: $sslCaFile,
            sslVerifyServerCert: $sslVerify,
        );
    }

    public function dsn(): string
    {
        return sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $this->host,
            $this->port,
            $this->database,
            $this->charset,
        );
    }

    public function user(): string
    {
        return $this->user;
    }

    public function password(): string
    {
        return $this->password;
    }

    /**
     * @return array<int, mixed> PDO のオプション
     */
    public function pdoOptions(): array
    {
        $options = [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            \PDO::ATTR_EMULATE_PREPARES => false,
            \PDO::ATTR_STRINGIFY_FETCHES => false,
            \PDO::ATTR_TIMEOUT => $this->connectTimeoutSeconds,
        ];
        if ($this->sslEnabled) {
            if ($this->sslCaFile !== '') {
                $options[self::sslCaOption()] = $this->sslCaFile;
            }
            $options[self::sslVerifyOption()] = $this->sslVerifyServerCert;
        }
        return $options;
    }

    /** PHP 8.5 で PDO::MYSQL_ATTR_* が非推奨になったため、新しい定数があれば、そちらを使う（PHP 8.2〜8.5 で動かすため）。 */
    public static function sslCaOption(): int
    {
        return \defined('Pdo\\Mysql::ATTR_SSL_CA') ? \constant('Pdo\\Mysql::ATTR_SSL_CA') : \constant('PDO::MYSQL_ATTR_SSL_CA');
    }

    public static function sslVerifyOption(): int
    {
        return \defined('Pdo\\Mysql::ATTR_SSL_VERIFY_SERVER_CERT') ? \constant('Pdo\\Mysql::ATTR_SSL_VERIFY_SERVER_CERT') : \constant('PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT');
    }

    /** var_dump などでパスワードが出ないようにする。 */
    public function __debugInfo(): array
    {
        return [
            'host' => $this->host,
            'port' => $this->port,
            'database' => $this->database,
            'user' => $this->user,
            'password' => '(hidden)',
        ];
    }
}
