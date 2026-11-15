import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 音声の起動に失敗したときの扱い(2026-11-15 エラーの見せ方の統一 フェーズ5-B)。
// app.js と、相対音感の画面は、ブラウザなしでは動かせないので、ソースの形で確かめる
// (tests/app-unload-guard.test.js と同じ方法)。
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const app = read("app.js");
const practice = read("src/relative-pitch/practice-screen.js");
const mainTest = read("src/relative-pitch/main-test-screen.js");

function functionBody(source, name) {
  const start = source.slice(source.indexOf(name));
  return start.slice(0, start.indexOf("\n}\n") + 3);
}

test("起動は、resumeAudioContext() だけを包む then(成功, 失敗) の形(成功後の処理の例外を、起動失敗と取り違えない)", () => {
  assert.match(app, /resumeAudioContext\(\)\.then\(\(\) => \{\n\s+runPractice\(\);\n\s+\}, failAudioStart\);/);
  assert.match(practice, /resumeAudioContext\(\)\.then\(\(\) => \{\n\s+runQuestion\(0\);\n\s+\}, \(\) => \{/);
  assert.match(mainTest, /resumeAudioContext\(\)\.then\(\(\) => \{\n\s+runQuestion\(0\);\n\s+\}, \(\) => \{/);
  for (const [name, source] of [["app.js", app], ["practice-screen.js", practice], ["main-test-screen.js", mainTest]]) {
    assert.equal(/resumeAudioContext\(\)[\s\S]{0,80}\.catch\(/.test(source), false, `${name}: .catch で包まない`);
  }
});

test("絶対音感: 起動に失敗したら、セッションを interrupted で確定して保存(確認も外れる)してから、audio-start のエラー画面", () => {
  const body = functionBody(app, "function failAudioStart()");
  assert.ok(body.indexOf('finalizeSession(currentSession, "interrupted");') >= 0);
  assert.ok(body.indexOf('finalizeSession(currentSession, "interrupted");') < body.indexOf("persistCurrentSession();"));
  assert.ok(body.indexOf("persistCurrentSession();") < body.indexOf("showErrorScreen({"));
  assert.match(body, /kind: "audio-start",/);
  assert.match(body, /impact: "session-interrupted",/);
  assert.match(body, /backTo: "テスト選択",/);
  assert.match(body, /onBack: showTestSelection,/);
});

test("相対音感(練習・本番): 起動に失敗したら、セッションを interrupted で確定して保存してから、audio-start のエラー画面(影響 session-interrupted)", () => {
  for (const [name, source] of [["practice-screen.js", practice], ["main-test-screen.js", mainTest]]) {
    const at = source.indexOf('sessionStore.finalizeSession(session, "interrupted");', source.indexOf("resumeAudioContext()"));
    assert.ok(at > 0, `${name}: 起動の失敗側で、中断として確定する`);
    const tail = source.slice(at, at + 300);
    assert.ok(tail.indexOf("persistSession();") < tail.indexOf("showRelativeAudioError("), name);
    assert.match(tail, /showRelativeAudioError\(\{ screenEl, kind: "audio-start", impact: "session-interrupted", onBack \}\);/, name);
  }
});

test("訓練: 準備中の画面にしてから起動を待ち、失敗したら、記録を作る前に audio-start のエラー画面(影響 not-recorded、戻り先 メニュー選択)", () => {
  const body = functionBody(app, "async function startTraining(menu)");
  assert.ok(body.indexOf("音声の準備") >= 0 && body.indexOf("音声の準備") < body.indexOf("await resumeAudioContext();"), "待つ前に、準備中の画面");
  assert.match(body, /try \{\n\s+await resumeAudioContext\(\);\n\s+\} catch \{/);
  assert.match(body, /kind: "audio-start",\n\s+impact: "not-recorded",\n\s+backTo: "メニュー選択",\n\s+onBack: showTrainingMenus,/);
  assert.ok(body.indexOf("return;") < body.indexOf("createTrainingRecorder("), "失敗したら、記録係を作らない");
  assert.ok(body.indexOf("return;") < body.indexOf("enableUnloadGuard()"), "失敗したら、ページを閉じる前の確認を付けない");
});

test("相対音感の音声エラー画面は、kind・impact を渡せる(既定は audio-load・recorded-interrupted)", () => {
  const source = read("src/relative-pitch/audio-error-screen.js");
  assert.match(source, /kind = "audio-load", impact = "recorded-interrupted", onBack/);
});
