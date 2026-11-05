<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Auth\DeviceLabel;
use UecTst\Db\Transaction;
use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Organization\OrgAuthContext;
use UecTst\Passkey\ChallengeStore;
use UecTst\Passkey\PasskeyRecord;
use UecTst\Passkey\PasskeyRepository;
use UecTst\Support\Time;

/**
 * 研究者の組織のパスキー（ApiSpec_Organization.md 3.）。通常の組織が呼び出した場合は 403 SUPER_ONLY。
 *   O8 一覧 GET /org/passkeys
 *   O9 登録の開始 POST /org/passkeys/registration-options
 *   O10 登録 POST /org/passkeys
 *   O11 削除 DELETE /org/passkeys/{passkeyId}
 */
final class OrgPasskeyController extends OrgController
{
    /** O8 パスキーの一覧 */
    public function list(Request $request): Response
    {
        return $this->guarded($request, fn (OrgAuthContext $c): Response => Response::json(200, [
            'passkeys' => array_map($this->view(...), $this->services->orgPasskeys->listByOwner($c->organizationId())),
        ]), superOnly: true);
    }

    /** O9 パスキーの登録の開始（challenge の発行） */
    public function registrationOptions(Request $request): Response
    {
        return $this->guarded($request, function (OrgAuthContext $c): Response {
            $existing = $this->services->orgPasskeys->listByOwner($c->organizationId());
            $this->assertMayRegister($c, count($existing));
            $this->limitChallenges($c);

            $o = $c->organization;
            $challenge = $this->services->challenges->issue($c->session->id, ChallengeStore::ORG_REGISTRATION);
            return Response::json(200, $this->services->webauthn->registrationOptions($o->id, $o->loginId, $o->name, $challenge, $existing));
        }, requireLoginComplete: false, superOnly: true);
    }

    /** O10 パスキーの登録（段階0で最初のパスキーを登録できたら、ログインを完了する） */
    public function register(Request $request): Response
    {
        return $this->guarded($request, function (OrgAuthContext $c) use ($request): Response {
            $this->assertMayRegister($c, $this->services->orgPasskeys->countByOwner($c->organizationId()));
            $credential = $request->json()['credential'] ?? null;
            if (!is_array($credential)) {
                throw ApiException::badRequest('「credential」の形式が正しくありません。');
            }
            $services = $this->services;
            $o = $c->organization;

            // challenge は、検証の成否にかかわらず、ここで使い切る。
            $challenge = $services->challenges->take($c->session->id, ChallengeStore::ORG_REGISTRATION) ?? throw ApiException::passkeyVerificationFailed();
            $verified = $services->webauthn->verifyRegistration($credential, $challenge, $o->id, $o->loginId, $o->name);

            $passkey = new PasskeyRecord(
                Uuid7::generateBinary(), $o->id, $verified->credentialId, $verified->publicKey, $verified->signCount,
                $verified->transports, $verified->backupEligible,
                mb_substr(DeviceLabel::fromUserAgent($request->header('user-agent')) . ' で登録', 0, 50),
                $services->clock->now(), null,
            );

            Transaction::run($services->pdo, function () use ($c, $passkey, $services, $o): void {
                $services->organizations->lock($o->id) ?? throw ApiException::unauthenticated();
                // ロックの後で、もう一度、確認する（同時の登録で、段階0の確認を回避されたり、上限を超えたりしないように）。
                $this->assertMayRegister($c, $services->orgPasskeys->countByOwner($o->id));
                if (!$services->orgPasskeys->insert($passkey)) {
                    throw ApiException::passkeyVerificationFailed();
                }
                if (!$c->session->isLoginComplete()) {
                    $services->orgSessions->completeLogin($c->session);
                }
            });
            $this->audit('passkey.register', $o->id);

            return Response::json(201, ['passkey' => $this->view($passkey), 'authStage' => 1]);
        }, requireLoginComplete: false, superOnly: true);
    }

    /** O11 パスキーの削除（確認が必要。最後の1件は削除できない） */
    public function delete(Request $request, array $params): Response
    {
        return $this->guarded($request, function (OrgAuthContext $c) use ($params): Response {
            $this->requireElevation($c);
            $services = $this->services;
            $orgId = $c->organizationId();
            $passkeyId = self::idParam($params, 'passkeyId');

            Transaction::run($services->pdo, function () use ($services, $orgId, $passkeyId): void {
                // 同時の削除で、最後の1件まで消えないよう、組織の行をロックして数える。
                $services->organizations->lock($orgId) ?? throw ApiException::unauthenticated();
                $passkey = $passkeyId === null ? null : $services->orgPasskeys->findInOwner($orgId, $passkeyId);
                if ($passkey === null) {
                    throw ApiException::notFound('パスキーが見つかりません。');
                }
                if ($services->orgPasskeys->countByOwner($orgId) <= 1) {
                    throw ApiException::conflict('LAST_PASSKEY', '最後のパスキーは削除できません。先に、別のパスキーを登録してください。');
                }
                $services->orgPasskeys->delete($passkey->id);
            });
            $this->audit('passkey.delete', $orgId);

            return Response::noContent();
        }, superOnly: true);
    }

    /**
     * パスキーを登録してよいか。段階1では、確認（O7）が必要。段階0では、最初のパスキー（1件も登録されていない場合）だけを、確認なしで登録できる。
     */
    private function assertMayRegister(OrgAuthContext $c, int $count): void
    {
        if ($c->session->isLoginComplete()) {
            $this->requireElevation($c);
        } elseif ($count > 0) {
            throw ApiException::passkeyRequired();
        }
        if ($count >= PasskeyRepository::MAX_PER_OWNER) {
            throw ApiException::conflict('PASSKEY_LIMIT_REACHED', 'パスキーは10件まで登録できます。不要なパスキーを削除してください。');
        }
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
