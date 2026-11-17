<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Config\AppConfig;
use UecTst\Config\DebugConfig;
use UecTst\Debug\DebugIndexController;
use UecTst\Debug\DebugMailController;
use UecTst\Debug\DebugMailLink;
use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Http\Router;
use UecTst\Mail\MailLog;
use UecTst\Services;

/**
 * ルートの登録。API の番号は、ApiSpec_Auth.md 0.7 の一覧（#）と、ApiSpec_Belonging.md 0.7 の一覧（O）に対応する。
 *
 * Services は、「取得する関数」で受け取る。実際にルートが呼ばれたときに初めて作られる（DB への接続が、
 * ルートの登録時ではなく、API の処理を始めるときになる）。
 */
final class Routes
{
    /**
     * @param callable(): Services $services
     * @param AppConfig|null $config デバッグ用のルート（debug.features で有効にした機能）を登録するために使う
     */
    public static function register(Router $router, callable $services, ?AppConfig $config = null): void
    {
        if ($config !== null && $config->debug->isOn(DebugConfig::FEATURE_INDEX_PAGE)) {
            // 入口（/）の案内ページ。デバッグ状態でなければ、ルート自体がなく、404 になる。
            $index = new DebugIndexController($config);
            $router->add('GET', '/', static fn (Request $r, array $p): Response => $index->show($r));
        }
        if ($config !== null && $config->debug->isOn(DebugConfig::FEATURE_MAIL_VIEWER)) {
            // メール表示ページ。DB を使わない（Services を作らない）。デバッグ状態でなければ、ルート自体がなく、404 になる。
            $mailViewer = new DebugMailController(new MailLog($config->mailLogFile));
            $router->add('GET', DebugMailLink::PAGE_PATH, static fn (Request $r, array $p): Response => $mailViewer->show($r));
        }

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

        // 所属（家族側）
        self::post($router, '/api/v1/invitations/verify', $services, fn (Services $s, Request $r) => (new MembershipController($s))->verifyInvitation($r)); // #28
        self::get($router, '/api/v1/belonging', $services, fn (Services $s, Request $r) => (new MembershipController($s))->show($r));         // #29
        self::post($router, '/api/v1/belonging', $services, fn (Services $s, Request $r) => (new MembershipController($s))->join($r));        // #30
        self::delete($router, '/api/v1/belonging', $services, fn (Services $s, Request $r) => (new MembershipController($s))->leave($r));     // #31

        // 運用担当者・所属（ApiSpec_Belonging.md）
        self::post($router, '/api/v1/blg/sessions', $services, fn (Services $s, Request $r) => (new BlgSessionController($s))->login($r));                          // B1
        self::post($router, '/api/v1/blg/sessions/passkey-options', $services, fn (Services $s, Request $r) => (new BlgSessionController($s))->passkeyOptions($r)); // B2
        self::post($router, '/api/v1/blg/sessions/passkey', $services, fn (Services $s, Request $r) => (new BlgSessionController($s))->passkey($r));               // B3
        self::get($router, '/api/v1/blg/sessions/current', $services, fn (Services $s, Request $r) => (new BlgSessionController($s))->current($r));                 // B4
        self::delete($router, '/api/v1/blg/sessions/current', $services, fn (Services $s, Request $r) => (new BlgSessionController($s))->logout($r));              // B5
        self::put($router, '/api/v1/blg/password', $services, fn (Services $s, Request $r) => (new BlgAccountController($s))->changePassword($r));                  // B6
        self::post($router, '/api/v1/blg/elevation', $services, fn (Services $s, Request $r) => (new BlgAccountController($s))->elevate($r));                       // B7
        self::get($router, '/api/v1/blg/passkeys', $services, fn (Services $s, Request $r) => (new BlgPasskeyController($s))->list($r));                            // B8
        self::post($router, '/api/v1/blg/passkeys/registration-options', $services, fn (Services $s, Request $r) => (new BlgPasskeyController($s))->registrationOptions($r)); // B9
        self::post($router, '/api/v1/blg/passkeys', $services, fn (Services $s, Request $r) => (new BlgPasskeyController($s))->register($r));                      // B10
        self::delete($router, '/api/v1/blg/passkeys/{passkeyId}', $services, fn (Services $s, Request $r, array $p) => (new BlgPasskeyController($s))->delete($r, $p)); // B11
        self::post($router, '/api/v1/blg/invitations', $services, fn (Services $s, Request $r) => (new BlgInvitationController($s))->send($r));                     // B12
        self::get($router, '/api/v1/blg/invitations', $services, fn (Services $s, Request $r) => (new BlgInvitationController($s))->count($r));                     // B13
        self::delete($router, '/api/v1/blg/invitations', $services, fn (Services $s, Request $r) => (new BlgInvitationController($s))->revoke($r));                 // B14
        self::get($router, '/api/v1/blg/members', $services, fn (Services $s, Request $r) => (new BlgMemberController($s))->list($r));                              // B15
        self::delete($router, '/api/v1/blg/members/{familyId}', $services, fn (Services $s, Request $r, array $p) => (new BlgMemberController($s))->remove($r, $p));  // B16
        self::get($router, '/api/v1/blg/belongings', $services, fn (Services $s, Request $r) => (new BlgAdminController($s))->list($r));                         // B17
        self::post($router, '/api/v1/blg/belongings', $services, fn (Services $s, Request $r) => (new BlgAdminController($s))->create($r));                      // B18
        self::patch($router, '/api/v1/blg/belongings/{belongingId}', $services, fn (Services $s, Request $r, array $p) => (new BlgAdminController($s))->rename($r, $p)); // B19
        self::post($router, '/api/v1/blg/belongings/{belongingId}/password-reset', $services, fn (Services $s, Request $r, array $p) => (new BlgAdminController($s))->resetPassword($r, $p)); // B20
        self::delete($router, '/api/v1/blg/belongings/{belongingId}', $services, fn (Services $s, Request $r, array $p) => (new BlgAdminController($s))->delete($r, $p)); // B21
        self::get($router, '/api/v1/blg/families', $services, fn (Services $s, Request $r) => (new BlgFamilyController($s))->list($r));                              // B27
        self::delete($router, '/api/v1/blg/families/{familyId}/belonging', $services, fn (Services $s, Request $r, array $p) => (new BlgFamilyController($s))->release($r, $p)); // B28
        self::delete($router, '/api/v1/blg/families/{familyId}', $services, fn (Services $s, Request $r, array $p) => (new BlgFamilyController($s))->delete($r, $p));  // B29

        // 利用データ（ApiSpec_TestData.md）
        self::post($router, '/api/v1/users/{userId}/test-sessions', $services, fn (Services $s, Request $r, array $p) => (new TestDataController($s))->submit($r, $p));            // #32
        self::get($router, '/api/v1/users/{userId}/test-sessions', $services, fn (Services $s, Request $r, array $p) => (new TestDataController($s))->list($r, $p));             // #33
        self::get($router, '/api/v1/users/{userId}/test-sessions/{sessionId}', $services, fn (Services $s, Request $r, array $p) => (new TestDataController($s))->show($r, $p));  // #34
        self::get($router, '/api/v1/users/{userId}/test-exports', $services, fn (Services $s, Request $r, array $p) => (new TestDataController($s))->export($r, $p));            // #35
        self::get($router, '/api/v1/blg/users', $services, fn (Services $s, Request $r) => (new BlgTestDataController($s))->users($r));                                          // B22
        self::get($router, '/api/v1/blg/users/{userId}/test-sessions', $services, fn (Services $s, Request $r, array $p) => (new BlgTestDataController($s))->sessions($r, $p));   // B23
        self::get($router, '/api/v1/blg/users/{userId}/test-sessions/{sessionId}', $services, fn (Services $s, Request $r, array $p) => (new BlgTestDataController($s))->session($r, $p)); // B24
        self::get($router, '/api/v1/blg/test-exports', $services, fn (Services $s, Request $r) => (new BlgTestDataController($s))->export($r));                                 // B25
        self::delete($router, '/api/v1/blg/test-sessions/{sessionId}', $services, fn (Services $s, Request $r, array $p) => (new BlgTestDataController($s))->delete($r, $p));   // B26

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
        $router->add($method, $path, static function (Request $request, array $params) use ($services, $handler): Response {
            $s = $services();
            // デバッグ状態でメールを送った場合のみ、レスポンスにメール表示ページへのリンクを加える。
            return DebugMailLink::around($s, $request->basePath, static fn (): Response => $handler($s, $request, $params));
        });
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
