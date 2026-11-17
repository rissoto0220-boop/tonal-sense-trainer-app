<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Auth\AuthContext;
use UecTst\Db\Transaction;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Security\Tokens;
use UecTst\Support\Time;
use UecTst\Validation\Params;

/**
 * 家族の、所属（ApiSpec_Auth.md 10.）。
 *   #28 招待の照合 POST /invitations/verify
 *   #29 所属先の取得 GET /belonging
 *   #30 登録済みの家族の所属 POST /belonging（確認が必要）
 *   #31 所属の解除 DELETE /belonging（確認が必要）
 * 新しく登録する家族の所属は、招待経由の本登録（#3）で行う。
 */
final class MembershipController extends AuthenticatedController
{
    /** #28 招待の照合（DB は変更しない。リンクスキャナーが招待ページを開いても、招待は消費されない） */
    public function verifyInvitation(Request $request): Response
    {
        $token = Params::string($request->json(), 'token');
        $this->limitByIp($request);

        $invitation = Tokens::isWellFormed($token)
            ? $this->services->invitations->findValid(Tokens::hash($token), $this->services->clock->now())
            : null;
        if ($invitation === null) {
            throw self::invitationInvalid();
        }
        return Response::json(200, [
            'belongingName' => $invitation['belongingName'],
            'expiresAt' => Time::toIso($invitation['expiresAt']),
        ]);
    }

    /** #29 所属先の取得（所属していなければ belonging: null） */
    public function show(Request $request): Response
    {
        return $this->authenticated($request, function (AuthContext $c): Response {
            $family = $this->services->families->find($c->familyId()) ?? throw ApiException::unauthenticated();
            return Response::json(200, ['belonging' => $this->services->families->belongingOf($family)]);
        });
    }

    /** #30 登録済みの家族の所属（別の所属から移ることもできる） */
    public function join(Request $request): Response
    {
        $token = Params::string($request->json(), 'invitationToken');

        return $this->authenticated($request, function (AuthContext $c) use ($token, $request): Response {
            $this->requireElevation($c);
            $this->limitByIp($request);
            $services = $this->services;
            $familyId = $c->familyId();
            $tokenHash = Tokens::isWellFormed($token) ? Tokens::hash($token) : null;
            if ($tokenHash === null) {
                throw self::invitationInvalid();
            }

            [$belonging, $previous] = Transaction::run($services->pdo, function () use ($services, $familyId, $tokenHash): array {
                $family = $services->families->lock($familyId) ?? throw ApiException::unauthenticated();
                $now = $services->clock->now();
                $belongingId = $services->invitations->consume($tokenHash, $now) ?? throw self::invitationInvalid();
                if ($family->belongingId === $belongingId) {
                    // すでに同じ所属先に所属している。ロールバックにより、招待は消費されない。
                    throw ApiException::conflict('ALREADY_MEMBER', 'すでに、この所属先に所属しています。');
                }
                $previous = $services->families->belongingOf($family);
                $services->families->joinBelonging($familyId, $belongingId, $now);
                return [
                    ['name' => $services->belongings->nameOf($belongingId) ?? throw ApiException::internal(), 'joinedAt' => Time::toIso($now)],
                    $previous === null ? null : ['name' => $previous['name']],
                ];
            });
            $services->logger->info('blg.member.join', ['familyId' => bin2hex($familyId)]);

            return Response::json(200, ['belonging' => $belonging, 'previousBelonging' => $previous]);
        });
    }

    /** #31 所属の解除（個人ユーザに戻る） */
    public function leave(Request $request): Response
    {
        return $this->authenticated($request, function (AuthContext $c): Response {
            $this->requireElevation($c);
            $services = $this->services;
            $familyId = $c->familyId();

            Transaction::run($services->pdo, function () use ($services, $familyId): void {
                $family = $services->families->lock($familyId) ?? throw ApiException::unauthenticated();
                if ($family->belongingId === null) {
                    throw ApiException::conflict('NOT_A_MEMBER', '所属していません。');
                }
                $services->families->leaveBelonging($familyId);
            });
            $services->logger->info('blg.member.leave', ['familyId' => bin2hex($familyId)]);

            return Response::noContent();
        });
    }

    /** IP 単位 60回／10分（#2・#3・#28・#30 の、共通のカウンター）。 */
    private function limitByIp(Request $request): void
    {
        $hit = $this->services->rateLimiter->hit(RegistrationController::REGISTER_KEY . $request->clientIp, RegistrationController::REGISTER_WINDOW);
        if ($hit->count > RegistrationController::REGISTER_IP_LIMIT) {
            throw ApiException::rateLimited($hit->retryAfterSeconds);
        }
    }

    private static function invitationInvalid(): ApiException
    {
        return ApiException::gone('INVITATION_INVALID', '招待のリンクが無効、または期限切れです。');
    }
}
