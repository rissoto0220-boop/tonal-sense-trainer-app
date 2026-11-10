<?php

declare(strict_types=1);

namespace UecTst\Debug;

use UecTst\Config\AppConfig;
use UecTst\Config\DebugConfig;
use UecTst\Http\Request;
use UecTst\Http\Response;

/**
 * 入口（/）の案内ページ（デバッグ機能 debug.features.indexPage）。動作確認の入口として、
 * 有効なデバッグ機能へのリンクと、API の基準パス（クライアントの basePath に指定する値）を表示する。
 * 鍵・パスワードなど、秘密の値は表示しない。
 */
final class DebugIndexController
{
    public function __construct(private readonly AppConfig $config)
    {
    }

    public function show(Request $request): Response
    {
        $base = $request->basePath;
        $mailViewer = $this->config->debug->isOn(DebugConfig::FEATURE_MAIL_VIEWER);

        // 仮実装の画面（public/app/）。URL Rewrite を使わない環境では basePath が …/index.php で終わるため、取り除く。
        $appBase = self::e(preg_replace('#/index\.php$#', '', $base) . '/app');
        $items = '<li><a href="' . $appBase . '/signup/">新規登録（仮登録）</a>／<a href="' . $appBase . '/login/">ログイン</a>／<a href="' . $appBase . '/">ホーム</a>（仮実装の画面）</li>'
            . '<li>運用担当者・組織: <a href="' . $appBase . '/org/">ログイン</a>（仮実装の画面）</li>';
        if ($mailViewer) {
            $items .= '<li><a href="' . self::e($base . DebugMailLink::PAGE_PATH) . '">メール表示ページ</a>（送ったことにしたメールを表示）</li>';
        }
        $items .= '<li>API の基準パス（家族・ユーザ用）: <code>' . self::e($base . '/api/v1') . '</code></li>';
        $items .= '<li>API の基準パス（運用担当者・組織用）: <code>' . self::e($base . '/api/v1/org') . '</code></li>';

        $features = [];
        foreach (DebugConfig::FEATURES as $name) {
            $features[] = '<li><code>' . self::e($name) . '</code>: ' . ($this->config->debug->isOn($name) ? '有効' : '無効') . '</li>';
        }

        $html = '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
            . '<title>TonalSenseTrainer サーバ（デバッグ）</title>'
            . '<style>body{font:15px/1.7 system-ui,-apple-system,"Hiragino Sans",sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#1d2330;background:#f4f5f7}'
            . 'h1{font-size:20px}code{background:#e6e9ef;padding:1px 6px;border-radius:4px;word-break:break-all}.warn{background:#7a3b00;color:#fff;padding:8px 12px;border-radius:6px}'
            . '@media(prefers-color-scheme:dark){body{background:#14161b;color:#e6e8ee}code{background:#2a2e38}a{color:#8ab4f8}}</style></head><body>'
            . '<h1>TonalSenseTrainer サーバ</h1>'
            . '<p class="warn">デバッグ状態で動作しています。認証なしで使える機能があるため、公開しないでください。</p>'
            . '<h2>リンクと基準パス</h2><ul>' . $items . '</ul>'
            . '<h2>デバッグ機能</h2><ul>' . implode('', $features) . '</ul>'
            . '<h2>設定</h2><ul><li>環境: <code>' . self::e($this->config->environment) . '</code></li>'
            . '<li>メールのリンクの基準 URL: <code>' . self::e($this->config->publicBaseUrl) . '</code></li></ul>'
            . '</body></html>';

        return new Response(200, $html, [
            'Content-Type' => 'text/html; charset=utf-8',
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private static function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
