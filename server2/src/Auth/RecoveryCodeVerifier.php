<?php

declare(strict_types=1);

namespace UecTst\Auth;

use UecTst\Family\FamilyRecord;
use UecTst\Http\ApiException;
use UecTst\Security\RecoveryCodeHasher;

/**
 * ログイン中の家族の復旧コードとの照合（#15 の復旧コードによる確認、#22 パスワードの再設定）。
 * 入力の検査（422）→ IP 単位の回数制限（429）→ 照合（失敗は 401 とし、失敗回数に数える）の順に行う。
 */
final class RecoveryCodeVerifier
{
    public function __construct(
        private readonly RecoveryAttempts $attempts,
        private readonly RecoveryCodeHasher $hasher,
    ) {
    }

    /** 入力の形式だけを検査する（正規化済みの25文字を返す。誤りは 422 で、失敗回数に数えない）。 */
    public function normalize(string $input): string
    {
        return RecoveryAttempts::normalize($input);
    }

    /** @param string $normalized normalize() の結果 */
    public function assertMatches(FamilyRecord $family, string $normalized, string $clientIp): void
    {
        $this->attempts->assertAllowed($clientIp);
        $expected = $this->hasher->hash($normalized, $family->recoveryCodeKeyId);
        if (!hash_equals($family->recoveryCodeHash, $expected)) {
            $this->attempts->recordFailure($clientIp);
            throw new ApiException(401, 'INVALID_RECOVERY_CODE', '復旧コードが正しくありません。');
        }
    }
}
