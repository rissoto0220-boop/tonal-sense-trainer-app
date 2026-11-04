<?php

declare(strict_types=1);

namespace UecTst\Http;

use Throwable;
use UecTst\Log\Logger;

/**
 * リクエストを処理する入口。CSRF 対策 → ルーティング → ハンドラの実行を行い、
 * 例外を、ApiSpec_Auth.md 0.5 のエラーレスポンスに変換する。
 */
final class Kernel
{
    public function __construct(
        private readonly Router $router,
        private readonly OriginGuard $originGuard,
        private readonly Logger $logger,
    ) {
    }

    public function handle(Request $request): Response
    {
        try {
            $this->originGuard->check($request);
            return $this->router->dispatch($request);
        } catch (ApiException $e) {
            return self::errorResponse($e);
        } catch (Throwable $e) {
            // 利用者には内部の情報を返さない。原因は、ログにだけ残す（値は含めず、種類と場所のみ）。
            $this->logger->error('unhandled exception', [
                'type' => $e::class,
                'file' => basename($e->getFile()),
                'line' => $e->getLine(),
                'path' => $request->path,
            ]);
            return self::errorResponse(ApiException::internal());
        }
    }

    private static function errorResponse(ApiException $e): Response
    {
        $error = ['code' => $e->errorCode, 'message' => $e->getMessage()];
        if ($e->details !== []) {
            $error['details'] = $e->details;
        }
        return Response::json($e->status, ['error' => $error], $e->headers, $e->setCookies);
    }
}
