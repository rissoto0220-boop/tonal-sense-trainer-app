<?php

declare(strict_types=1);

namespace UecTst\Belonging;

use PDO;
use UecTst\Db\Transaction;
use UecTst\Http\ApiException;
use UecTst\Security\PasswordHasher;
use UecTst\Support\Clock;

/**
 * 所属のパスワードの照合と、失敗によるロック（TableSpec_Belonging.md 2.3）。連続5回の失敗で15分ロックする。
 * 同時の入力でも回数を正しく数えるため、所属の行をロックして照合する。
 */
final class BlgPasswordService
{
    public const MAX_FAILURES = 5;
    public const LOCK_SECONDS = 900;
    public const PASSWORD_MIN = 12;
    public const PASSWORD_MAX = 128;

    /** 初期パスワードに使う文字。紛らわしい文字（0・O・1・l・I）を除く。 */
    private const INITIAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    public const INITIAL_LENGTH = 16;

    /**
     * 存在しないログインIDのときに、処理時間の差でログインIDの有無が分からないよう、ダミーの照合に使うハッシュ
     * （本物と同じ Argon2id のパラメータ）。
     */
    private const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$eHHOPFQFaexbWR7MFwNLnA$4urloMp/1fGoEBkhmxuvf92NuHFUvPpm+jmumYHE8JY';

    public function __construct(
        private readonly PDO $pdo,
        private readonly Clock $clock,
        private readonly BelongingRepository $belongings,
        private readonly PasswordHasher $hasher,
    ) {
    }

    /** 新しいパスワードの検査（12〜128文字。文字の種類は問わない。前後の空白も含めて、そのまま扱う）。 */
    public static function assertValidFormat(string $password, string $field): void
    {
        $length = mb_strlen($password, 'UTF-8');
        if ($length < self::PASSWORD_MIN) {
            throw ApiException::validationFailed('パスワードは12文字以上で入力してください。', [['field' => $field, 'code' => 'TOO_SHORT']]);
        }
        if ($length > self::PASSWORD_MAX) {
            throw ApiException::validationFailed('パスワードは128文字以内で入力してください。', [['field' => $field, 'code' => 'TOO_LONG']]);
        }
    }

    /** 初期パスワード（暗号論的に安全な乱数の16文字）。 */
    public function generateInitialPassword(): string
    {
        $password = '';
        $max = strlen(self::INITIAL_ALPHABET) - 1;
        for ($i = 0; $i < self::INITIAL_LENGTH; $i++) {
            $password .= self::INITIAL_ALPHABET[random_int(0, $max)];
        }
        return $password;
    }

    public function hash(string $password): string
    {
        return $this->hasher->hash($password);
    }

    /** 存在しないログインIDのときの、ダミーの照合（結果は使わない）。 */
    public function dummyVerify(string $password): void
    {
        $this->hasher->verify(self::DUMMY_HASH, $password);
    }

    /**
     * パスワードを照合する。一致したときだけ、同じトランザクションの中で $onSuccess を実行する。
     * 失敗の回数は、エラーの応答でも確定させたいため、トランザクションを終えてから、結果を返す（例外にするのは呼び出し側）。
     *
     * @param (callable(BelongingRecord): void)|null $onSuccess
     * @return array{result: 'ok'|'locked'|'invalid', retryAfter: int, justLocked: bool}
     */
    public function attempt(string $belongingId, string $password, ?callable $onSuccess = null): array
    {
        return Transaction::run($this->pdo, function () use ($belongingId, $password, $onSuccess): array {
            $belonging = $this->belongings->lock($belongingId) ?? throw ApiException::unauthenticated();
            $now = $this->clock->now();
            if ($belonging->passwordLockedUntil !== null && $belonging->passwordLockedUntil > $now) {
                return ['result' => 'locked', 'retryAfter' => $belonging->passwordLockedUntil->getTimestamp() - $now->getTimestamp(), 'justLocked' => false];
            }

            if ($this->hasher->verify($belonging->passwordHash, $password)) {
                if ($belonging->passwordFailedCount > 0 || $belonging->passwordLockedUntil !== null) {
                    $this->belongings->setPasswordAttempts($belongingId, 0, null);
                }
                if ($onSuccess !== null) {
                    $onSuccess($belonging);
                } elseif ($this->hasher->needsRehash($belonging->passwordHash)) {
                    $this->belongings->setPassword($belongingId, $this->hasher->hash($password), $belonging->passwordChangeRequired);
                }
                return ['result' => 'ok', 'retryAfter' => 0, 'justLocked' => false];
            }

            $failures = $belonging->passwordFailedCount + 1;
            if ($failures >= self::MAX_FAILURES) {
                $this->belongings->setPasswordAttempts($belongingId, 0, $now->modify('+' . self::LOCK_SECONDS . ' seconds'));
                return ['result' => 'invalid', 'retryAfter' => 0, 'justLocked' => true];
            }
            $this->belongings->setPasswordAttempts($belongingId, $failures, null);
            return ['result' => 'invalid', 'retryAfter' => 0, 'justLocked' => false];
        });
    }
}
