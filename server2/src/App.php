<?php

declare(strict_types=1);

namespace UecTst;

use UecTst\Api\Routes;
use UecTst\Captcha\CaptchaVerifier;
use UecTst\Captcha\NullCaptchaVerifier;
use UecTst\Captcha\TurnstileVerifier;
use UecTst\Config\AppConfig;
use UecTst\Config\DbConfig;
use UecTst\Db\Connection;
use UecTst\Http\Kernel;
use UecTst\Http\OriginGuard;
use UecTst\Http\Router;
use UecTst\Log\Logger;
use UecTst\Mail\LogMailer;
use UecTst\Mail\Mailer;
use UecTst\Support\SystemClock;

/**
 * アプリケーションの組み立て。ルートの登録は、API を実装した段階ごとに、Api\Routes に追加する。
 */
final class App
{
    /**
     * 設定ファイルの内容で、部品を組み立てる。DB へは、API の処理を始めるときに、初めて接続する
     * （設定の不備や DB の停止でも、存在しないパスの 404 などは返せる）。
     */
    public static function createKernel(AppConfig $config): Kernel
    {
        $logger = new Logger($config->logFile);
        $services = null;
        $provider = static function () use (&$services, $config, $logger): Services {
            return $services ??= new Services(
                $config,
                Connection::create(DbConfig::load()),
                new SystemClock(),
                self::mailer($config),
                self::captcha($config),
                $logger,
            );
        };
        return self::kernel($config, $logger, $provider);
    }

    /**
     * 差し替えた部品（時計・メール・CAPTCHA）で組み立てる。テストで使う。
     */
    public static function createKernelWith(Services $services): Kernel
    {
        return self::kernel($services->config, $services->logger, static fn (): Services => $services);
    }

    /**
     * @param callable(): Services $provider
     */
    private static function kernel(AppConfig $config, Logger $logger, callable $provider): Kernel
    {
        $router = new Router();
        Routes::register($router, $provider);
        return new Kernel($router, new OriginGuard($config->allowedOrigins), $logger);
    }

    private static function mailer(AppConfig $config): Mailer
    {
        return new LogMailer($config->mailLogFile, $config->mailFrom);
    }

    private static function captcha(AppConfig $config): CaptchaVerifier
    {
        return $config->captchaDriver === 'turnstile'
            ? new TurnstileVerifier($config->captchaSecretKey())
            : new NullCaptchaVerifier();
    }
}
