<?php

declare(strict_types=1);

namespace UecTst\Api;

use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Http\Router;
use UecTst\Services;

/**
 * ルートの登録。API の番号は、ApiSpec_Auth.md 0.7 の一覧に対応する。
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
