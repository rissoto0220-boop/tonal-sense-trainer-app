<?php

declare(strict_types=1);

namespace UecTst\Auth;

use DateTimeImmutable;

/** 端末（ブラウザ）ごとのログイン状態（sessions の1行）。ID はいずれも、16バイトのバイナリ。 */
final class Session
{
    public function __construct(
        public readonly string $id,
        public readonly string $familyId,
        public readonly ?string $selectedUserId,
        public readonly string $deviceLabel,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $lastUsedAt,
        public readonly DateTimeImmutable $expiresAt,
        public readonly ?DateTimeImmutable $elevatedUntil,
    ) {
    }

    /** 家族向けの重要な操作を実行できる状態か（確認から5分以内）。 */
    public function isElevated(DateTimeImmutable $now): bool
    {
        return $this->elevatedUntil !== null && $this->elevatedUntil > $now;
    }
}
