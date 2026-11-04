<?php

declare(strict_types=1);

namespace UecTst;

use UecTst\Config\AppConfig;
use UecTst\Http\Kernel;
use UecTst\Http\OriginGuard;
use UecTst\Http\Router;
use UecTst\Log\Logger;

/**
 * アプリケーションの組み立て。ルートの登録は、API を実装した段階ごとに、ここへ追加する。
 */
final class App
{
    public static function createKernel(AppConfig $config): Kernel
    {
        $router = new Router();
        // 段階1以降で、各 API のルートを登録する（例: $router->add('POST', '/api/v1/sessions', ...)）。
        return new Kernel($router, new OriginGuard($config->allowedOrigins), new Logger($config->logFile));
    }
}
