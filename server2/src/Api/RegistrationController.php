<?php

declare(strict_types=1);

namespace UecTst\Api;

use PDOException;
use UecTst\Auth\DeviceLabel;
use UecTst\Db\Transaction;
use UecTst\Db\Uuid7;
use UecTst\Family\FamilyView;
use UecTst\Http\ApiException;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Mail\MailException;
use UecTst\Security\RecoveryCode;
use UecTst\Security\Tokens;
use UecTst\Services;
use UecTst\Support\Time;
use UecTst\Validation\Input;
use UecTst\Validation\Params;

/**
 * 登録（ApiSpec_Auth.md 1.）。
 *   #1 仮登録 POST /registrations
 *   #2 本登録URLのトークンの照合 POST /registrations/verify
 *   #3 本登録 POST /registrations/complete
 */
final class RegistrationController
{
    /** 仮登録（本登録URL）の有効期限。 */
    private const PENDING_LIFETIME = '+24 hours';

    private const MAIL_GLOBAL_LIMIT = 1000;  // システム全体 1,000通／1時間
    private const MAIL_IP_LIMIT = 10;        // IP 単位 10通／1時間
    private const MAIL_WINDOW = 3600;
    /** IP 単位 60回／10分（#2・#3・#28・#30 の、共通のカウンター） */
    public const REGISTER_IP_LIMIT = 60;
    public const REGISTER_WINDOW = 600;
    public const REGISTER_KEY = 'register:ip:';

    public function __construct(private readonly Services $services)
    {
    }

    /** #1 仮登録 */
    public function start(Request $request): Response
    {
        $data = $request->json();
        $email = trim(Params::string($data, 'email'));
        $captchaToken = Params::optionalString($data, 'captchaToken');

        // 1. CAPTCHA の検証（主な踏み台対策）
        if (!$this->services->captcha->verify($captchaToken, $request->clientIp)) {
            throw new ApiException(422, 'CAPTCHA_FAILED', 'CAPTCHA の確認に失敗しました。もう一度お試しください。');
        }

        // 2. 回数制限（システム全体・IP 単位）
        $global = $this->services->rateLimiter->hit('mail:send:global', self::MAIL_WINDOW);
        if ($global->count > self::MAIL_GLOBAL_LIMIT) {
            if ($global->count === self::MAIL_GLOBAL_LIMIT + 1) {
                $this->services->logger->warning('仮登録メールの送信数が、システム全体の上限を超えました（運用担当者への通知）', ['limit' => self::MAIL_GLOBAL_LIMIT]);
            }
            throw ApiException::rateLimited($global->retryAfterSeconds);
        }
        $ip = $this->services->rateLimiter->hit('mail:send:ip:' . $request->clientIp, self::MAIL_WINDOW);
        if ($ip->count > self::MAIL_IP_LIMIT) {
            throw ApiException::rateLimited($ip->retryAfterSeconds);
        }

        // 3. メールアドレスの形式
        if (Input::emailError($email) !== null) {
            throw ApiException::validationFailed('メールアドレスの形式が正しくありません。', [['field' => 'email', 'code' => 'INVALID_FORMAT']]);
        }

        // 4. トークンを作り、ハッシュと有効期限だけを保存する（メールアドレスは保存しない）
        $now = $this->services->clock->now();
        $token = Tokens::generate();
        $tokenHash = Tokens::hash($token);
        $this->services->pending->insert(Uuid7::generateBinary(), $tokenHash, $now->modify(self::PENDING_LIFETIME));

        // 5. 本登録URL（トークンは、フラグメントに含める。サーバのアクセスログに残らない）をメールで送る
        $url = $this->services->config->publicBaseUrl . '/register#token=' . $token;
        try {
            $this->services->mailer->send($email, '【TonalSenseTrainer】本登録のご案内', self::registrationMailBody($url));
        } catch (MailException $e) {
            // 6. 送信に失敗した場合は、サポートのため、メールアドレスと失敗理由を記録し（成功時は記録しない）、仮登録を取り消す。
            $this->services->logger->error('仮登録メールの送信に失敗しました', ['email' => $email, 'reason' => $e->getMessage()]);
            $this->services->pending->deleteByHash($tokenHash);
            throw new ApiException(503, 'MAIL_SEND_FAILED', 'メールを送信できませんでした。しばらくしてから、もう一度お試しください。');
        }

        return Response::json(202, ['sender' => $this->services->mailer->sender()]);
    }

    /** #2 本登録URLのトークンの照合（DB は変更しない。リンクスキャナーが開いても、トークンは消費されない） */
    public function verify(Request $request): Response
    {
        $token = Params::string($request->json(), 'token');
        $this->checkRegisterRateLimit($request);

        $expiry = Tokens::isWellFormed($token)
            ? $this->services->pending->findExpiry(Tokens::hash($token), $this->services->clock->now())
            : null;
        if ($expiry === null) {
            throw ApiException::gone('REGISTRATION_TOKEN_INVALID', 'リンクが無効、または期限切れです。もう一度、登録をやり直してください。');
        }
        return Response::json(200, ['expiresAt' => Time::toIso($expiry)]);
    }

    /** #3 本登録（家族・ユーザの作成と、この端末でのログイン） */
    public function complete(Request $request): Response
    {
        $data = $request->json();
        $this->checkRegisterRateLimit($request);

        $hasToken = array_key_exists('token', $data);
        $hasInvitation = array_key_exists('invitationToken', $data);
        if ($hasToken === $hasInvitation) {
            throw ApiException::badRequest('「token」または「invitationToken」の、どちらか一方を指定してください。');
        }

        // 入力値の検証は、トークンを消費する前に行う（入力をやり直せば、同じトークンで再試行できる）。
        $names = $this->validatedUserNames($data);

        // 招待経由（招待メールが届いたことがメールアドレスの確認になるため、仮登録は不要）か、仮登録経由か。
        $tokenKey = $hasInvitation ? 'invitationToken' : 'token';
        $token = Params::string($data, $tokenKey);
        $tokenHash = Tokens::isWellFormed($token) ? Tokens::hash($token) : null;
        if ($tokenHash === null) {
            throw $hasInvitation ? self::invitationInvalid() : self::registrationTokenInvalid();
        }

        $services = $this->services;
        $deviceLabel = DeviceLabel::fromUserAgent($request->header('user-agent'));

        /** @var array{string, array<string, mixed>, string} $result */
        $result = Transaction::run($services->pdo, function () use ($services, $tokenHash, $hasInvitation, $names, $deviceLabel): array {
            $now = $services->clock->now();
            // 同じトークンで同時に実行されても、片方だけが 1 行を削除できる（二重登録にならない）。
            // 以降の処理に失敗すれば、ロールバックにより、トークン（招待）も元に戻る。
            $organizationId = null;
            if ($hasInvitation) {
                $organizationId = $services->invitations->consume($tokenHash, $now) ?? throw self::invitationInvalid();
            } elseif (!$services->pending->consume($tokenHash, $now)) {
                throw self::registrationTokenInvalid();
            }

            $familyId = Uuid7::generateBinary();
            $code = $this->insertFamilyWithNewCode($familyId, $now, $organizationId);

            $firstUserId = null;
            foreach ($names as $index => $name) {
                $userId = Uuid7::generateBinary();
                $firstUserId ??= $userId;
                // 1件目のユーザが、スーパーユーザになる。
                $services->users->insert($userId, $familyId, $name, $index + 1, $index + 1, $index === 0, $now);
            }

            [$sessionToken, $session] = $services->sessions->create($familyId, $firstUserId, $deviceLabel);
            $family = $services->families->find($familyId);
            return [$sessionToken, $services->familyView->family($family, $session->selectedUserId), $code];
        });

        [$sessionToken, $family, $code] = $result;
        return Response::json(201, ['recoveryCode' => RecoveryCode::format($code), 'family' => $family], [], [$services->cookies->set($sessionToken)]);
    }

    /**
     * @param array<string, mixed> $data
     * @return list<string> 正規化済みのユーザ名
     */
    private function validatedUserNames(array $data): array
    {
        $users = Params::list($data, 'users');
        $details = [];
        if (count($users) < 1 || count($users) > 4) {
            throw ApiException::validationFailed('ユーザは、1〜4名で登録してください。', [['field' => 'users', 'code' => count($users) < 1 ? 'REQUIRED' : 'TOO_MANY']]);
        }

        $names = [];
        foreach ($users as $i => $user) {
            $raw = is_array($user) ? ($user['name'] ?? null) : null;
            if (!is_string($raw)) {
                $details[] = ['field' => "users[{$i}].name", 'code' => 'REQUIRED'];
                continue;
            }
            $name = Input::normalizeUserName($raw);
            $error = Input::userNameError($name);
            if ($error !== null) {
                $details[] = ['field' => "users[{$i}].name", 'code' => $error];
                continue;
            }
            if (in_array($name, $names, true)) {
                $details[] = ['field' => "users[{$i}].name", 'code' => 'DUPLICATE'];
                continue;
            }
            $names[] = $name;
        }
        if ($details !== []) {
            throw ApiException::validationFailed('ユーザ名を確認してください。', $details);
        }
        return $names;
    }

    /**
     * 新しい復旧コードを作り、家族を登録する。ハッシュが重複した場合（ごくまれな偶然）は、作り直す。
     *
     * @return string 正規化済みの復旧コード（25文字）
     */
    private function insertFamilyWithNewCode(string $familyId, \DateTimeImmutable $now, ?string $organizationId): string
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $code = RecoveryCode::generate();
            $hasher = $this->services->recoveryHasher;
            if ($this->services->families->insert($familyId, $hasher->hashWithCurrentKey($code), $hasher->currentKeyId(), $now, $organizationId)) {
                return $code;
            }
        }
        throw new PDOException('復旧コードの重複が続いたため、家族を作成できませんでした');
    }

    private function checkRegisterRateLimit(Request $request): void
    {
        $hit = $this->services->rateLimiter->hit(self::REGISTER_KEY . $request->clientIp, self::REGISTER_WINDOW);
        if ($hit->count > self::REGISTER_IP_LIMIT) {
            throw ApiException::rateLimited($hit->retryAfterSeconds);
        }
    }

    private static function registrationTokenInvalid(): ApiException
    {
        return ApiException::gone('REGISTRATION_TOKEN_INVALID', 'リンクが無効、または期限切れです。もう一度、登録をやり直してください。');
    }

    private static function invitationInvalid(): ApiException
    {
        return ApiException::gone('INVITATION_INVALID', '招待のリンクが無効、または期限切れです。');
    }

    private static function registrationMailBody(string $url): string
    {
        return "TonalSenseTrainer へのご登録ありがとうございます。\n\n"
            . "次のリンクを開いて、登録を続けてください（24時間有効です）。\n\n"
            . $url . "\n\n"
            . "このメールに心当たりがない場合は、何もせずに破棄してください。\n"
            . "リンクを開いただけでは、登録は完了しません。\n";
    }
}
