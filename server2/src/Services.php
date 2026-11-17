<?php

declare(strict_types=1);

namespace UecTst;

use PDO;
use UecTst\Auth\Authenticator;
use UecTst\Auth\RecoveryAttempts;
use UecTst\Auth\RecoveryCodeVerifier;
use UecTst\Auth\SuperuserPasswordService;
use UecTst\Auth\CookieFactory;
use UecTst\Auth\SessionService;
use UecTst\Captcha\CaptchaVerifier;
use UecTst\Config\AppConfig;
use UecTst\Family\FamilyRepository;
use UecTst\Family\FamilyView;
use UecTst\Family\PendingRegistrationRepository;
use UecTst\Family\UserRepository;
use UecTst\Log\Logger;
use UecTst\Mail\Mailer;
use UecTst\Belonging\InvitationRepository;
use UecTst\Belonging\BelongingRepository;
use UecTst\Belonging\BlgAuthenticator;
use UecTst\Belonging\BlgPasswordService;
use UecTst\Belonging\BlgSessionService;
use UecTst\Passkey\ChallengeStore;
use UecTst\Passkey\PasskeyRepository;
use UecTst\Passkey\WebAuthnService;
use UecTst\Security\PasswordHasher;
use UecTst\RateLimit\RateLimiter;
use UecTst\Security\RecoveryCodeHasher;
use UecTst\Support\Clock;
use UecTst\TestData\ExportWriter;
use UecTst\TestData\SessionMetrics;
use UecTst\TestData\TestSessionRepository;

/**
 * アプリケーションの部品の組み立て。テストでは、時計・メール・CAPTCHA を、差し替えて組み立てる。
 */
final class Services
{
    public readonly RateLimiter $rateLimiter;
    public readonly RecoveryCodeHasher $recoveryHasher;
    public readonly RecoveryAttempts $recoveryAttempts;
    public readonly CookieFactory $cookies;
    public readonly SessionService $sessions;
    public readonly Authenticator $authenticator;
    public readonly FamilyRepository $families;
    public readonly UserRepository $users;
    public readonly PendingRegistrationRepository $pending;
    public readonly FamilyView $familyView;
    public readonly PasswordHasher $passwordHasher;
    public readonly SuperuserPasswordService $superuserPassword;
    public readonly RecoveryCodeVerifier $recoveryVerifier;
    public readonly PasskeyRepository $passkeys;
    public readonly ChallengeStore $challenges;
    public readonly WebAuthnService $webauthn;
    public readonly BelongingRepository $belongings;
    public readonly InvitationRepository $invitations;
    public readonly CookieFactory $blgCookies;
    public readonly BlgSessionService $blgSessions;
    public readonly BlgAuthenticator $blgAuthenticator;
    public readonly BlgPasswordService $blgPasswords;
    public readonly PasskeyRepository $blgPasskeys;
    public readonly TestSessionRepository $testSessions;
    public readonly SessionMetrics $sessionMetrics;
    public readonly ExportWriter $exportWriter;

    public function __construct(
        public readonly AppConfig $config,
        public readonly PDO $pdo,
        public readonly Clock $clock,
        public readonly Mailer $mailer,
        public readonly CaptchaVerifier $captcha,
        public readonly Logger $logger,
    ) {
        $this->rateLimiter = new RateLimiter($pdo, $clock, $config->rateLimitKey());
        $this->recoveryHasher = new RecoveryCodeHasher($config->recoveryCodeKeys(), $config->currentRecoveryCodeKeyId);
        $this->recoveryAttempts = new RecoveryAttempts($this->rateLimiter, $logger);
        $this->cookies = new CookieFactory($config->cookieSecure, $config->cookieUseHostPrefix);
        $this->sessions = new SessionService($pdo, $clock);
        $this->authenticator = new Authenticator($this->sessions, $this->cookies);
        $this->families = new FamilyRepository($pdo);
        $this->users = new UserRepository($pdo);
        $this->pending = new PendingRegistrationRepository($pdo);
        $this->familyView = new FamilyView($this->families, $this->users);
        $this->passwordHasher = new PasswordHasher();
        $this->superuserPassword = new SuperuserPasswordService($pdo, $clock, $this->families, $this->passwordHasher);
        $this->recoveryVerifier = new RecoveryCodeVerifier($this->recoveryAttempts, $this->recoveryHasher);
        $this->passkeys = new PasskeyRepository($pdo);
        $this->challenges = new ChallengeStore($pdo, $clock);
        $this->webauthn = new WebAuthnService($config);
        $this->belongings = new BelongingRepository($pdo);
        $this->invitations = new InvitationRepository($pdo);
        // 所属の Cookie は、家族の Cookie とは別の名前で、有効期限を持たない（ブラウザを閉じると消える）。
        $this->blgCookies = new CookieFactory($config->cookieSecure, $config->cookieUseHostPrefix, 'blg-sid', null);
        $this->blgSessions = new BlgSessionService($pdo, $clock);
        $this->blgAuthenticator = new BlgAuthenticator($this->blgSessions, $this->belongings, $this->blgCookies);
        $this->blgPasswords = new BlgPasswordService($pdo, $clock, $this->belongings, $this->passwordHasher);
        $this->blgPasskeys = new PasskeyRepository($pdo, 'belonging_passkeys', 'belonging_id');
        $this->testSessions = new TestSessionRepository($pdo);
        $this->sessionMetrics = new SessionMetrics($pdo);
        $this->exportWriter = new ExportWriter($this->testSessions, $this->sessionMetrics);
    }
}
