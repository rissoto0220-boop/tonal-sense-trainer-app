<?php

declare(strict_types=1);

namespace UecTst\Passkey;

use DateTimeImmutable;

/** パスキー（passkeys または organization_passkeys の1行）。ID・クレデンシャル ID・公開鍵はバイナリ。持ち主は、家族または組織の ID。 */
final class PasskeyRecord
{
    /** @param list<string> $transports */
    public function __construct(
        public readonly string $id,
        public readonly string $ownerId,
        public readonly string $credentialId,
        public readonly string $publicKey,
        public readonly int $signCount,
        public readonly array $transports,
        public readonly bool $backupEligible,
        public readonly string $name,
        public readonly DateTimeImmutable $createdAt,
        public readonly ?DateTimeImmutable $lastUsedAt,
    ) {
    }
}
