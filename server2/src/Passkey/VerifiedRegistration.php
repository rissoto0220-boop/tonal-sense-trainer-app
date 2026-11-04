<?php

declare(strict_types=1);

namespace UecTst\Passkey;

/** 検証に成功した、パスキーの登録の内容。 */
final class VerifiedRegistration
{
    /** @param list<string> $transports */
    public function __construct(
        public readonly string $credentialId,
        public readonly string $publicKey,
        public readonly int $signCount,
        public readonly array $transports,
        public readonly bool $backupEligible,
    ) {
    }
}
