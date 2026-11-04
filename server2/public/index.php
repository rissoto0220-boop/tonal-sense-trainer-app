<?php

declare(strict_types=1);

// API は、PHP の警告・エラーを、画面（レスポンス）に出さない（内部の情報が漏れないようにするため）。
// 原因は、サーバのエラーログにだけ残る。
ini_set('display_errors', '0');

use UecTst\App;
use UecTst\Config\AppConfig;
use UecTst\Http\Request;
use UecTst\Http\Response;

// 公開ディレクトリ（public/）の外にある、アプリ本体を読み込む。
require dirname(__DIR__) . '/vendor/autoload.php';

try {
    $config = AppConfig::load();
    $kernel = App::createKernel($config);
    $request = Request::fromGlobals(
        $_SERVER,
        array_map('strval', $_COOKIE),
        array_map('strval', array_filter($_GET, 'is_string')),
        (string) file_get_contents('php://input'),
        $config->trustedProxyHeader,
    );
    $kernel->handle($request)->send();
} catch (Throwable $e) {
    // 設定の不備などで起動できない場合。利用者には内部の情報を返さず、原因はサーバのエラーログにだけ残す。
    error_log(sprintf('[uec-tst] boot failure: %s in %s:%d', $e::class, basename($e->getFile()), $e->getLine()));
    Response::json(500, ['error' => ['code' => 'INTERNAL_ERROR', 'message' => 'サーバでエラーが発生しました。しばらくしてから、もう一度お試しください。']])->send();
}
