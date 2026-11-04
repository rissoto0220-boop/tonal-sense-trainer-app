<?php

declare(strict_types=1);

namespace UecTst\Support;

use DateTimeImmutable;

/** 現在時刻（UTC）の取得元。テストで時刻を進められるよう、差し替え可能にする。 */
interface Clock
{
    public function now(): DateTimeImmutable;
}
