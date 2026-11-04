<?php

declare(strict_types=1);

namespace UecTst\RateLimit;

/** 回数制限のカウンターの、現在の状態。 */
final class RateLimitHit
{
    public function __construct(
        /** 現在の窓での回数 */
        public readonly int $count,
        /** 窓が終わるまでの秒数（Retry-After に使う）。回数が0なら0 */
        public readonly int $retryAfterSeconds,
    ) {
    }
}
