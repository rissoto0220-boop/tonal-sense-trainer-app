<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Auth\DeviceLabel;
use UecTst\Auth\RecoveryAttempts;
use UecTst\Auth\Session;
use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Security\Tokens;
use UecTst\Support\Time;
use UecTst\Validation\Params;

/**
 * ログイン・ログアウト・端末の管理（ApiSpec_Auth.md 2.〜4.）。
 *   #4 復旧コードによるログイン POST /sessions
 *   #5 ログイン状態の取得 GET /sessions/current
 *   #6 ログアウト DELETE /sessions/current
 *   #7 ユーザの切り替え PUT /sessions/current/selected-user
 *   #8 ログイン中の端末一覧 GET /sessions
 *   #9 他の端末のログアウト DELETE /sessions/{sessionId}
 */
final class SessionController extends AuthenticatedController
{
    /** #4 復旧コードによるログイン */
    public function login(Request $request): Response
    {
        $input = Params::string($request->json(), 'recoveryCode');
        $services = $this->services;

        // 1. 回数制限（IP 単位）。失敗が上限に達していれば、照合せずに拒否する。
        $services->recoveryAttempts->assertAllowed($request->clientIp);

        // 2. 正規化と、形式・チェック用の文字の検査。誤りは、照合せず、失敗回数にも数えない。
        $normalized = RecoveryAttempts::normalize($input);

        // 3. 有効なすべての鍵で HMAC 化して、家族を探す。
        $family = $services->families->findByRecoveryHashes($services->recoveryHasher->hashWithAllKeys($normalized));
        if ($family === null) {
            $services->recoveryAttempts->recordFailure($request->clientIp);
            throw new ApiException(401, 'INVALID_RECOVERY_CODE', '復旧コードが正しくありません。');
        }

        // 4. セッションを作る。同じブラウザに古いセッションを残さないため、有効な Cookie があれば、そのセッションを削除する。
        $this->deleteCurrentSessionIfAny($request);
        $users = $services->users->listByFamily($family->id);
        $selected = $users[0]->id ?? null;
        [$token, $session] = $services->sessions->create($family->id, $selected, DeviceLabel::fromUserAgent($request->header('user-agent')));

        return Response::json(
            201,
            ['family' => $services->familyView->family($family, $session->selectedUserId)],
            [],
            [$services->cookies->set($token)],
        );
    }

    /** #5 ログイン状態と家族の情報の取得 */
    public function current(Request $request): Response
    {
        return $this->authenticated($request, function ($context): Response {
            $family = $this->services->families->find($context->familyId());
            if ($family === null) {
                throw ApiException::unauthenticated();
            }
            $session = $context->session;
            return Response::json(200, [
                'session' => [
                    'id' => Uuid7::toString($session->id),
                    'deviceLabel' => $session->deviceLabel,
                    'createdAt' => Time::toIso($session->createdAt),
                    'expiresAt' => Time::toIso($session->expiresAt),
                    'elevatedUntil' => $session->isElevated($this->services->clock->now()) ? Time::toIso($session->elevatedUntil) : null,
                ],
                'family' => $this->services->familyView->family($family, $session->selectedUserId),
            ]);
        });
    }

    /** #6 ログアウト（確認は不要） */
    public function logout(Request $request): Response
    {
        return $this->authenticated($request, function ($context): Response {
            $this->services->sessions->delete($context->session->id);
            return Response::noContent([], [$this->services->cookies->clear()]);
        });
    }

    /** #7 ユーザの切り替え（ロックはかけない。基本方針 9.3） */
    public function selectUser(Request $request): Response
    {
        $userId = Params::string($request->json(), 'userId');
        return $this->authenticated($request, function ($context) use ($userId): Response {
            $user = Uuid7::isValid($userId) ? $this->services->users->findInFamily($context->familyId(), Uuid7::toBinary($userId)) : null;
            if ($user === null) {
                throw ApiException::notFound('ユーザが見つかりません。');
            }
            $this->services->sessions->setSelectedUser($context->session->id, $user->id);
            return Response::noContent();
        });
    }

    /** #8 ログイン中の端末一覧 */
    public function list(Request $request): Response
    {
        return $this->authenticated($request, function ($context): Response {
            $sessions = array_map(
                static fn (Session $s): array => [
                    'id' => Uuid7::toString($s->id),
                    'deviceLabel' => $s->deviceLabel,
                    'createdAt' => Time::toIso($s->createdAt),
                    'lastUsedAt' => Time::toIso($s->lastUsedAt),
                    'current' => $s->id === $context->session->id,
                ],
                $this->services->sessions->listForFamily($context->familyId()),
            );
            return Response::json(200, ['sessions' => $sessions]);
        });
    }

    /** #9 他の端末のログアウト（確認が必要。自分の端末を指定した場合は、確認なしで、ログアウトと同じ動作） */
    public function revoke(Request $request, array $params): Response
    {
        return $this->authenticated($request, function ($context) use ($params): Response {
            $sessionId = $params['sessionId'] ?? '';
            $isCurrent = Uuid7::isValid($sessionId) && Uuid7::toBinary($sessionId) === $context->session->id;

            if (!$isCurrent) {
                $this->requireElevation($context);
            }
            $target = Uuid7::isValid($sessionId) ? $this->services->sessions->findInFamily($context->familyId(), Uuid7::toBinary($sessionId)) : null;
            if ($target === null) {
                throw ApiException::notFound('端末が見つかりません。');
            }
            $this->services->sessions->delete($target->id);
            return Response::noContent([], $isCurrent ? [$this->services->cookies->clear()] : []);
        });
    }

    private function deleteCurrentSessionIfAny(Request $request): void
    {
        $token = $request->cookie($this->services->cookies->name());
        if ($token === null || !Tokens::isWellFormed($token)) {
            return;
        }
        $existing = $this->services->sessions->findByToken($token);
        if ($existing !== null) {
            $this->services->sessions->delete($existing->id);
        }
    }
}
