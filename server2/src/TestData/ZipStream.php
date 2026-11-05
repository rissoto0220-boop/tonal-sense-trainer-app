<?php

declare(strict_types=1);

namespace UecTst\TestData;

use DateTimeImmutable;
use RuntimeException;

/**
 * ZIP を、一時ファイルを作らず、出力しながら作る（deflate 圧縮、データ記述子つき）。
 * 1つのファイルは 4GiB 未満、ファイル数は 65535 未満（ZIP64 は使わない）。
 */
final class ZipStream
{
    private int $offset = 0;
    /** @var list<array{name: string, crc: int, compressed: int, size: int, offset: int}> */
    private array $entries = [];
    /** @var array{name: string, offset: int, hash: \HashContext, deflate: \DeflateContext, compressed: int, size: int}|null */
    private ?array $current = null;
    private readonly int $dosTime;
    private readonly int $dosDate;

    /** @param callable(string): void $write */
    public function __construct(private $write, DateTimeImmutable $now)
    {
        $this->dosTime = ((int) $now->format('G') << 11) | ((int) $now->format('i') << 5) | ((int) $now->format('s') >> 1);
        $this->dosDate = (((int) $now->format('Y') - 1980) << 9) | ((int) $now->format('n') << 5) | (int) $now->format('j');
    }

    public function startFile(string $name): void
    {
        if ($this->current !== null) {
            throw new RuntimeException('ZIP: 前のファイルが閉じられていません');
        }
        $header = pack('VvvvvvVVVvv', 0x04034b50, 20, 0x0808, 8, $this->dosTime, $this->dosDate, 0, 0, 0, strlen($name), 0) . $name;
        $this->emit($header);
        $this->current = [
            'name' => $name,
            'offset' => $this->offset - strlen($header),
            'hash' => hash_init('crc32b'),
            'deflate' => deflate_init(ZLIB_ENCODING_RAW, ['level' => 6]),
            'compressed' => 0,
            'size' => 0,
        ];
    }

    public function write(string $data): void
    {
        if ($this->current === null || $data === '') {
            return;
        }
        hash_update($this->current['hash'], $data);
        $this->current['size'] += strlen($data);
        $this->emitCompressed(deflate_add($this->current['deflate'], $data, ZLIB_NO_FLUSH));
    }

    public function endFile(): void
    {
        if ($this->current === null) {
            return;
        }
        $this->emitCompressed(deflate_add($this->current['deflate'], '', ZLIB_FINISH));
        $crc = (int) unpack('N', hash_final($this->current['hash'], true))[1];
        if ($this->current['size'] > 0xFFFFFFFF || $this->current['compressed'] > 0xFFFFFFFF) {
            throw new RuntimeException('ZIP: ファイルが大きすぎます');
        }
        $this->emit(pack('VVVV', 0x08074b50, $crc, $this->current['compressed'], $this->current['size']));
        $this->entries[] = ['name' => $this->current['name'], 'crc' => $crc, 'compressed' => $this->current['compressed'], 'size' => $this->current['size'], 'offset' => $this->current['offset']];
        $this->current = null;
    }

    /** 中央ディレクトリを書いて、ZIP を終える。 */
    public function finish(): void
    {
        $this->endFile();
        if (count($this->entries) > 0xFFFE || $this->offset > 0xFFFFFFFF) {
            throw new RuntimeException('ZIP: ファイルの数または大きさが上限を超えました');
        }
        $start = $this->offset;
        foreach ($this->entries as $e) {
            $this->emit(pack(
                'VvvvvvvVVVvvvvvVV',
                0x02014b50, 20, 20, 0x0808, 8, $this->dosTime, $this->dosDate, $e['crc'], $e['compressed'], $e['size'],
                strlen($e['name']), 0, 0, 0, 0, 0, $e['offset'],
            ) . $e['name']);
        }
        $size = $this->offset - $start;
        $this->emit(pack('VvvvvVVv', 0x06054b50, 0, 0, count($this->entries), count($this->entries), $size, $start, 0));
    }

    private function emitCompressed(string|false $data): void
    {
        if ($data === false) {
            throw new RuntimeException('ZIP: 圧縮に失敗しました');
        }
        if ($data !== '') {
            $this->current['compressed'] += strlen($data);
            $this->emit($data);
        }
    }

    private function emit(string $data): void
    {
        ($this->write)($data);
        $this->offset += strlen($data);
    }
}
