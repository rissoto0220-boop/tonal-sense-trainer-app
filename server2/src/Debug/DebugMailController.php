<?php

declare(strict_types=1);

namespace UecTst\Debug;

use UecTst\Http\Request;
use UecTst\Http\Response;
use UecTst\Mail\MailLog;

/**
 * メール表示ページ（デバッグ機能 debug.features.mailViewer）。送信したことにしたメールの内容を、ブラウザで見る。
 * ページは、デバッグ状態のときだけ有効で、そうでなければルート自体が登録されない（404）。
 * 認証はない。本登録URLなどが見えるため、production では有効にできない（AppConfig で拒否する）。
 *
 * GET /debug/mails               ページ（HTML）。新しいメールを、数秒おきに自動で取得して表示する
 * GET /debug/mails?format=json   メールの一覧（新しい順、最大100件）。ページが使う
 */
final class DebugMailController
{
    private const LIMIT = 100;

    public function __construct(private readonly MailLog $log)
    {
    }

    public function show(Request $request): Response
    {
        if (($request->query['format'] ?? '') === 'json') {
            return Response::json(200, ['mails' => $this->log->recent(self::LIMIT)]);
        }
        return new Response(200, self::PAGE, [
            'Content-Type' => 'text/html; charset=utf-8',
            // ページ自身のスクリプトと、同じ場所への取得だけを許す。メールの内容は、HTML として解釈しない。
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'",
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private const PAGE = <<<'HTML'
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>メール表示（デバッグ）</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.6 system-ui, -apple-system, "Hiragino Sans", sans-serif; margin: 0; background: #f4f5f7; color: #1d2330; }
  header { position: sticky; top: 0; background: #7a3b00; color: #fff; padding: 8px 16px; display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap; }
  header h1 { font-size: 16px; margin: 0; }
  header span { font-size: 13px; opacity: .9; }
  main { max-width: 760px; margin: 0 auto; padding: 16px; }
  .empty { color: #667; text-align: center; margin-top: 48px; }
  article { background: #fff; border: 1px solid #d5d9e0; border-radius: 8px; margin-bottom: 14px; overflow: hidden; }
  article.highlight { border-color: #e08a00; box-shadow: 0 0 0 3px rgba(224, 138, 0, .35); }
  article.fresh { animation: flash 2s ease-out; }
  @keyframes flash { from { background: #fff3cf; } to { background: #fff; } }
  dl { margin: 0; padding: 10px 14px; background: #eef0f4; display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; font-size: 13px; }
  dt { color: #556; }
  dd { margin: 0; word-break: break-all; }
  dd.subject { font-weight: 600; }
  pre { margin: 0; padding: 12px 14px; white-space: pre-wrap; word-break: break-all; font: 14px/1.7 ui-monospace, Menlo, monospace; }
  pre a { color: #0b57d0; }
  @media (prefers-color-scheme: dark) {
    body { background: #14161b; color: #e6e8ee; }
    article { background: #1d2027; border-color: #343944; }
    article.highlight { border-color: #e08a00; }
    dl { background: #262a33; }
    dt { color: #9aa3b5; }
    pre a { color: #8ab4f8; }
    @keyframes flash { from { background: #4a3b10; } to { background: #1d2027; } }
  }
</style>
</head>
<body>
<header>
  <h1>メール表示（デバッグ）</h1>
  <span id="status">読み込み中…</span>
  <span>送信したことにしたメールを表示します。本番では使えません。</span>
</header>
<main id="list"></main>
<script>
(function () {
  "use strict";
  var listEl = document.getElementById("list");
  var statusEl = document.getElementById("status");
  var highlightId = new URLSearchParams(location.search).get("highlight");
  var knownIds = null; // 最初の取得より前は null（最初の取得の分は「新着」にしない）
  var latestId = null;
  var baseTitle = document.title;

  function linkify(text) {
    var pre = document.createElement("pre");
    var parts = text.split(/(https?:\/\/[^\s]+)/);
    parts.forEach(function (part, i) {
      if (i % 2 === 1) {
        var a = document.createElement("a");
        a.href = part;
        a.textContent = part;
        a.target = "_blank";
        a.rel = "noopener";
        pre.appendChild(a);
      } else if (part !== "") {
        pre.appendChild(document.createTextNode(part));
      }
    });
    return pre;
  }

  function row(dl, label, value, cls) {
    var dt = document.createElement("dt");
    dt.textContent = label;
    var dd = document.createElement("dd");
    dd.textContent = value;
    if (cls) dd.className = cls;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  function card(mail, isFresh) {
    var el = document.createElement("article");
    el.id = "mail-" + mail.id;
    if (mail.id === highlightId) el.classList.add("highlight");
    if (isFresh) el.classList.add("fresh");
    var dl = document.createElement("dl");
    row(dl, "日時", new Date(mail.sentAt).toLocaleString("ja-JP"));
    row(dl, "宛先", mail.to);
    row(dl, "送信元", mail.from);
    row(dl, "件名", mail.subject, "subject");
    el.appendChild(dl);
    el.appendChild(linkify(mail.body));
    return el;
  }

  function render(mails) {
    var firstLoad = knownIds === null;
    var fresh = {};
    var anyFresh = false;
    mails.forEach(function (m) {
      if (!firstLoad && !knownIds[m.id]) { fresh[m.id] = true; anyFresh = true; }
    });
    knownIds = {};
    mails.forEach(function (m) { knownIds[m.id] = true; });

    listEl.textContent = "";
    if (mails.length === 0) {
      var empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "まだ、メールは送信されていません。";
      listEl.appendChild(empty);
    }
    mails.forEach(function (m) { listEl.appendChild(card(m, fresh[m.id])); });

    if (firstLoad && highlightId) {
      var target = document.getElementById("mail-" + highlightId);
      if (target) target.scrollIntoView({ block: "start" });
    } else if (anyFresh) {
      window.scrollTo(0, 0);
      document.title = "● " + baseTitle;
    }
    latestId = mails.length > 0 ? mails[0].id : null;
  }

  function load() {
    fetch(location.pathname + "?format=json", { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (data) {
        var mails = data.mails || [];
        var newest = mails.length > 0 ? mails[0].id : null;
        if (knownIds === null || newest !== latestId) render(mails);
        statusEl.textContent = "自動更新中（" + new Date().toLocaleTimeString("ja-JP") + "）";
      })
      .catch(function () { statusEl.textContent = "取得できません（再試行します）"; });
  }

  window.addEventListener("focus", function () { document.title = baseTitle; });
  load();
  setInterval(load, 3000);
})();
</script>
</body>
</html>
HTML;
}
