<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Db\Uuid7;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Mail\MailException;
use UecTst\Belonging\BlgAuthContext;
use UecTst\Security\Tokens;
use UecTst\Support\Time;
use UecTst\Validation\Input;
use UecTst\Validation\Params;

/**
 * 招待（ApiSpec_Belonging.md 4.）。招待先のメールアドレスは保存しない。
 *   B12 招待メールの送信 POST /blg/invitations
 *   B13 未使用の招待の件数 GET /blg/invitations
 *   B14 未使用の招待の取り消し DELETE /blg/invitations
 */
final class BlgInvitationController extends BlgController
{
    /** 招待の有効期限。 */
    private const LIFETIME = '+7 days';

    private const SEND_BLG_LIMIT = 100;      // 所属単位 100通／1時間
    private const SEND_GLOBAL_LIMIT = 1000;  // システム全体 1,000通／1時間（仮登録メールと合算）
    private const SEND_WINDOW = 3600;

    /** B12 招待メールの送信 */
    public function send(Request $request): Response
    {
        $email = trim(Params::string($request->json(), 'email'));

        return $this->guarded($request, function (BlgAuthContext $c) use ($email): Response {
            $services = $this->services;
            $blgId = $c->belongingId();

            // 1. 回数制限（所属単位、システム全体）
            $perBlg = $services->rateLimiter->hit('invite:send:blg:' . bin2hex($blgId), self::SEND_WINDOW);
            if ($perBlg->count > self::SEND_BLG_LIMIT) {
                throw ApiException::rateLimited($perBlg->retryAfterSeconds);
            }
            $global = $services->rateLimiter->hit('mail:send:global', self::SEND_WINDOW);
            if ($global->count > self::SEND_GLOBAL_LIMIT) {
                if ($global->count === self::SEND_GLOBAL_LIMIT + 1) {
                    $services->logger->warning('メールの送信数が、システム全体の上限を超えました（運用担当者への通知）', ['limit' => self::SEND_GLOBAL_LIMIT]);
                }
                throw ApiException::rateLimited($global->retryAfterSeconds);
            }

            // 2. メールアドレスの形式
            if (Input::emailError($email) !== null) {
                throw ApiException::validationFailed('メールアドレスの形式が正しくありません。', [['field' => 'email', 'code' => 'INVALID_FORMAT']]);
            }

            // 3. トークンを作り、ハッシュ・所属・有効期限だけを保存する。
            $now = $services->clock->now();
            $expiresAt = $now->modify(self::LIFETIME);
            $token = Tokens::generate();
            $tokenHash = Tokens::hash($token);
            $services->invitations->insert(Uuid7::generateBinary(), $blgId, $tokenHash, $expiresAt);

            // 4. 招待URL（トークンはフラグメントに含め、サーバのアクセスログに残さない）と所属名を、メールで送る。
            $url = $services->config->publicBaseUrl . '/invite#token=' . $token;
            try {
                $services->mailer->send($email, '【TonalSenseTrainer】' . $c->belonging->name . ' からの招待', self::mailBody($c->belonging->name, $url));
            } catch (MailException $e) {
                // 5. 送信に失敗した場合は、サポートのため、メールアドレスと失敗理由を記録し（成功時は記録しない）、招待を取り消す。
                $services->logger->error('招待メールの送信に失敗しました', ['email' => $email, 'reason' => $e->getMessage()]);
                $services->invitations->deleteByHash($tokenHash);
                throw new ApiException(503, 'MAIL_SEND_FAILED', 'メールを送信できませんでした。しばらくしてから、もう一度お試しください。');
            }
            $this->audit('invitation.send', $blgId, 'success', ['count' => 1]);

            return Response::json(202, ['sender' => $services->mailer->sender(), 'expiresAt' => Time::toIso($expiresAt)]);
        });
    }

    /** B13 未使用の招待の件数（誰に送ったかは分からない） */
    public function count(Request $request): Response
    {
        return $this->guarded($request, fn (BlgAuthContext $c): Response => Response::json(200, [
            'pendingCount' => $this->services->invitations->countPending($c->belongingId(), $this->services->clock->now()),
        ]));
    }

    /** B14 未使用の招待の取り消し（個別の招待は区別できないため、すべて取り消す） */
    public function revoke(Request $request): Response
    {
        return $this->guarded($request, function (BlgAuthContext $c): Response {
            $count = $this->services->invitations->revokePending($c->belongingId(), $this->services->clock->now());
            $this->audit('invitation.revoke', $c->belongingId(), 'success', ['count' => $count]);
            return Response::json(200, ['revokedCount' => $count]);
        });
    }

    private static function mailBody(string $belongingName, string $url): string
    {
        return "{$belongingName} から、TonalSenseTrainer への招待が届いています。\n\n"
            . "次のリンクを開いて、{$belongingName} に所属するかどうかを選んでください（7日間有効です）。\n\n"
            . $url . "\n\n"
            . "所属すると、{$belongingName} は、あなたの家族の利用データ（テスト結果）を見られるようになります。\n"
            . "このメールに心当たりがない場合は、何もせずに破棄してください。\n"
            . "リンクを開いただけでは、所属は完了しません。\n";
    }
}
