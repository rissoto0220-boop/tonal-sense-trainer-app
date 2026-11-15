import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// app.js のエラー画面(2026-11-15 研究者の決定: エラーの見せ方を、エラーの種類で統一する)。
// app.js はブラウザなしでは動かせないので、tests/app-unload-guard.test.js と同じく、ソースの形で確かめる。
const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");

function functionBody(name) {
  const start = source.slice(source.indexOf(name));
  return start.slice(0, start.indexOf("\n}\n") + 3);
}

test("絶対音感の再生エラー: 共通のエラー画面に、種類 audio-load・影響 interrupted-uncounted・戻り先 テスト選択、詳細にファイル名を渡す", () => {
  const body = functionBody("function showPlaybackError(note)");
  assert.match(source, /import \{ showErrorScreen \} from "\.\/src\/shared\/error-screen\.js";/);
  assert.match(body, /showErrorScreen\(\{/);
  assert.match(body, /kind: "audio-load",/);
  assert.match(body, /impact: "interrupted-uncounted",/);
  assert.match(body, /backTo: "テスト選択",/);
  assert.match(body, /details: \[`音声ファイル: \$\{note\.filename\}`\],/);
  assert.match(body, /onBack: showTestSelection,/);
});

test("絶対音感の再生エラー: 画面を出す前に、セッションを中断として確定して保存している(「データへの影響」の文のとおり)", () => {
  const catchAt = source.indexOf("再生失敗時はこの問題を誤回答・タイムアウトとして記録せず");
  assert.ok(catchAt > 0);
  const after = source.slice(catchAt, catchAt + 400);
  assert.ok(after.indexOf('finalizeSession(currentSession, "interrupted");') < after.indexOf("showPlaybackError(note);"));
  assert.ok(after.indexOf("persistCurrentSession();") < after.indexOf("showPlaybackError(note);"));
});

test("app.js に、エラー画面の文言を直接書かない(エラーの種類の表 src/shared/error-kinds.js に集める)", () => {
  for (const text of ["音声を再生できませんでした", "音声ファイル(", "テスト選択からやり直してください"]) {
    assert.equal(source.includes(text), false, text);
  }
});
