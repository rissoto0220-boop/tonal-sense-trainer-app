<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Http\Router;
use UecTst\Services;

/**
 * ルートの登録。API の番号は、ApiSpec_Auth.md 0.7 の一覧（#）と、ApiSpec_Organization.md 0.7 の一覧（O）に対応する。
 *
 * Services は、「取得する関数」で受け取る。実際にルートが呼ばれたときに初めて作られる（DB への接続が、
 * ルートの登録時ではなく、API の処理を始めるときになる）。
 */
final class Routes
{
    /**
     * @param callable(): Services $services
     */
    public static function register(Router $router, callable $services): void
    {
        // 登録
        self::post($router, '/api/v1/registrations', $services, fn (Services $s, Request $r) => (new RegistrationController($s))->start($r));        // #1
        self::post($router, '/api/v1/registrations/verify', $services, fn (Services $s, Request $r) => (new RegistrationController($s))->verify($r));  // #2
        self::post($router, '/api/v1/registrations/complete', $services, fn (Services $s, Request $r) => (new RegistrationController($s))->complete($r)); // #3

        // ログイン・端末
        self::post($router, '/api/v1/sessions', $services, fn (Services $s, Request $r) => (new SessionController($s))->login($r));                    // #4
        self::get($router, '/api/v1/sessions/current', $services, fn (Services $s, Request $r) => (new SessionController($s))->current($r));           // #5
        self::delete($router, '/api/v1/sessions/current', $services, fn (Services $s, Request $r) => (new SessionController($s))->logout($r));         // #6
        self::put($router, '/api/v1/sessions/current/selected-user', $services, fn (Services $s, Request $r) => (new SessionController($s))->selectUser($r)); // #7
        self::get($router, '/api/v1/sessions', $services, fn (Services $s, Request $r) => (new SessionController($s))->list($r));                      // #8
        self::delete($router, '/api/v1/sessions/{sessionId}', $services, fn (Services $s, Request $r, array $p) => (new SessionController($s))->revoke($r, $p)); // #9

        // ユーザ
        self::get($router, '/api/v1/users', $services, fn (Services $s, Request $r) => (new UserController($s))->list($r));                            // #10
        self::post($router, '/api/v1/users', $services, fn (Services $s, Request $r) => (new UserController($s))->add($r));                            // #11
        self::put($router, '/api/v1/users/order', $services, fn (Services $s, Request $r) => (new UserController($s))->reorder($r));                   // #13
        self::patch($router, '/api/v1/users/{userId}', $services, fn (Services $s, Request $r, array $p) => (new UserController($s))->rename($r, $p));  // #12
        self::delete($router, '/api/v1/users/{userId}', $services, fn (Services $s, Request $r, array $p) => (new UserController($s))->delete($r, $p)); // #14

        // スーパーユーザ・パスワード・パスキー
        self::get($router, '/api/v1/superuser', $services, fn (Services $s, Request $r) => (new SuperuserController($s))->show($r));                                // #17
        self::put($router, '/api/v1/superuser', $services, fn (Services $s, Request $r) => (new SuperuserController($s))->transfer($r));                           // #20
        self::put($router, '/api/v1/superuser/password', $services, fn (Services $s, Request $r) => (new SuperuserController($s))->setPassword($r));               // #18
        self::delete($router, '/api/v1/superuser/password', $services, fn (Services $s, Request $r) => (new SuperuserController($s))->deletePassword($r));         // #19
        self::post($router, '/api/v1/superuser/password/reset', $services, fn (Services $s, Request $r) => (new SuperuserController($s))->resetPassword($r));       // #22
        self::get($router, '/api/v1/superuser/passkeys', $services, fn (Services $s, Request $r) => (new SuperuserController($s))->passkeys($r));                  // #24
        self::post($router, '/api/v1/superuser/passkeys/registration-options', $services, fn (Services $s, Request $r) => (new SuperuserController($s))->registrationOptions($r)); // #25
        self::post($router, '/api/v1/superuser/passkeys', $services, fn (Services $s, Request $r) => (new SuperuserController($s))->register($r));                 // #26
        self::delete($router, '/api/v1/superuser/passkeys/{passkeyId}', $services, fn (Services $s, Request $r, array $p) => (new SuperuserController($s))->deletePasskey($r, $p)); // #27

        // 組織への所属（家族側）
        self::post($router, '/api/v1/invitations/verify', $services, fn (Services $s, Request $r) => (new MembershipController($s))->verifyInvitation($r)); // #28
        self::get($router, '/api/v1/organization-membership', $services, fn (Services $s, Request $r) => (new MembershipController($s))->show($r));         // #29
        self::post($router, '/api/v1/organization-membership', $services, fn (Services $s, Request $r) => (new MembershipController($s))->join($r));        // #30
        self::delete($router, '/api/v1/organization-membership', $services, fn (Services $s, Request $r) => (new MembershipController($s))->leave($r));     // #31

        // 研究者・組織（ApiSpec_Organization.md）
        self::post($router, '/api/v1/org/sessions', $services, fn (Services $s, Request $r) => (new OrgSessionController($s))->login($r));                          // O1
        self::post($router, '/api/v1/org/sessions/passkey-options', $services, fn (Services $s, Request $r) => (new OrgSessionController($s))->passkeyOptions($r)); // O2
        self::post($router, '/api/v1/org/sessions/passkey', $services, fn (Services $s, Request $r) => (new OrgSessionController($s))->passkey($r));               // O3
        self::get($router, '/api/v1/org/sessions/current', $services, fn (Services $s, Request $r) => (new OrgSessionController($s))->current($r));                 // O4
        self::delete($router, '/api/v1/org/sessions/current', $services, fn (Services $s, Request $r) => (new OrgSessionController($s))->logout($r));              // O5
        self::put($router, '/api/v1/org/password', $services, fn (Services $s, Request $r) => (new OrgAccountController($s))->changePassword($r));                  // O6
        self::post($router, '/api/v1/org/elevation', $services, fn (Services $s, Request $r) => (new OrgAccountController($s))->elevate($r));                       // O7
        self::get($router, '/api/v1/org/passkeys', $services, fn (Services $s, Request $r) => (new OrgPasskeyController($s))->list($r));                            // O8
        self::post($router, '/api/v1/org/passkeys/registration-options', $services, fn (Services $s, Request $r) => (new OrgPasskeyController($s))->registrationOptions($r)); // O9
        self::post($router, '/api/v1/org/passkeys', $services, fn (Services $s, Request $r) => (new OrgPasskeyController($s))->register($r));                      // O10
        self::delete($router, '/api/v1/org/passkeys/{passkeyId}', $services, fn (Services $s, Request $r, array $p) => (new OrgPasskeyController($s))->delete($r, $p)); // O11
        self::post($router, '/api/v1/org/invitations', $services, fn (Services $s, Request $r) => (new OrgInvitationController($s))->send($r));                     // O12
        self::get($router, '/api/v1/org/invitations', $services, fn (Services $s, Request $r) => (new OrgInvitationController($s))->count($r));                     // O13
        self::delete($router, '/api/v1/org/invitations', $services, fn (Services $s, Request $r) => (new OrgInvitationController($s))->revoke($r));                 // O14
        self::get($router, '/api/v1/org/members', $services, fn (Services $s, Request $r) => (new OrgMemberController($s))->list($r));                              // O15
        self::delete($router, '/api/v1/org/members/{familyId}', $services, fn (Services $s, Request $r, array $p) => (new OrgMemberController($s))->remove($r, $p));  // O16
        self::get($router, '/api/v1/org/organizations', $services, fn (Services $s, Request $r) => (new OrgAdminController($s))->list($r));                         // O17
        self::post($router, '/api/v1/org/organizations', $services, fn (Services $s, Request $r) => (new OrgAdminController($s))->create($r));                      // O18
        self::patch($router, '/api/v1/org/organizations/{organizationId}', $services, fn (Services $s, Request $r, array $p) => (new OrgAdminController($s))->rename($r, $p)); // O19
        self::post($router, '/api/v1/org/organizations/{organizationId}/password-reset', $services, fn (Services $s, Request $r, array $p) => (new OrgAdminController($s))->resetPassword($r, $p)); // O20
        self::delete($router, '/api/v1/org/organizations/{organizationId}', $services, fn (Services $s, Request $r, array $p) => (new OrgAdminController($s))->delete($r, $p)); // O21

        // 確認・復旧コード・退会
        self::post($router, '/api/v1/elevation', $services, fn (Services $s, Request $r) => (new AccountController($s))->elevate($r));                 // #15
        self::post($router, '/api/v1/elevation/passkey-options', $services, fn (Services $s, Request $r) => (new AccountController($s))->passkeyOptions($r));  // #23
        self::post($router, '/api/v1/recovery-code', $services, fn (Services $s, Request $r) => (new AccountController($s))->reissueRecoveryCode($r)); // #16
        self::delete($router, '/api/v1/family', $services, fn (Services $s, Request $r) => (new AccountController($s))->withdraw($r));                 // #21
    }

    /**
     * @param callable(): Services $services
     * @param callable(Services, Request, array<string, string>): Response $handler
     */
    private static function add(Router $router, string $method, string $path, callable $services, callable $handler): void
    {
        $router->add($method, $path, static fn (Request $request, array $params): Response => $handler($services(), $request, $params));
    }

    private static function get(Router $router, string $path, callable $services, callable $handler): void
    {
        self::add($router, 'GET', $path, $services, $handler);
    }

    private static function post(Router $router, string $path, callable $services, callable $handler): void
    {
        self::add($router, 'POST', $path, $services, $handler);
    }

    private static function put(Router $router, string $path, callable $services, callable $handler): void
    {
        self::add($router, 'PUT', $path, $services, $handler);
    }

    private static function patch(Router $router, string $path, callable $services, callable $handler): void
    {
        self::add($router, 'PATCH', $path, $services, $handler);
    }

    private static function delete(Router $router, string $path, callable $services, callable $handler): void
    {
        self::add($router, 'DELETE', $path, $services, $handler);
    }
}
