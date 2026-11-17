import { test } from "node:test";
import assert from "node:assert/strict";
import { appSource, functionBody, assertInOrder, compact } from "./helpers/app-source.js";

// ページを閉じる前の確認(2026-11-14 研究者の決定: 練習の開始から結果まで)の配線。
// 付け忘れ・外し忘れは、参加者の操作や研究データに響くので、ソースの形で確かめる(書き方の細部は問わない)。

test("絶対音感・相対音感: 練習の開始(セッションの開始)で確認を付け、状態が確定して保存したら外す", () => {
  // 絶対音感: 「練習を開始」で、セッションを作り(2026-11-15から。以前は説明画面に入った時点)、音声の起動より前に確認を付ける。状態が確定して保存したら外す
  assertInOrder(assert, functionBody(appSource, "function showPracticeIntro("), ["startSession(", "holdTestUnloadGuard(", "resumeAudioContext("], "絶対音感");
  assertInOrder(assert, functionBody(appSource, "function persistCurrentSession()"), ["currentSession?.sessionStatus", "releaseTestUnloadGuard("], "絶対音感の解除");
  // 相対音感: 練習を始めるとき(beginSession)に、セッションを作ってから付ける。練習の画面を出す前に定義する。状態が確定して保存したら外す
  const relative = functionBody(appSource, "function startRelativePitchTest(");
  assertInOrder(assert, relative, ["startRelativePitchSession(", "holdTestUnloadGuard(", "showPracticeFlow("], "相対音感");
  assertInOrder(assert, relative, ["relativeSession.sessionStatus", "releaseTestUnloadGuard("], "相対音感の解除");
});

test("確認を残さない場面: テスト選択・参加者の変更、想定外のエラーの帯の「最初からやり直す」(確認を一括解除してから再読み込み)", () => {
  assert.match(functionBody(appSource, "function showTestSelection()"), /releaseTestUnloadGuard\(/);
  assert.match(functionBody(appSource, "function restartApp()"), /releaseTestUnloadGuard\(/);
  const mount = functionBody(appSource, "function mount()");
  assertInOrder(assert, mount, ["installErrorNotice(", "releaseAllUnloadGuards(", "location.reload("], "エラーの帯");
  assert.equal((compact(appSource).match(/installErrorNotice\(/g) ?? []).length, 1, "エラーの帯の設置は1か所だけ");
});
