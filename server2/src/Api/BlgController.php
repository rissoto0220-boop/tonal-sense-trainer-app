<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Belonging\BlgAuthContext;
use UecTst\Services;

/**
 * 所属の API の共通処理（ApiSpec_Belonging.md 0.2）。
 * 検証の順序: 401 → 403 PASSKEY_REQUIRED → 403 PASSWORD_CHANGE_REQUIRED → 403 SUPER_ONLY → 403 ELEVATION_REQUIRED → 404・409 など。
 */
abstract class BlgController
{
    public function __construct(protected readonly Services $services)
    {
    }

    /**
     * @param callable(BlgAuthContext): Response $handler
     * @param bool $requireLoginComplete true なら、ログイン完了（段階1）が必要。false なら、段階0（パスキーの確認が未了）でも呼べる
     * @param bool $allowPasswordChangeRequired true なら、パスワードの変更が必要な間も呼べる（B4・B5・B6）
     * @param bool $superOnly true なら、運用担当者の所属だけが呼べる
     */
    protected function guarded(
        Request $request,
        callable $handler,
        bool $requireLoginComplete = true,
        bool $allowPasswordChangeRequired = false,
        bool $superOnly = false,
    ): Response {
        $context = $this->services->blgAuthenticator->authenticate($request);
        if ($requireLoginComplete && !$context->session->isLoginComplete()) {
            throw ApiException::passkeyRequired();
        }
        if (!$allowPasswordChangeRequired && $context->belonging->passwordChangeRequired) {
            throw ApiException::passwordChangeRequired();
        }
        if ($superOnly && !$context->belonging->isSuper) {
            throw ApiException::superOnly();
        }
        return $handler($context);
    }

    /** 破壊的な操作（パスキーの削除・パスワードの再発行・所属の削除）は、パスワードの再入力（B7）から5分以内の端末でのみ実行できる。 */
    protected function requireElevation(BlgAuthContext $context): void
    {
        if (!$context->session->isElevated($this->services->clock->now())) {
            throw ApiException::elevationRequired();
        }
    }

    /** パスキーの challenge の発行は、セッション単位で 30回／10分まで（ApiSpec_Belonging.md 9.）。 */
    protected function limitChallenges(BlgAuthContext $context): void
    {
        $hit = $this->services->rateLimiter->hit('webauthn:challenge:' . bin2hex($context->session->id), 600);
        if ($hit->count > 30) {
            throw ApiException::rateLimited($hit->retryAfterSeconds);
        }
    }

    /**
     * パスワードの照合の結果（BlgPasswordService::attempt）を、エラーにする。一致していれば何もしない。
     *
     * @param array{result: string, retryAfter: int, justLocked: bool} $outcome
     */
    protected function assertPasswordOutcome(array $outcome, string $belongingId, string $action): void
    {
        if ($outcome['justLocked']) {
            $this->audit($action . '.locked', $belongingId, 'failure');
        }
        match ($outcome['result']) {
            'ok' => null,
            'locked' => throw ApiException::blgPasswordLocked($outcome['retryAfter']),
            default => throw ApiException::invalidCredentials(),
        };
    }

    /**
     * 操作の記録（ApiSpec_Belonging.md 8.）。時刻・所属 ID・操作・結果のみ。メールアドレス・パスワード・トークンは記録しない。
     *
     * @param array<string, scalar|null> $extra
     */
    protected function audit(string $action, ?string $belongingId, string $result = 'success', array $extra = []): void
    {
        $this->services->logger->info('blg.' . $action, [
            'belongingId' => $belongingId === null ? null : Uuid7::toString($belongingId),
            'result' => $result,
        ] + $extra);
    }

    /** パスの ID（UUID）を、バイナリにする。形式が正しくなければ null。 */
    protected static function idParam(array $params, string $key): ?string
    {
        $value = (string) ($params[$key] ?? '');
        return Uuid7::isValid($value) ? Uuid7::toBinary($value) : null;
    }
}
