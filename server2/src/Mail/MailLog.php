<?php

declare(strict_types=1);

namespace UecTst\Mail;

/**
 * 開発用に「送ったことにしたメール」を記録するファイル（1行1件の JSON）。メール表示ページ（デバッグ機能）が読む。
 * 件数・サイズの上限は設けない（開発用。不要になったら、ファイルを消してよい）。
 */
final class MailLog
{
    /** 読み込む量の上限（ファイルの末尾から）。巨大なファイルでも、メモリを使いすぎないようにする。 */
    private const READ_TAIL_BYTES = 2_000_000;

    public function __construct(private readonly string $file)
    {
    }

    /**
     * @param array{id: string, sentAt: string, from: string, to: string, subject: string, body: string} $record
     * @throws MailException
     */
    public function append(array $record): void
    {
        $dir = dirname($this->file);
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new MailException('メールのログの出力先を作れません');
        }
        $line = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($line === false || @file_put_contents($this->file, $line . "\n", FILE_APPEND | LOCK_EX) === false) {
            throw new MailException('メールのログを書き込めません');
        }
    }

    /**
     * 新しい順に、最大 $limit 件。読めない行（古い形式のログなど）は、飛ばす。
     *
     * @return list<array{id: string, sentAt: string, from: string, to: string, subject: string, body: string}>
     */
    public function recent(int $limit = 100): array
    {
        $records = [];
        foreach (array_reverse($this->tailLines()) as $line) {
            $data = json_decode($line, true);
            if (!is_array($data) || !self::isRecord($data)) {
                continue;
            }
            $records[] = $data;
            if (count($records) >= $limit) {
                break;
            }
        }
        return $records;
    }

    /** @return list<string> */
    private function tailLines(): array
    {
        $size = @filesize($this->file);
        if ($size === false || $size === 0) {
            return [];
        }
        $handle = @fopen($this->file, 'rb');
        if ($handle === false) {
            return [];
        }
        try {
            $offset = max(0, $size - self::READ_TAIL_BYTES);
            fseek($handle, $offset);
            $text = (string) stream_get_contents($handle);
        } finally {
            fclose($handle);
        }
        $lines = explode("\n", $text);
        if ($offset > 0) {
            array_shift($lines); // 途中から読み始めたため、欠けている最初の行は捨てる。
        }
        return array_values(array_filter($lines, static fn (string $l): bool => $l !== ''));
    }

    /** @param array<mixed> $data */
    private static function isRecord(array $data): bool
    {
        foreach (['id', 'sentAt', 'from', 'to', 'subject', 'body'] as $key) {
            if (!isset($data[$key]) || !is_string($data[$key])) {
                return false;
            }
        }
        return true;
    }
}
