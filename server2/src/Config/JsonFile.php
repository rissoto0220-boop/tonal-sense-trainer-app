<?php

declare(strict_types=1);

namespace UecTst\Config;

/**
 * 設定の JSON ファイルを読み込む。
 * 失敗時のメッセージには、ファイルのパスと理由だけを含め、内容（パスワードなど）は含めない。
 */
final class JsonFile
{
    /**
     * @return array<string, mixed>
     */
    public static function read(string $path): array
    {
        if (!is_file($path)) {
            throw new ConfigException("設定ファイルが見つかりません: {$path}");
        }
        if (!is_readable($path)) {
            throw new ConfigException("設定ファイルを読み取れません（権限）: {$path}");
        }
        $raw = file_get_contents($path);
        if ($raw === false) {
            throw new ConfigException("設定ファイルを読み取れません: {$path}");
        }
        try {
            $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new ConfigException("設定ファイルが JSON として読めません: {$path}（{$e->getMessage()}）");
        }
        if (!is_array($data) || ($data !== [] && array_is_list($data))) {
            throw new ConfigException("設定ファイルの最上位は JSON のオブジェクトである必要があります: {$path}");
        }
        return $data;
    }
}
