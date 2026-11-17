<?php

declare(strict_types=1);

namespace UecTst\Belonging;

use DateTimeImmutable;

/** 所属（belongings の1行）。ID はバイナリ。 */
final class BelongingRecord
{
    public function __construct(
        public readonly string $id,
        public readonly string $name,
        public readonly ?string $nameKana,
        public readonly string $loginId,
        public readonly string $passwordHash,
        public readonly bool $passwordChangeRequired,
        public readonly int $passwordFailedCount,
        public readonly ?DateTimeImmutable $passwordLockedUntil,
        public readonly bool $isSuper,
        public readonly DateTimeImmutable $createdAt,
    ) {
    }
}
