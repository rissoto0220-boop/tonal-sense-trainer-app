import { test } from "node:test";
import assert from "node:assert/strict";
import { appSource, readSource, functionBody, assertInOrder, compact } from "./helpers/app-source.js";

// 音声の起動に失敗したときの配線(2026-11-15 エラーの見せ方の統一 フェーズ5-B)。
// 「中断として確定して保存してから画面を出す」「記録を作る前に失敗の画面を出す」の順序だけを、ソースの形で確かめる。
const practice = readSource("src/relative-pitch/practice-screen.js");
const mainTest = readSource("src/relative-pitch/main-test-screen.js");

test("起動の失敗は、resumeAudioContext() の then の失敗側で扱う(成功後の処理の例外を、起動失敗と取り違えない)", () => {
  for (const [name, source] of [["app.js", appSource], ["practice-screen.js", practice], ["main-test-screen.js", mainTest]]) {
    assert.match(compact(source), /resumeAudioContext\(\)\.then\(/, `${name}: then(成功, 失敗) の形`);
    assert.equal(/resumeAudioContext\(\)[\s\S]{0,80}\.catch\(/.test(source), false, `${name}: .catch で包まない`);
  }
});

test("絶対音感: 起動に失敗したら、セッションを中断で確定して保存してから、audio-start のエラー画面を出す", () => {
  const body = functionBody(appSource, "function failAudioStart()");
  assertInOrder(assert, body, ['finalizeSession(currentSession, "interrupted")', "persistCurrentSession()", "showErrorScreen("]);
  assert.match(compact(body), /kind: "audio-start"/);
  assert.match(compact(body), /impact: "session-interrupted"/);
});

test("相対音感(練習・本番): 起動に失敗したら、セッションを中断で確定して保存してから、audio-start のエラー画面を出す", () => {
  for (const [name, source] of [["practice-screen.js", practice], ["main-test-screen.js", mainTest]]) {
    const afterResume = source.slice(source.indexOf("resumeAudioContext()"));
    assertInOrder(assert, afterResume, ['finalizeSession(session, "interrupted")', "persistSession()", "showRelativeAudioError("], name);
    assert.match(compact(afterResume), /kind: "audio-start", impact: "session-interrupted"/, name);
  }
});

test("訓練: 準備中の画面にして起動を待ち、失敗したら、記録係を作る前・ページを閉じる前の確認を付ける前に、audio-start のエラー画面を出す", () => {
  const body = functionBody(appSource, "async function startTraining(menu)");
  assertInOrder(assert, body, ["音声の準備", "await resumeAudioContext()", 'kind: "audio-start"', "return;", "createTrainingRecorder(", "enableUnloadGuard()"]);
  assert.match(compact(body), /impact: "not-recorded"/);
});
