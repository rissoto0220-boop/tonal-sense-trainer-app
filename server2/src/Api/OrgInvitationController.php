<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Mail\MailException;
use UecTst\Organization\OrgAuthContext;
use UecTst\Security\Tokens;
use UecTst\Support\Time;
use UecTst\Validation\Input;
use UecTst\Validation\Params;

/**
 * 招待（ApiSpec_Organization.md 4.）。招待先のメールアドレスは保存しない。
 *   O12 招待メールの送信 POST /org/invitations
 *   O13 未使用の招待の件数 GET /org/invitations
 *   O14 未使用の招待の取り消し DELETE /org/invitations
 */
final class OrgInvitationController extends OrgController
{
    /** 招待の有効期限。 */
    private const LIFETIME = '+7 days';

    private const SEND_ORG_LIMIT = 100;      // 組織単位 100通／1時間
    private const SEND_GLOBAL_LIMIT = 1000;  // システム全体 1,000通／1時間（仮登録メールと合算）
    private const SEND_WINDOW = 3600;

    /** O12 招待メールの送信 */
    public function send(Request $request): Response
    {
        $email = trim(Params::string($request->json(), 'email'));

        return $this->guarded($request, function (OrgAuthContext $c) use ($email): Response {
            $services = $this->services;
            $orgId = $c->organizationId();

            // 1. 回数制限（組織単位、システム全体）
            $perOrg = $services->rateLimiter->hit('invite:send:org:' . bin2hex($orgId), self::SEND_WINDOW);
            if ($perOrg->count > self::SEND_ORG_LIMIT) {
                throw ApiException::rateLimited($perOrg->retryAfterSeconds);
            }
            $global = $services->rateLimiter->hit('mail:send:global', self::SEND_WINDOW);
            if ($global->count > self::SEND_GLOBAL_LIMIT) {
                if ($global->count === self::SEND_GLOBAL_LIMIT + 1) {
                    $services->logger->warning('メールの送信数が、システム全体の上限を超えました（運用者への通知）', ['limit' => self::SEND_GLOBAL_LIMIT]);
                }
                throw ApiException::rateLimited($global->retryAfterSeconds);
            }

            // 2. メールアドレスの形式
            if (Input::emailError($email) !== null) {
                throw ApiException::validationFailed('メールアドレスの形式が正しくありません。', [['field' => 'email', 'code' => 'INVALID_FORMAT']]);
            }

            // 3. トークンを作り、ハッシュ・組織・有効期限だけを保存する。
            $now = $services->clock->now();
            $expiresAt = $now->modify(self::LIFETIME);
            $token = Tokens::generate();
            $tokenHash = Tokens::hash($token);
            $services->invitations->insert(Uuid7::generateBinary(), $orgId, $tokenHash, $expiresAt);

            // 4. 招待URL（トークンはフラグメントに含め、サーバのアクセスログに残さない）と組織名を、メールで送る。
            $url = $services->config->publicBaseUrl . '/invite#token=' . $token;
            try {
                $services->mailer->send($email, '【TonalSenseTrainer】' . $c->organization->name . ' からの招待', self::mailBody($c->organization->name, $url));
            } catch (MailException $e) {
                // 5. 送信に失敗した場合は、サポートのため、メールアドレスと失敗理由を記録し（成功時は記録しない）、招待を取り消す。
                $services->logger->error('招待メールの送信に失敗しました', ['email' => $email, 'reason' => $e->getMessage()]);
                $services->invitations->deleteByHash($tokenHash);
                throw new ApiException(503, 'MAIL_SEND_FAILED', 'メールを送信できませんでした。しばらくしてから、もう一度お試しください。');
            }
            $this->audit('invitation.send', $orgId, 'success', ['count' => 1]);

            return Response::json(202, ['sender' => $services->mailer->sender(), 'expiresAt' => Time::toIso($expiresAt)]);
        });
    }

    /** O13 未使用の招待の件数（誰に送ったかは分からない） */
    public function count(Request $request): Response
    {
        return $this->guarded($request, fn (OrgAuthContext $c): Response => Response::json(200, [
            'pendingCount' => $this->services->invitations->countPending($c->organizationId(), $this->services->clock->now()),
        ]));
    }

    /** O14 未使用の招待の取り消し（個別の招待は区別できないため、すべて取り消す） */
    public function revoke(Request $request): Response
    {
        return $this->guarded($request, function (OrgAuthContext $c): Response {
            $count = $this->services->invitations->revokePending($c->organizationId(), $this->services->clock->now());
            $this->audit('invitation.revoke', $c->organizationId(), 'success', ['count' => $count]);
            return Response::json(200, ['revokedCount' => $count]);
        });
    }

    private static function mailBody(string $organizationName, string $url): string
    {
        return "{$organizationName} から、TonalSenseTrainer への招待が届いています。\n\n"
            . "次のリンクを開いて、{$organizationName} に所属するかどうかを選んでください（7日間有効です）。\n\n"
            . $url . "\n\n"
            . "所属すると、{$organizationName} は、あなたの家族の利用データ（テスト結果）を見られるようになります。\n"
            . "このメールに心当たりがない場合は、何もせずに破棄してください。\n"
            . "リンクを開いただけでは、所属は完了しません。\n";
    }
}
