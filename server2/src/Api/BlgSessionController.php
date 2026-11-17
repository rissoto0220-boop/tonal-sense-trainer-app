<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Belonging\BlgAuthContext;
use UecTst\Belonging\BlgView;
use UecTst\Passkey\ChallengeStore;
use UecTst\Security\Tokens;
use UecTst\Support\Time;
use UecTst\Validation\Params;

/**
 * 所属のログイン・ログアウト（ApiSpec_Belonging.md 1.）。
 *   B1 ログイン POST /blg/sessions
 *   B2 パスキーによるログインの確認の開始 POST /blg/sessions/passkey-options
 *   B3 パスキーによるログインの確認 POST /blg/sessions/passkey
 *   B4 ログイン状態の取得 GET /blg/sessions/current
 *   B5 ログアウト DELETE /blg/sessions/current
 */
final class BlgSessionController extends BlgController
{
    private const LOGIN_FAIL_IP_LIMIT = 20;       // IP 単位 失敗 20回／1時間（超えたら拒否）
    private const LOGIN_FAIL_GLOBAL_NOTIFY = 500; // システム全体 失敗 500回／1時間（通知のみ）
    private const LOGIN_WINDOW = 3600;

    /** B1 ログイン（ログインID＋パスワード） */
    public function login(Request $request): Response
    {
        $data = $request->json();
        $loginId = strtolower(trim(Params::string($data, 'loginId')));
        $password = Params::string($data, 'password');
        $services = $this->services;

        // 1. 回数制限（IP 単位の失敗回数）
        $failures = $services->rateLimiter->peek('blglogin:fail:ip:' . $request->clientIp);
        if ($failures->count >= self::LOGIN_FAIL_IP_LIMIT) {
            throw ApiException::rateLimited($failures->retryAfterSeconds);
        }
        if ($loginId === '' || $password === '') {
            throw ApiException::validationFailed('ログインIDとパスワードを入力してください。', [
                ['field' => $loginId === '' ? 'loginId' : 'password', 'code' => 'REQUIRED'],
            ]);
        }

        // 2. ログインIDで検索する。なければ、処理時間の差で有無が分からないよう、ダミーの照合をしてから失敗にする。
        $belonging = $services->belongings->findByLoginId($loginId);
        if ($belonging === null) {
            $services->blgPasswords->dummyVerify($password);
            $this->recordLoginFailure($request->clientIp);
            $this->audit('login', null, 'failure');
            throw ApiException::invalidCredentials();
        }

        // 3.〜4. 行をロックして、ロック中か・パスワードが一致するかを確認する（失敗の回数は、ここで確定する）。
        $outcome = $services->blgPasswords->attempt($belonging->id, $password);
        if ($outcome['result'] === 'invalid') {
            $this->recordLoginFailure($request->clientIp);
            $this->audit('login', $belonging->id, 'failure');
        }
        $this->assertPasswordOutcome($outcome, $belonging->id, 'login');

        // 5. セッションを作る。運用担当者の所属は段階0（パスキーの確認が未了）、通常の所属は段階1。
        $this->deleteCurrentSessionIfAny($request);
        [$token, $session] = $services->blgSessions->create($belonging->id, $belonging->isSuper ? 0 : 1);
        $passkeyRegistered = $belonging->isSuper && $services->blgPasskeys->countByOwner($belonging->id) > 0;
        $this->audit('login', $belonging->id);

        return Response::json(201, [
            'belonging' => BlgView::belonging($belonging),
            'authStage' => $session->authStage,
            'passkeyRegistered' => $passkeyRegistered,
        ], [], [$services->blgCookies->set($token)]);
    }

    /** B2 パスキーによるログインの確認の開始（challenge の発行） */
    public function passkeyOptions(Request $request): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c): Response {
            $this->assertAwaitingPasskey($c);
            $passkeys = $this->services->blgPasskeys->listByOwner($c->belongingId());
            if ($passkeys === []) {
                throw ApiException::notFound('パスキーが登録されていません。');
            }
            $this->limitChallenges($c);

            $challenge = $this->services->challenges->issue($c->session->id, ChallengeStore::BLG_LOGIN);
            return Response::json(200, $this->services->webauthn->requestOptions($challenge, $passkeys));
        }, requireLoginComplete: false, superOnly: true);
    }

    /** B3 パスキーによるログインの確認（ログインの完了。段階0 → 1） */
    public function passkey(Request $request): Response
    {
        $credential = $request->json()['passkey'] ?? null;
        return $this->guarded($request, function (BlgAuthContext $c) use ($credential): Response {
            $this->assertAwaitingPasskey($c);
            if (!is_array($credential)) {
                throw ApiException::badRequest('「passkey」の形式が正しくありません。');
            }
            $services = $this->services;
            $blgId = $c->belongingId();

            // challenge は、検証の成否にかかわらず、ここで使い切る（使い回しを防ぐ）。
            $challenge = $services->challenges->take($c->session->id, ChallengeStore::BLG_LOGIN);
            $credentialId = $services->webauthn->credentialIdOf($credential);
            $stored = ($challenge === null || $credentialId === null) ? null : $services->blgPasskeys->findByCredentialId($blgId, $credentialId);
            if ($challenge === null || $stored === null) {
                $this->audit('login.passkey', $blgId, 'failure');
                throw ApiException::passkeyVerificationFailed();
            }
            try {
                $signCount = $services->webauthn->verifyAssertion($credential, $challenge, $stored, $services->blgPasskeys->listByOwner($blgId));
            } catch (ApiException $e) {
                $this->audit('login.passkey', $blgId, 'failure');
                throw $e;
            }
            $services->blgPasskeys->recordUse($stored->id, $signCount, $services->clock->now());
            $services->blgSessions->completeLogin($c->session);
            $this->audit('login.passkey', $blgId);

            return Response::json(200, ['belonging' => BlgView::belonging($c->belonging), 'authStage' => 1]);
        }, requireLoginComplete: false, superOnly: true);
    }

    /** B4 ログイン状態と所属の情報の取得（段階0でも呼べる） */
    public function current(Request $request): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c): Response {
            $session = $c->session;
            return Response::json(200, [
                'session' => [
                    'id' => Uuid7::toString($session->id),
                    'authStage' => $session->authStage,
                    'createdAt' => Time::toIso($session->createdAt),
                    'expiresAt' => Time::toIso($session->expiresAt),
                    'elevatedUntil' => $session->isElevated($this->services->clock->now()) ? Time::toIso($session->elevatedUntil) : null,
                ],
                'belonging' => BlgView::belonging($c->belonging),
            ]);
        }, requireLoginComplete: false, allowPasswordChangeRequired: true);
    }

    /** B5 ログアウト */
    public function logout(Request $request): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c): Response {
            $this->services->blgSessions->delete($c->session->id);
            $this->audit('logout', $c->belongingId());
            return Response::noContent([], [$this->services->blgCookies->clear()]);
        }, requireLoginComplete: false, allowPasswordChangeRequired: true);
    }

    /** B2・B3 は、パスキーの確認が未了のセッション（段階0）だけが呼べる。 */
    private function assertAwaitingPasskey(BlgAuthContext $c): void
    {
        if ($c->session->isLoginComplete()) {
            throw ApiException::badRequest('ログインは完了しています。');
        }
    }

    private function recordLoginFailure(string $clientIp): void
    {
        $this->services->rateLimiter->hit('blglogin:fail:ip:' . $clientIp, self::LOGIN_WINDOW);
        $global = $this->services->rateLimiter->hit('blglogin:fail:global', self::LOGIN_WINDOW);
        if ($global->count === self::LOGIN_FAIL_GLOBAL_NOTIFY + 1) {
            // 拒否すると、全所属がログインできなくなるため、運用担当者への通知（ログ）のみ。
            $this->services->logger->warning('所属のログインの失敗数が、システム全体のしきい値を超えました（運用担当者への通知）', ['threshold' => self::LOGIN_FAIL_GLOBAL_NOTIFY]);
        }
    }

    /** 同じブラウザに古いセッションを残さないため、有効な Cookie があれば、そのセッションを削除する。 */
    private function deleteCurrentSessionIfAny(Request $request): void
    {
        $token = $request->cookie($this->services->blgCookies->name());
        if ($token === null || !Tokens::isWellFormed($token)) {
            return;
        }
        $existing = $this->services->blgSessions->findByToken($token);
        if ($existing !== null) {
            $this->services->blgSessions->delete($existing->id);
        }
    }
}
