<?php

declare(strict_types=1);

namespace UecTst\Belonging;

use DateTimeImmutable;

/** 所属のログイン状態（belonging_sessions の1行）。ID はバイナリ。 */
final class BlgSession
{
    public function __construct(
        public readonly string $id,
        public readonly string $belongingId,
        public readonly int $authStage,
        public readonly DateTimeImmutable $createdAt,
        public readonly DateTimeImmutable $lastUsedAt,
        public readonly DateTimeImmutable $expiresAt,
        public readonly ?DateTimeImmutable $elevatedUntil,
    ) {
    }

    /** ログインが完了しているか（段階1）。段階0は、パスキーの確認が未了。 */
    public function isLoginComplete(): bool
    {
        return $this->authStage === 1;
    }

    /** 破壊的な操作を実行できる状態か（パスワードの再入力から5分以内）。 */
    public function isElevated(DateTimeImmutable $now): bool
    {
        return $this->elevatedUntil !== null && $this->elevatedUntil > $now;
    }
}
