import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

// 画面の部品や app.js が、ブラウザ(document・window)の無い Node で読み込んだだけでは落ちないこと。
// src/ 以下のすべての .js と app.js を、ディレクトリから自動で集めて1つずつ import する
// (ファイルを足したときに、ここへ足し忘れない。画面ごとに同じテストを書かない)。
// 画面はDOM(document)を直接書き換えるため、Node環境からのテストには向かない。実際の画面遷移・音声再生・タイマー・
// ボタンの描画は、development-handover.md 12.4 の方針どおり、手動でのブラウザ確認で検証する。
const root = new URL("../", import.meta.url);

function collectModules(dirUrl) {
  return readdirSync(dirUrl, { withFileTypes: true }).flatMap((entry) => {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dirUrl);
    if (entry.isDirectory()) return collectModules(url);
    return entry.name.endsWith(".js") ? [url] : [];
  });
}

test("src/ 以下のすべてのモジュールと app.js は、document が無い環境でも import で例外にならない", async () => {
  const modules = [...collectModules(new URL("src/", root)), new URL("app.js", root)];
  assert.ok(modules.length >= 50, `集めたモジュールが少なすぎる: ${modules.length}`);
  for (const url of modules) {
    await assert.doesNotReject(import(pathToFileURL(url.pathname).href), url.pathname.replace(root.pathname, ""));
  }
});
