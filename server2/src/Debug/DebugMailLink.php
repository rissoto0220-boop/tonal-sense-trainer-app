<?php

declare(strict_types=1);

namespace UecTst\Debug;

use UecTst\Config\DebugConfig;
use UecTst\Http\Response;
use UecTst\Mail\RecordsSentMail;
use UecTst\Services;

/**
 * デバッグ状態（メール表示ページが有効）のとき、メールを送ったリクエストの JSON レスポンスに、
 * メール表示ページへのリンクを加える: { ..., "debug": { "mailViewUrl": "/debug/mails?highlight=<メールID>" } }
 * クライアントは、これを見て、別タブで表示ページを開く。デバッグ状態でなければ、何も加えない。
 */
final class DebugMailLink
{
    public const PAGE_PATH = '/debug/mails';

    /**
     * @param callable(): Response $handle リクエストを処理する関数
     */
    public static function around(Services $services, callable $handle): Response
    {
        $mailer = $services->mailer;
        $active = $services->config->debug->isOn(DebugConfig::FEATURE_MAIL_VIEWER) && $mailer instanceof RecordsSentMail;
        if (!$active) {
            return $handle();
        }
        $mailer->takeLastMailId(); // 前のリクエストの分は、忘れる。
        $response = $handle();
        $id = $mailer->takeLastMailId();
        return $id === null ? $response : self::attach($response, $id);
    }

    private static function attach(Response $response, string $mailId): Response
    {
        $isJson = str_starts_with($response->headers['Content-Type'] ?? '', 'application/json');
        if ($response->status < 200 || $response->status >= 300 || $response->isStreamed() || !$isJson) {
            return $response;
        }
        $data = json_decode($response->body, true);
        if (!is_array($data) || array_is_list($data)) {
            return $response;
        }
        $data['debug'] = ['mailViewUrl' => self::PAGE_PATH . '?highlight=' . rawurlencode($mailId)];
        return $response->withBody(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    }
}
