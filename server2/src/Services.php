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
use UecTst\Organization\InvitationRepository;
use UecTst\Organization\OrganizationRepository;
use UecTst\Organization\OrgAuthenticator;
use UecTst\Organization\OrgPasswordService;
use UecTst\Organization\OrgSessionService;
use UecTst\Passkey\ChallengeStore;
use UecTst\Passkey\PasskeyRepository;
use UecTst\Passkey\WebAuthnService;
use UecTst\Security\PasswordHasher;
use UecTst\RateLimit\RateLimiter;
use UecTst\Security\RecoveryCodeHasher;
use UecTst\Support\Clock;

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
    public readonly OrganizationRepository $organizations;
    public readonly InvitationRepository $invitations;
    public readonly CookieFactory $orgCookies;
    public readonly OrgSessionService $orgSessions;
    public readonly OrgAuthenticator $orgAuthenticator;
    public readonly OrgPasswordService $orgPasswords;
    public readonly PasskeyRepository $orgPasskeys;

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
        $this->organizations = new OrganizationRepository($pdo);
        $this->invitations = new InvitationRepository($pdo);
        // 組織の Cookie は、家族の Cookie とは別の名前で、有効期限を持たない（ブラウザを閉じると消える）。
        $this->orgCookies = new CookieFactory($config->cookieSecure, $config->cookieUseHostPrefix, 'org-sid', null);
        $this->orgSessions = new OrgSessionService($pdo, $clock);
        $this->orgAuthenticator = new OrgAuthenticator($this->orgSessions, $this->organizations, $this->orgCookies);
        $this->orgPasswords = new OrgPasswordService($pdo, $clock, $this->organizations, $this->passwordHasher);
        $this->orgPasskeys = new PasskeyRepository($pdo, 'organization_passkeys', 'organization_id');
    }
}
