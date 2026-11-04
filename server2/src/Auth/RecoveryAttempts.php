<?php

declare(strict_types=1);

namespace UecTst\Auth;

use UecTst\Http\ApiException;
use UecTst\Log\Logger;
use UecTst\RateLimit\RateLimiter;
use UecTst\Security\RecoveryCode;

/**
 * 復旧コードの照合（ログイン #4、重要な操作の確認 #15・パスワードの再設定 #22）の、入力の検査と、失敗の回数制限。
 * ApiSpec_Auth.md 0.6・9.。ログインと確認は、同じカウンターで数える。
 */
final class RecoveryAttempts
{
    public const FAIL_IP_LIMIT = 20;       // IP 単位 失敗 20回／1時間（超えたら拒否）
    public const FAIL_GLOBAL_NOTIFY = 500; // システム全体 失敗 500回／1時間（通知のみ。拒否はしない）
    public const WINDOW = 3600;

    public function __construct(private readonly RateLimiter $limiter, private readonly Logger $logger)
    {
    }

    /** 失敗が IP 単位の上限に達していれば、照合せずに 429 にする。 */
    public function assertAllowed(string $clientIp): void
    {
        $failures = $this->limiter->peek('recovery:fail:ip:' . $clientIp);
        if ($failures->count >= self::FAIL_IP_LIMIT) {
            throw ApiException::rateLimited($failures->retryAfterSeconds);
        }
    }

    /** 照合の失敗を数える（IP 単位、システム全体）。 */
    public function recordFailure(string $clientIp): void
    {
        $this->limiter->hit('recovery:fail:ip:' . $clientIp, self::WINDOW);
        $global = $this->limiter->hit('recovery:fail:global', self::WINDOW);
        if ($global->count === self::FAIL_GLOBAL_NOTIFY + 1) {
            // 拒否すると、全利用者がログインできなくなるため、運用者への通知（ログ）のみ。
            $this->logger->warning('復旧コードの失敗数が、システム全体のしきい値を超えました（運用者への通知）', ['threshold' => self::FAIL_GLOBAL_NOTIFY]);
        }
    }

    /**
     * 入力を正規化し、形式・チェック用の文字を検査する。誤りは 422 とし、照合せず、失敗回数にも数えない。
     *
     * @return string 正規化済みの25文字
     */
    public static function normalize(string $input): string
    {
        $normalized = RecoveryCode::normalize($input);
        $error = RecoveryCode::validate($normalized);
        if ($error !== null) {
            $message = $error === 'CHECK_CHARACTER_MISMATCH' ? '入力ミスがあります。もう一度確かめてください。' : '復旧コードの形式が正しくありません。';
            throw ApiException::validationFailed($message, [['field' => 'recoveryCode', 'code' => $error]]);
        }
        return $normalized;
    }
}
