<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Organization\OrgAuthContext;
use UecTst\Services;

/**
 * 組織の API の共通処理（ApiSpec_Organization.md 0.2）。
 * 検証の順序: 401 → 403 PASSKEY_REQUIRED → 403 PASSWORD_CHANGE_REQUIRED → 403 SUPER_ONLY → 403 ELEVATION_REQUIRED → 404・409 など。
 */
abstract class OrgController
{
    public function __construct(protected readonly Services $services)
    {
    }

    /**
     * @param callable(OrgAuthContext): Response $handler
     * @param bool $requireLoginComplete true なら、ログイン完了（段階1）が必要。false なら、段階0（パスキーの確認が未了）でも呼べる
     * @param bool $allowPasswordChangeRequired true なら、パスワードの変更が必要な間も呼べる（O4・O5・O6）
     * @param bool $superOnly true なら、研究者の組織だけが呼べる
     */
    protected function guarded(
        Request $request,
        callable $handler,
        bool $requireLoginComplete = true,
        bool $allowPasswordChangeRequired = false,
        bool $superOnly = false,
    ): Response {
        $context = $this->services->orgAuthenticator->authenticate($request);
        if ($requireLoginComplete && !$context->session->isLoginComplete()) {
            throw ApiException::passkeyRequired();
        }
        if (!$allowPasswordChangeRequired && $context->organization->passwordChangeRequired) {
            throw ApiException::passwordChangeRequired();
        }
        if ($superOnly && !$context->organization->isSuper) {
            throw ApiException::superOnly();
        }
        return $handler($context);
    }

    /** 破壊的な操作（パスキーの削除・パスワードの再発行・組織の削除）は、パスワードの再入力（O7）から5分以内の端末でのみ実行できる。 */
    protected function requireElevation(OrgAuthContext $context): void
    {
        if (!$context->session->isElevated($this->services->clock->now())) {
            throw ApiException::elevationRequired();
        }
    }

    /** パスキーの challenge の発行は、セッション単位で 30回／10分まで（ApiSpec_Organization.md 9.）。 */
    protected function limitChallenges(OrgAuthContext $context): void
    {
        $hit = $this->services->rateLimiter->hit('webauthn:challenge:' . bin2hex($context->session->id), 600);
        if ($hit->count > 30) {
            throw ApiException::rateLimited($hit->retryAfterSeconds);
        }
    }

    /**
     * パスワードの照合の結果（OrgPasswordService::attempt）を、エラーにする。一致していれば何もしない。
     *
     * @param array{result: string, retryAfter: int, justLocked: bool} $outcome
     */
    protected function assertPasswordOutcome(array $outcome, string $organizationId, string $action): void
    {
        if ($outcome['justLocked']) {
            $this->audit($action . '.locked', $organizationId, 'failure');
        }
        match ($outcome['result']) {
            'ok' => null,
            'locked' => throw ApiException::orgPasswordLocked($outcome['retryAfter']),
            default => throw ApiException::invalidCredentials(),
        };
    }

    /**
     * 操作の記録（ApiSpec_Organization.md 8.）。時刻・組織 ID・操作・結果のみ。メールアドレス・パスワード・トークンは記録しない。
     *
     * @param array<string, scalar|null> $extra
     */
    protected function audit(string $action, ?string $organizationId, string $result = 'success', array $extra = []): void
    {
        $this->services->logger->info('org.' . $action, [
            'organizationId' => $organizationId === null ? null : Uuid7::toString($organizationId),
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
