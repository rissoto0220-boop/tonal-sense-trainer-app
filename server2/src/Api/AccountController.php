<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Auth\AuthContext;
use UecTst\Auth\SuperuserPasswordService;
use UecTst\Family\FamilyRecord;
use UecTst\Passkey\ChallengeStore;
use UecTst\Db\Transaction;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Security\RecoveryCode;
use UecTst\Support\Time;
use UecTst\Validation\Params;

/**
 * 家族のアカウントの操作。
 *   #15 重要な操作の確認 POST /elevation
 *   #16 復旧コードの再発行 POST /recovery-code（確認が必要）
 *   #21 退会 DELETE /family（確認が必要）
 *   #23 パスキーによる確認の開始 POST /elevation/passkey-options
 */
final class AccountController extends AuthenticatedController
{
    private const REISSUE_LIMIT = 3;     // 家族単位 3回／1時間
    private const REISSUE_WINDOW = 3600;

    /** #15 家族向けの重要な操作の確認（この端末で、5分間） */
    public function elevate(Request $request): Response
    {
        $data = $request->json();
        $methods = array_values(array_filter(['superuserPassword', 'passkey', 'recoveryCode'], static fn (string $k): bool => array_key_exists($k, $data)));
        if (count($methods) !== 1) {
            throw ApiException::badRequest('「superuserPassword」「passkey」「recoveryCode」のうち、1つだけを指定してください。');
        }

        return $this->authenticated($request, function (AuthContext $c) use ($data, $methods, $request): Response {
            $family = $this->services->families->find($c->familyId()) ?? throw ApiException::unauthenticated();

            switch ($methods[0]) {
                case 'recoveryCode':
                    // パスワードが設定済みの家族では、復旧コードによる確認を認めない（日常の確認は、パスワードで行うため）。
                    if ($family->superuserPasswordSet) {
                        throw ApiException::conflict('SUPERUSER_PASSWORD_ALREADY_SET', 'パスワードが設定されています。パスワードで確認してください。');
                    }
                    $verifier = $this->services->recoveryVerifier;
                    $normalized = $verifier->normalize(Params::string($data, 'recoveryCode'));
                    $verifier->assertMatches($family, $normalized, $request->clientIp);
                    break;

                case 'superuserPassword':
                    $password = Params::string($data, 'superuserPassword');
                    SuperuserPasswordService::assertValidFormat($password, 'superuserPassword');
                    $this->services->superuserPassword->verify($family->id, $password);
                    break;

                default:
                    $this->verifyPasskey($c, $family, $data['passkey']);
            }

            $until = $this->services->sessions->elevate($c->session->id);
            return Response::json(200, ['elevatedUntil' => Time::toIso($until)]);
        });
    }

    /** #23 パスキーによる確認の開始（challenge の発行） */
    public function passkeyOptions(Request $request): Response
    {
        return $this->authenticated($request, function (AuthContext $c): Response {
            $family = $this->services->families->find($c->familyId()) ?? throw ApiException::unauthenticated();
            if (!$family->superuserPasswordSet) {
                throw ApiException::conflict('SUPERUSER_PASSWORD_NOT_SET', 'パスキーが登録されていません。復旧コードで確認してください。');
            }
            $passkeys = $this->services->passkeys->listByFamily($family->id);
            if ($passkeys === []) {
                throw ApiException::notFound('パスキーが登録されていません。');
            }
            $this->limitChallenges($c);

            $challenge = $this->services->challenges->issue($c->session->id, ChallengeStore::FAMILY_ELEVATION);
            return Response::json(200, $this->services->webauthn->requestOptions($challenge, $passkeys));
        });
    }

    /** @param mixed $credential リクエストの passkey */
    private function verifyPasskey(AuthContext $c, FamilyRecord $family, mixed $credential): void
    {
        if (!$family->superuserPasswordSet) {
            throw ApiException::conflict('SUPERUSER_PASSWORD_NOT_SET', 'パスキーが登録されていません。復旧コードで確認してください。');
        }
        if (!is_array($credential)) {
            throw ApiException::badRequest('「passkey」の形式が正しくありません。');
        }
        // challenge は、検証の成否にかかわらず、ここで使い切る（使い回しを防ぐ）。
        $challenge = $this->services->challenges->take($c->session->id, ChallengeStore::FAMILY_ELEVATION)
            ?? throw ApiException::passkeyVerificationFailed();

        $webauthn = $this->services->webauthn;
        $credentialId = $webauthn->credentialIdOf($credential) ?? throw ApiException::passkeyVerificationFailed();
        $stored = $this->services->passkeys->findByCredentialId($family->id, $credentialId) ?? throw ApiException::passkeyVerificationFailed();
        $all = $this->services->passkeys->listByFamily($family->id);

        $signCount = $webauthn->verifyAssertion($credential, $challenge, $stored, $all);
        $this->services->passkeys->recordUse($stored->id, $signCount, $this->services->clock->now());
    }

    /** #16 復旧コードの再発行（旧コードの無効化と、操作中の端末以外のセッションの失効） */
    public function reissueRecoveryCode(Request $request): Response
    {
        return $this->authenticated($request, function (AuthContext $c): Response {
            $this->requireElevation($c);
            $familyId = $c->familyId();

            // 回数制限（家族単位）。
            $hit = $this->services->rateLimiter->hit('recovery:reissue:' . bin2hex($familyId), self::REISSUE_WINDOW);
            if ($hit->count > self::REISSUE_LIMIT) {
                throw ApiException::rateLimited($hit->retryAfterSeconds);
            }

            [$code, $revoked] = Transaction::run($this->services->pdo, function () use ($c, $familyId): array {
                $this->services->families->lock($familyId) ?? throw ApiException::unauthenticated();
                $now = $this->services->clock->now();
                $hasher = $this->services->recoveryHasher;

                $code = null;
                for ($attempt = 0; $attempt < 5 && $code === null; $attempt++) {
                    $candidate = RecoveryCode::generate();
                    if ($this->services->families->updateRecoveryCode($familyId, $hasher->hashWithCurrentKey($candidate), $hasher->currentKeyId(), $now)) {
                        $code = $candidate;
                    }
                }
                if ($code === null) {
                    throw new \RuntimeException('復旧コードの重複が続いたため、再発行できませんでした');
                }
                $revoked = $this->services->sessions->deleteOthers($familyId, $c->session->id);
                return [$code, $revoked];
            });

            return Response::json(200, ['recoveryCode' => RecoveryCode::format($code), 'revokedSessionCount' => $revoked]);
        });
    }

    /** #21 退会（家族・ユーザ・セッション・パスキー・所属を削除する。利用データは削除しない。基本方針 10.7） */
    public function withdraw(Request $request): Response
    {
        return $this->authenticated($request, function (AuthContext $c): Response {
            $this->requireElevation($c);
            // ON DELETE CASCADE で、ユーザ・パスキー・セッションが削除される。利用データは、外部キーを持たないため、そのまま残る。
            $this->services->families->delete($c->familyId());
            return Response::noContent([], [$this->services->cookies->clear()]);
        });
    }
}
