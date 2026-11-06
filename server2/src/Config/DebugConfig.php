<?php

declare(strict_types=1);

namespace UecTst\Config;

/**
 * デバッグ状態の設定（AppConfig.json の debug）。
 *
 * 二段構えにして、デバッグ用の機能が意図せず有効のまま運用されることを防ぐ。
 *  - enabled が false（または debug の記載なし）なら、features の値に関係なく、すべての機能が無効
 *  - enabled が true でも、features で true にした機能だけが有効
 * production では enabled を true にできない（AppConfig で拒否する）。
 */
final class DebugConfig
{
    /** メールを送らず、送信内容をブラウザで表示する（メール表示ページ）。 */
    public const FEATURE_MAIL_VIEWER = 'mailViewer';

    /** 指定できる機能。綴りの誤りで、無効のつもりが有効になる（またはその逆）ことを防ぐため、未知の名前は拒否する。 */
    public const FEATURES = [self::FEATURE_MAIL_VIEWER];

    /**
     * @param array<string, bool> $features
     */
    private function __construct(
        public readonly bool $enabled,
        private readonly array $features,
    ) {
    }

    public static function disabled(): self
    {
        return new self(false, []);
    }

    /**
     * @param mixed $data AppConfig.json の debug（省略時は null）
     */
    public static function fromArray(mixed $data, bool $isProduction): self
    {
        if ($data === null) {
            return self::disabled();
        }
        if (!is_array($data) || array_is_list($data) && $data !== []) {
            throw new ConfigException('AppConfig: debug はオブジェクトである必要があります');
        }
        $unknown = array_diff(array_keys($data), ['enabled', 'features']);
        if ($unknown !== []) {
            throw new ConfigException('AppConfig: debug に、未知の項目があります: ' . implode(', ', array_map('strval', $unknown)));
        }

        $enabled = $data['enabled'] ?? false;
        if (!is_bool($enabled)) {
            throw new ConfigException('AppConfig: debug.enabled は真偽値である必要があります');
        }
        if ($enabled && $isProduction) {
            throw new ConfigException('AppConfig: production では debug.enabled を true にできません（デバッグ状態のまま運用することを防ぐため）');
        }

        $rawFeatures = $data['features'] ?? [];
        if (!is_array($rawFeatures) || array_is_list($rawFeatures) && $rawFeatures !== []) {
            throw new ConfigException('AppConfig: debug.features はオブジェクトである必要があります');
        }
        $features = [];
        foreach ($rawFeatures as $name => $value) {
            if (!in_array($name, self::FEATURES, true)) {
                throw new ConfigException('AppConfig: debug.features に、未知の機能があります: ' . $name . '（指定できる機能: ' . implode(', ', self::FEATURES) . '）');
            }
            if (!is_bool($value)) {
                throw new ConfigException("AppConfig: debug.features.{$name} は真偽値である必要があります");
            }
            $features[$name] = $value;
        }

        return new self($enabled, $features);
    }

    /** その機能が有効か（大元の enabled が false なら、常に false）。 */
    public function isOn(string $feature): bool
    {
        return $this->enabled && ($this->features[$feature] ?? false);
    }
}
