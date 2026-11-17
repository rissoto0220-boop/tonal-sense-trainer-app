import { test } from "node:test";
import assert from "node:assert/strict";
import { appSource, functionBody, assertInOrder, compact } from "./helpers/app-source.js";

// 絶対音感の再生エラー(2026-11-15 研究者の決定: エラーの見せ方を、エラーの種類で統一する)。
// 画面の「データへの影響」の文のとおり、画面を出す前に、セッションを中断として確定して保存していること。
test("絶対音感の再生エラー: 中断で確定して保存してから、共通のエラー画面(種類 audio-load・影響 interrupted-uncounted)を出す", () => {
  const failure = appSource.slice(appSource.indexOf("再生失敗時はこの問題を誤回答・タイムアウトとして記録せず"));
  assert.ok(failure.length < appSource.length, "再生失敗の処理が見つかる");
  assertInOrder(assert, failure.slice(0, 600), ['finalizeSession(currentSession, "interrupted")', "persistCurrentSession()", "showPlaybackError(note)"]);
  const screen = compact(functionBody(appSource, "function showPlaybackError(note)"));
  assert.match(screen, /showErrorScreen\(/);
  assert.match(screen, /kind: "audio-load"/);
  assert.match(screen, /impact: "interrupted-uncounted"/);
});
