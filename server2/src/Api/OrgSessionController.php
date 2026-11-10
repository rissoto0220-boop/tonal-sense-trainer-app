<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Organization\OrgAuthContext;
use UecTst\Organization\OrgView;
use UecTst\Passkey\ChallengeStore;
use UecTst\Security\Tokens;
use UecTst\Support\Time;
use UecTst\Validation\Params;

/**
 * 組織のログイン・ログアウト（ApiSpec_Organization.md 1.）。
 *   O1 ログイン POST /org/sessions
 *   O2 パスキーによるログインの確認の開始 POST /org/sessions/passkey-options
 *   O3 パスキーによるログインの確認 POST /org/sessions/passkey
 *   O4 ログイン状態の取得 GET /org/sessions/current
 *   O5 ログアウト DELETE /org/sessions/current
 */
final class OrgSessionController extends OrgController
{
    private const LOGIN_FAIL_IP_LIMIT = 20;       // IP 単位 失敗 20回／1時間（超えたら拒否）
    private const LOGIN_FAIL_GLOBAL_NOTIFY = 500; // システム全体 失敗 500回／1時間（通知のみ）
    private const LOGIN_WINDOW = 3600;

    /** O1 ログイン（ログインID＋パスワード） */
    public function login(Request $request): Response
    {
        $data = $request->json();
        $loginId = strtolower(trim(Params::string($data, 'loginId')));
        $password = Params::string($data, 'password');
        $services = $this->services;

        // 1. 回数制限（IP 単位の失敗回数）
        $failures = $services->rateLimiter->peek('orglogin:fail:ip:' . $request->clientIp);
        if ($failures->count >= self::LOGIN_FAIL_IP_LIMIT) {
            throw ApiException::rateLimited($failures->retryAfterSeconds);
        }
        if ($loginId === '' || $password === '') {
            throw ApiException::validationFailed('ログインIDとパスワードを入力してください。', [
                ['field' => $loginId === '' ? 'loginId' : 'password', 'code' => 'REQUIRED'],
            ]);
        }

        // 2. ログインIDで検索する。なければ、処理時間の差で有無が分からないよう、ダミーの照合をしてから失敗にする。
        $organization = $services->organizations->findByLoginId($loginId);
        if ($organization === null) {
            $services->orgPasswords->dummyVerify($password);
            $this->recordLoginFailure($request->clientIp);
            $this->audit('login', null, 'failure');
            throw ApiException::invalidCredentials();
        }

        // 3.〜4. 行をロックして、ロック中か・パスワードが一致するかを確認する（失敗の回数は、ここで確定する）。
        $outcome = $services->orgPasswords->attempt($organization->id, $password);
        if ($outcome['result'] === 'invalid') {
            $this->recordLoginFailure($request->clientIp);
            $this->audit('login', $organization->id, 'failure');
        }
        $this->assertPasswordOutcome($outcome, $organization->id, 'login');

        // 5. セッションを作る。運用担当者の組織は段階0（パスキーの確認が未了）、通常の組織は段階1。
        $this->deleteCurrentSessionIfAny($request);
        [$token, $session] = $services->orgSessions->create($organization->id, $organization->isSuper ? 0 : 1);
        $passkeyRegistered = $organization->isSuper && $services->orgPasskeys->countByOwner($organization->id) > 0;
        $this->audit('login', $organization->id);

        return Response::json(201, [
            'organization' => OrgView::organization($organization),
            'authStage' => $session->authStage,
            'passkeyRegistered' => $passkeyRegistered,
        ], [], [$services->orgCookies->set($token)]);
    }

    /** O2 パスキーによるログインの確認の開始（challenge の発行） */
    public function passkeyOptions(Request $request): Response
    {
        return $this->guarded($request, function (OrgAuthContext $c): Response {
            $this->assertAwaitingPasskey($c);
            $passkeys = $this->services->orgPasskeys->listByOwner($c->organizationId());
            if ($passkeys === []) {
                throw ApiException::notFound('パスキーが登録されていません。');
            }
            $this->limitChallenges($c);

            $challenge = $this->services->challenges->issue($c->session->id, ChallengeStore::ORG_LOGIN);
            return Response::json(200, $this->services->webauthn->requestOptions($challenge, $passkeys));
        }, requireLoginComplete: false, superOnly: true);
    }

    /** O3 パスキーによるログインの確認（ログインの完了。段階0 → 1） */
    public function passkey(Request $request): Response
    {
        $credential = $request->json()['passkey'] ?? null;
        return $this->guarded($request, function (OrgAuthContext $c) use ($credential): Response {
            $this->assertAwaitingPasskey($c);
            if (!is_array($credential)) {
                throw ApiException::badRequest('「passkey」の形式が正しくありません。');
            }
            $services = $this->services;
            $orgId = $c->organizationId();

            // challenge は、検証の成否にかかわらず、ここで使い切る（使い回しを防ぐ）。
            $challenge = $services->challenges->take($c->session->id, ChallengeStore::ORG_LOGIN);
            $credentialId = $services->webauthn->credentialIdOf($credential);
            $stored = ($challenge === null || $credentialId === null) ? null : $services->orgPasskeys->findByCredentialId($orgId, $credentialId);
            if ($challenge === null || $stored === null) {
                $this->audit('login.passkey', $orgId, 'failure');
                throw ApiException::passkeyVerificationFailed();
            }
            try {
                $signCount = $services->webauthn->verifyAssertion($credential, $challenge, $stored, $services->orgPasskeys->listByOwner($orgId));
            } catch (ApiException $e) {
                $this->audit('login.passkey', $orgId, 'failure');
                throw $e;
            }
            $services->orgPasskeys->recordUse($stored->id, $signCount, $services->clock->now());
            $services->orgSessions->completeLogin($c->session);
            $this->audit('login.passkey', $orgId);

            return Response::json(200, ['organization' => OrgView::organization($c->organization), 'authStage' => 1]);
        }, requireLoginComplete: false, superOnly: true);
    }

    /** O4 ログイン状態と組織の情報の取得（段階0でも呼べる） */
    public function current(Request $request): Response
    {
        return $this->guarded($request, function (OrgAuthContext $c): Response {
            $session = $c->session;
            return Response::json(200, [
                'session' => [
                    'id' => Uuid7::toString($session->id),
                    'authStage' => $session->authStage,
                    'createdAt' => Time::toIso($session->createdAt),
                    'expiresAt' => Time::toIso($session->expiresAt),
                    'elevatedUntil' => $session->isElevated($this->services->clock->now()) ? Time::toIso($session->elevatedUntil) : null,
                ],
                'organization' => OrgView::organization($c->organization),
            ]);
        }, requireLoginComplete: false, allowPasswordChangeRequired: true);
    }

    /** O5 ログアウト */
    public function logout(Request $request): Response
    {
        return $this->guarded($request, function (OrgAuthContext $c): Response {
            $this->services->orgSessions->delete($c->session->id);
            $this->audit('logout', $c->organizationId());
            return Response::noContent([], [$this->services->orgCookies->clear()]);
        }, requireLoginComplete: false, allowPasswordChangeRequired: true);
    }

    /** O2・O3 は、パスキーの確認が未了のセッション（段階0）だけが呼べる。 */
    private function assertAwaitingPasskey(OrgAuthContext $c): void
    {
        if ($c->session->isLoginComplete()) {
            throw ApiException::badRequest('ログインは完了しています。');
        }
    }

    private function recordLoginFailure(string $clientIp): void
    {
        $this->services->rateLimiter->hit('orglogin:fail:ip:' . $clientIp, self::LOGIN_WINDOW);
        $global = $this->services->rateLimiter->hit('orglogin:fail:global', self::LOGIN_WINDOW);
        if ($global->count === self::LOGIN_FAIL_GLOBAL_NOTIFY + 1) {
            // 拒否すると、全組織がログインできなくなるため、運用担当者への通知（ログ）のみ。
            $this->services->logger->warning('組織のログインの失敗数が、システム全体のしきい値を超えました（運用担当者への通知）', ['threshold' => self::LOGIN_FAIL_GLOBAL_NOTIFY]);
        }
    }

    /** 同じブラウザに古いセッションを残さないため、有効な Cookie があれば、そのセッションを削除する。 */
    private function deleteCurrentSessionIfAny(Request $request): void
    {
        $token = $request->cookie($this->services->orgCookies->name());
        if ($token === null || !Tokens::isWellFormed($token)) {
            return;
        }
        $existing = $this->services->orgSessions->findByToken($token);
        if ($existing !== null) {
            $this->services->orgSessions->delete($existing->id);
        }
    }
}
