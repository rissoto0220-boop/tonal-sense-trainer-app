<?php

declare(strict_types=1);

namespace UecTst\Organization;

use DateTimeImmutable;

/** 組織（organizations の1行）。ID はバイナリ。 */
final class OrganizationRecord
{
    public function __construct(
        public readonly string $id,
        public readonly string $name,
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
