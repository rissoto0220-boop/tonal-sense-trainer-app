<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Auth\AuthContext;
use UecTst\Auth\DeviceLabel;
use UecTst\Auth\SuperuserPasswordService;
use UecTst\Db\Transaction;
use UecTst\Db\Uuid7;
use UecTst\Family\FamilyView;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Passkey\ChallengeStore;
use UecTst\Passkey\PasskeyRecord;
use UecTst\Passkey\PasskeyRepository;
use UecTst\Support\Time;
use UecTst\Validation\Params;

/**
 * スーパーユーザ・パスワード・パスキー。
 *   #17 設定状況 GET /superuser
 *   #18 パスワードの設定・変更 PUT /superuser/password（確認が必要）
 *   #19 パスワードの削除 DELETE /superuser/password（確認が必要）
 *   #20 スーパーユーザの移動 PUT /superuser（確認が必要）
 *   #22 パスワードの再設定 POST /superuser/password/reset（復旧コードで確認）
 *   #24 パスキーの一覧 GET /superuser/passkeys
 *   #25 パスキーの登録の開始 POST /superuser/passkeys/registration-options（確認が必要）
 *   #26 パスキーの登録 POST /superuser/passkeys（確認が必要）
 *   #27 パスキーの削除 DELETE /superuser/passkeys/{passkeyId}（確認が必要）
 */
final class SuperuserController extends AuthenticatedController
{
    /** #17 スーパーユーザとパスワードの設定状況の取得 */
    public function show(Request $request): Response
    {
        return $this->authenticated($request, function (AuthContext $c): Response {
            $family = $this->services->families->find($c->familyId()) ?? throw ApiException::unauthenticated();
            $superuserId = null;
            foreach ($this->services->users->listByFamily($family->id) as $user) {
                if ($user->isSuperuser) {
                    $superuserId = Uuid7::toString($user->id);
                }
            }
            return Response::json(200, [
                'superuserId' => $superuserId,
                'passwordSet' => $family->superuserPasswordSet,
                'passwordLockedUntil' => $this->services->superuserPassword->lockedUntilIso($family),
            ]);
        });
    }

    /** #18 パスワードの設定・変更 */
    public function setPassword(Request $request): Response
    {
        return $this->authenticated($request, function (AuthContext $c) use ($request): Response {
            $this->requireElevation($c);
            $password = Params::string($request->json(), 'newPassword');
            SuperuserPasswordService::assertValidFormat($password, 'newPassword');

            $familyId = $c->familyId();
            $hash = $this->services->passwordHasher->hash($password);
            Transaction::run($this->services->pdo, function () use ($familyId, $hash): void {
                $this->services->families->lock($familyId) ?? throw ApiException::unauthenticated();
                $this->services->families->setPassword($familyId, $hash);
            });
            return Response::noContent();
        });
    }

    /** #19 パスワードの削除（未設定に戻す） */
    public function deletePassword(Request $request): Response
    {
        return $this->authenticated($request, function (AuthContext $c): Response {
            $this->requireElevation($c);
            $familyId = $c->familyId();
            Transaction::run($this->services->pdo, function () use ($familyId): void {
                $this->services->families->lock($familyId) ?? throw ApiException::unauthenticated();
                if ($this->services->families->hasPasskeys($familyId)) {
                    throw ApiException::conflict('PASSKEYS_REGISTERED', 'パスキーが登録されているため、パスワードを削除できません。先にパスキーを削除してください。');
                }
                $this->services->families->clearPassword($familyId);
            });
            return Response::noContent();
        });
    }

    /** #20 スーパーユーザを他のユーザへ移す */
    public function transfer(Request $request): Response
    {
        return $this->authenticated($request, function (AuthContext $c) use ($request): Response {
            $this->requireElevation($c);
            $userId = Params::string($request->json(), 'userId');
            $familyId = $c->familyId();

            $users = Transaction::run($this->services->pdo, function () use ($familyId, $userId): array {
                $this->services->families->lock($familyId) ?? throw ApiException::unauthenticated();
                $target = Uuid7::isValid($userId) ? $this->services->users->findInFamily($familyId, Uuid7::toBinary($userId)) : null;
                if ($target === null) {
                    throw ApiException::notFound('ユーザが見つかりません。');
                }
                if (!$target->isSuperuser) {
                    // 家族内のスーパーユーザは1人だけ（DB の一意制約）のため、現在のスーパーユーザを先に外す。
                    foreach ($this->services->users->listByFamily($familyId) as $user) {
                        if ($user->isSuperuser) {
                            $this->services->users->setSuperuser($user->id, false);
                        }
                    }
                    $this->services->users->setSuperuser($target->id, true);
                }
                return $this->services->users->listByFamily($familyId);
            });
            return Response::json(200, ['users' => FamilyView::users($users)]);
        });
    }

    /** #22 パスワードの再設定（復旧コードで確認。確認（elevation）は不要） */
    public function resetPassword(Request $request): Response
    {
        return $this->authenticated($request, function (AuthContext $c) use ($request): Response {
            $data = $request->json();
            $verifier = $this->services->recoveryVerifier;
            $newPassword = Params::string($data, 'newPassword');
            SuperuserPasswordService::assertValidFormat($newPassword, 'newPassword');
            $normalized = $verifier->normalize(Params::string($data, 'recoveryCode'));

            $family = $this->services->families->find($c->familyId()) ?? throw ApiException::unauthenticated();
            $verifier->assertMatches($family, $normalized, $request->clientIp);

            $hash = $this->services->passwordHasher->hash($newPassword);
            $until = Transaction::run($this->services->pdo, function () use ($family, $hash, $c) {
                $this->services->families->lock($family->id) ?? throw ApiException::unauthenticated();
                // ロック中でも再設定できる（失敗回数とロックも初期値に戻る）。
                $this->services->families->setPassword($family->id, $hash);
                return $this->services->sessions->elevate($c->session->id);
            });
            return Response::json(200, ['elevatedUntil' => Time::toIso($until)]);
        });
    }

    /** #24 パスキーの一覧 */
    public function passkeys(Request $request): Response
    {
        return $this->authenticated($request, fn (AuthContext $c): Response => Response::json(200, [
            'passkeys' => array_map($this->view(...), $this->services->passkeys->listByFamily($c->familyId())),
        ]));
    }

    /** #25 パスキーの登録の開始（challenge の発行） */
    public function registrationOptions(Request $request): Response
    {
        return $this->authenticated($request, function (AuthContext $c): Response {
            $this->requireElevation($c);
            $family = $this->services->families->find($c->familyId()) ?? throw ApiException::unauthenticated();
            if (!$family->superuserPasswordSet) {
                throw ApiException::conflict('SUPERUSER_PASSWORD_NOT_SET', 'パスキーを登録するには、先にスーパーユーザのパスワードを設定してください。');
            }
            $existing = $this->services->passkeys->listByFamily($family->id);
            if (count($existing) >= PasskeyRepository::MAX_PER_FAMILY) {
                throw $this->limitReached();
            }
            $this->limitChallenges($c);

            $challenge = $this->services->challenges->issue($c->session->id, ChallengeStore::FAMILY_REGISTRATION);
            return Response::json(200, $this->services->webauthn->registrationOptions($family->id, $challenge, $existing));
        });
    }

    /** #26 パスキーの登録 */
    public function register(Request $request): Response
    {
        return $this->authenticated($request, function (AuthContext $c) use ($request): Response {
            $this->requireElevation($c);
            $credential = $request->json()['credential'] ?? null;
            if (!is_array($credential)) {
                throw ApiException::badRequest('「credential」の形式が正しくありません。');
            }
            $familyId = $c->familyId();

            // challenge は、検証の成否にかかわらず、ここで使い切る。
            $challenge = $this->services->challenges->take($c->session->id, ChallengeStore::FAMILY_REGISTRATION)
                ?? throw ApiException::passkeyVerificationFailed();
            $verified = $this->services->webauthn->verifyRegistration($credential, $challenge, $familyId);

            $now = $this->services->clock->now();
            $passkey = new PasskeyRecord(
                Uuid7::generateBinary(),
                $familyId,
                $verified->credentialId,
                $verified->publicKey,
                $verified->signCount,
                $verified->transports,
                $verified->backupEligible,
                mb_substr(DeviceLabel::fromUserAgent($request->header('user-agent')) . ' で登録', 0, 50),
                $now,
                null,
            );

            Transaction::run($this->services->pdo, function () use ($familyId, $passkey): void {
                $family = $this->services->families->lock($familyId) ?? throw ApiException::unauthenticated();
                if (!$family->superuserPasswordSet) {
                    throw ApiException::conflict('SUPERUSER_PASSWORD_NOT_SET', 'パスキーを登録するには、先にスーパーユーザのパスワードを設定してください。');
                }
                if ($this->services->passkeys->countByFamily($familyId) >= PasskeyRepository::MAX_PER_FAMILY) {
                    throw $this->limitReached();
                }
                if (!$this->services->passkeys->insert($passkey)) {
                    // すでに登録されているクレデンシャル（excludeCredentials をすり抜けた場合）。
                    throw ApiException::passkeyVerificationFailed();
                }
            });
            return Response::json(201, ['passkey' => $this->view($passkey)]);
        });
    }

    /** #27 パスキーの削除 */
    public function deletePasskey(Request $request, array $params): Response
    {
        return $this->authenticated($request, function (AuthContext $c) use ($params): Response {
            $this->requireElevation($c);
            $id = (string) ($params['passkeyId'] ?? '');
            $passkey = Uuid7::isValid($id) ? $this->services->passkeys->findInFamily($c->familyId(), Uuid7::toBinary($id)) : null;
            if ($passkey === null) {
                throw ApiException::notFound('パスキーが見つかりません。');
            }
            $this->services->passkeys->delete($passkey->id);
            return Response::noContent();
        });
    }

    private function limitReached(): ApiException
    {
        return ApiException::conflict('PASSKEY_LIMIT_REACHED', 'パスキーは10件まで登録できます。不要なパスキーを削除してください。');
    }

    /** @return array{id: string, name: string, synced: bool, createdAt: string, lastUsedAt: ?string} */
    private function view(PasskeyRecord $p): array
    {
        return [
            'id' => Uuid7::toString($p->id),
            'name' => $p->name,
            'synced' => $p->backupEligible,
            'createdAt' => Time::toIso($p->createdAt),
            'lastUsedAt' => $p->lastUsedAt === null ? null : Time::toIso($p->lastUsedAt),
        ];
    }
}
