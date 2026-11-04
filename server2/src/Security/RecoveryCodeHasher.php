<?php

declare(strict_types=1);

namespace UecTst\Security;

use RuntimeException;

/**
 * 復旧コードの HMAC-SHA256（基本方針 6.1）。鍵はデータベースとは別の場所（設定ファイル）で管理し、
 * 鍵を切り替えても、旧鍵で作られたハッシュを照合できるよう、鍵の識別子を一緒に保存する（TableSpec_Account.md 2.3）。
 */
final class RecoveryCodeHasher
{
    /**
     * @param array<int, string> $keys 鍵の識別子 => 鍵（バイナリ）
     */
    public function __construct(private readonly array $keys, private readonly int $currentKeyId)
    {
        if (!isset($keys[$currentKeyId])) {
            throw new RuntimeException('現在の鍵の識別子が、鍵の一覧にありません');
        }
    }

    public function currentKeyId(): int
    {
        return $this->currentKeyId;
    }

    /** 正規化済みの25文字を、指定した鍵で HMAC 化する（32バイトのバイナリ）。 */
    public function hash(string $normalized, int $keyId): string
    {
        if (!isset($this->keys[$keyId])) {
            throw new RuntimeException('未知の鍵の識別子です');
        }
        return hash_hmac('sha256', $normalized, $this->keys[$keyId], true);
    }

    /** 現在の鍵で HMAC 化する。 */
    public function hashWithCurrentKey(string $normalized): string
    {
        return $this->hash($normalized, $this->currentKeyId);
    }

    /**
     * 有効なすべての鍵で HMAC 化する（ログイン時の検索用）。
     *
     * @return array<int, string> 鍵の識別子 => ハッシュ
     */
    public function hashWithAllKeys(string $normalized): array
    {
        $hashes = [];
        foreach (array_keys($this->keys) as $id) {
            $hashes[$id] = $this->hash($normalized, $id);
        }
        return $hashes;
    }
}
