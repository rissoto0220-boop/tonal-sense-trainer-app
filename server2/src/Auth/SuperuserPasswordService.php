<?php

declare(strict_types=1);

namespace UecTst\Auth;

use PDO;
use UecTst\Db\Transaction;
use UecTst\Family\FamilyRepository;
use UecTst\Http\ApiException;
use UecTst\Security\PasswordHasher;
use UecTst\Support\Clock;
use UecTst\Support\Time;
use UecTst\Validation\Input;

/**
 * スーパーユーザのパスワードの照合と、失敗によるロック（TableSpec_Account.md 2.3）。
 * 連続5回の失敗で15分ロックする。同時の入力でも回数を正しく数えるため、家族の行をロックして照合する。
 */
final class SuperuserPasswordService
{
    public const MAX_FAILURES = 5;
    public const LOCK_SECONDS = 900;

    public function __construct(
        private readonly PDO $pdo,
        private readonly Clock $clock,
        private readonly FamilyRepository $families,
        private readonly PasswordHasher $hasher,
    ) {
    }

    /** 入力の検査（422）。新しいパスワードの設定、照合のどちらでも先に行う。 */
    public static function assertValidFormat(string $password, string $field): void
    {
        $error = Input::passwordError($password);
        if ($error !== null) {
            throw ApiException::validationFailed(
                $error === 'TOO_SHORT' ? 'パスワードは4文字以上で入力してください。' : 'パスワードは64文字以内で入力してください。',
                [['field' => $field, 'code' => $error]],
            );
        }
    }

    /**
     * パスワードを照合する。
     *
     * @throws ApiException 409 SUPERUSER_PASSWORD_NOT_SET、429 SUPERUSER_PASSWORD_LOCKED、401 INVALID_SUPERUSER_PASSWORD
     */
    public function verify(string $familyId, string $password): void
    {
        // 失敗の回数は、エラーの応答でも確定させたいため、トランザクションの結果を返してから、例外にする。
        $outcome = Transaction::run($this->pdo, function () use ($familyId, $password): array {
            $family = $this->families->lock($familyId) ?? throw ApiException::unauthenticated();
            if ($family->superuserPasswordHash === null) {
                return ['not_set', 0];
            }
            $now = $this->clock->now();
            if ($family->passwordLockedUntil !== null && $family->passwordLockedUntil > $now) {
                return ['locked', $family->passwordLockedUntil->getTimestamp() - $now->getTimestamp()];
            }

            if ($this->hasher->verify($family->superuserPasswordHash, $password)) {
                if ($family->passwordFailedCount > 0 || $family->passwordLockedUntil !== null) {
                    $this->families->setPasswordAttempts($familyId, 0, null);
                }
                if ($this->hasher->needsRehash($family->superuserPasswordHash)) {
                    $this->families->setPassword($familyId, $this->hasher->hash($password));
                }
                return ['ok', 0];
            }

            $failures = $family->passwordFailedCount + 1;
            if ($failures >= self::MAX_FAILURES) {
                $this->families->setPasswordAttempts($familyId, 0, $now->modify('+' . self::LOCK_SECONDS . ' seconds'));
            } else {
                $this->families->setPasswordAttempts($familyId, $failures, null);
            }
            return ['invalid', 0];
        });

        [$result, $retryAfter] = $outcome;
        match ($result) {
            'ok' => null,
            'not_set' => throw ApiException::conflict('SUPERUSER_PASSWORD_NOT_SET', 'スーパーユーザのパスワードが設定されていません。復旧コードで確認してください。'),
            'locked' => throw ApiException::passwordLocked($retryAfter),
            default => throw new ApiException(401, 'INVALID_SUPERUSER_PASSWORD', 'パスワードが正しくありません。'),
        };
    }

    /** ロック中なら、解除の日時（API 用の ISO 形式）。ロックしていなければ null。 */
    public function lockedUntilIso(\UecTst\Family\FamilyRecord $family): ?string
    {
        $until = $family->passwordLockedUntil;
        return $until !== null && $until > $this->clock->now() ? Time::toIso($until) : null;
    }
}
