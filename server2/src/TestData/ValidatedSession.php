<?php

declare(strict_types=1);

namespace UecTst\TestData;

use DateTimeImmutable;

/**
 * 検証・正規化を済ませた、送信されたセッション。日時は UTC。回答の行は、テーブルの列名をキーにする
 * （日時は 'Y-m-d H:i:s.v' の文字列、空は null）。
 */
final class ValidatedSession
{
    /**
     * @param array<string, mixed> $attributes TableSpec_TestData.md 2.2 の attributes
     * @param list<array<string, mixed>> $rows 回答の行（絶対音感・相対音感・調性感。訓練は空）
     * @param list<array{trial: array<string, mixed>, responses: list<array<string, mixed>>}> $trials 訓練の試行
     */
    public function __construct(
        public readonly string $id,
        public readonly string $testType,
        public readonly string $status,
        public readonly ?string $variant,
        public readonly ?int $attemptNumber,
        public readonly ?int $plannedCount,
        public readonly DateTimeImmutable $startedAt,
        public readonly DateTimeImmutable $endedAt,
        public readonly int $offsetMinutes,
        public readonly array $attributes,
        public readonly array $rows,
        public readonly array $trials,
    ) {
    }
}
