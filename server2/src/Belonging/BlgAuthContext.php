<?php

declare(strict_types=1);

namespace UecTst\Belonging;

/** 認証済みの、所属のリクエストの文脈。 */
final class BlgAuthContext
{
    public function __construct(
        public readonly BlgSession $session,
        public readonly BelongingRecord $belonging,
    ) {
    }

    public function belongingId(): string
    {
        return $this->belonging->id;
    }
}
