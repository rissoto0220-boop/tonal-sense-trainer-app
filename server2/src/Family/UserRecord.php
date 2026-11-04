<?php

declare(strict_types=1);

namespace UecTst\Family;

/** ユーザ（users の1行）。ID はバイナリ。 */
final class UserRecord
{
    public function __construct(
        public readonly string $id,
        public readonly string $familyId,
        public readonly string $name,
        public readonly int $slot,
        public readonly int $displayOrder,
        public readonly bool $isSuperuser,
    ) {
    }
}
