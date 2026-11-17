<?php

declare(strict_types=1);

namespace UecTst\Family;

/** 家族（families の1行）。ID はバイナリ。 */
final class FamilyRecord
{
    public function __construct(
        public readonly string $id,
        public readonly string $recoveryCodeHash,
        public readonly int $recoveryCodeKeyId,
        public readonly bool $superuserPasswordSet,
        public readonly ?string $belongingId,
        public readonly ?string $belongingJoinedAt,
        public readonly ?string $superuserPasswordHash = null,
        public readonly int $passwordFailedCount = 0,
        public readonly ?\DateTimeImmutable $passwordLockedUntil = null,
    ) {
    }
}
