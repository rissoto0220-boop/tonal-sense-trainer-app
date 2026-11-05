<?php

declare(strict_types=1);

namespace UecTst\TestData;

use DateTimeImmutable;

/** 一覧・ダウンロードの絞り込み（ApiSpec_TestData.md 0.5）。 */
final class TestDataFilter
{
    /**
     * @param list<string> $testTypes 空ならすべて
     * @param list<string> $userIds 16バイトのバイナリ。空ならすべて
     */
    public function __construct(
        public readonly array $testTypes = [],
        public readonly array $userIds = [],
        public readonly ?DateTimeImmutable $from = null,
        public readonly ?DateTimeImmutable $to = null,
        public readonly bool $includeInterrupted = false,
    ) {
    }

    /**
     * test_sessions（別名 s）に対する条件。
     *
     * @return array{0: string, 1: list<string>} 条件（AND で連結できる形）と、パラメータ
     */
    public function toSql(): array
    {
        $conditions = [];
        $params = [];
        if ($this->testTypes !== []) {
            $conditions[] = 's.test_type IN (' . implode(',', array_fill(0, count($this->testTypes), '?')) . ')';
            array_push($params, ...$this->testTypes);
        }
        if ($this->userIds !== []) {
            $conditions[] = 's.user_id IN (' . implode(',', array_fill(0, count($this->userIds), '?')) . ')';
            array_push($params, ...$this->userIds);
        }
        if ($this->from !== null) {
            $conditions[] = 's.started_at >= ?';
            $params[] = SessionValidator::toDb($this->from);
        }
        if ($this->to !== null) {
            $conditions[] = 's.started_at < ?';
            $params[] = SessionValidator::toDb($this->to);
        }
        if (!$this->includeInterrupted) {
            $conditions[] = 's.session_status NOT IN (' . implode(',', array_map(static fn (string $s): string => "'{$s}'", TestType::INTERRUPTED_STATUSES)) . ')';
        }
        return [$conditions === [] ? '1 = 1' : implode(' AND ', $conditions), $params];
    }

    public function withTestType(string $type): self
    {
        return new self([$type], $this->userIds, $this->from, $this->to, $this->includeInterrupted);
    }

    public function withUser(string $userId): self
    {
        return new self($this->testTypes, [$userId], $this->from, $this->to, $this->includeInterrupted);
    }
}
