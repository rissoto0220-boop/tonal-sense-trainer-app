import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 絶対音感・相対音感の、ページを閉じる前の確認(2026-11-14 研究者の決定: 練習の開始から結果まで)。
// app.js はブラウザなしでは動かせないので、tests/training/app-integration.test.js と同じく、ソースの形で確かめる。
const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");

function functionBody(name) {
  const start = source.slice(source.indexOf(name));
  return start.slice(0, start.indexOf("\n}\n") + 3);
}

test("共通部品 src/shared/unload-guard.js を使い、確認の付け外しを1か所(holdTestUnloadGuard / releaseTestUnloadGuard)で行う", () => {
  assert.match(source, /import \{ enableUnloadGuard \} from "\.\/src\/shared\/unload-guard\.js";/);
  assert.match(functionBody("function holdTestUnloadGuard()"), /releaseTestGuard\(\);\n\s+releaseTestGuard = enableUnloadGuard\(\);/);
  assert.match(functionBody("function releaseTestUnloadGuard()"), /releaseTestGuard\(\);\n\s+releaseTestGuard = \(\) => \{\};/);
});

test("絶対音感: 「練習を開始」で有効にし、状態(sessionStatus)が確定して保存したら解除する", () => {
  const intro = functionBody("function showPracticeIntro()");
  assert.ok(intro.indexOf("holdTestUnloadGuard();") >= 0 && intro.indexOf("holdTestUnloadGuard();") < intro.indexOf("resumeAudioContext()"));
  assert.match(functionBody("function persistCurrentSession()"), /if \(currentSession\?\.sessionStatus\) \{\n\s+releaseTestUnloadGuard\(\);/);
});

test("相対音感: セッションを始めた時点で有効にし、状態が確定して保存したら解除する", () => {
  const body = functionBody("function startRelativePitchTest()");
  assert.match(body, /if \(relativeSession\.sessionStatus\) \{\n\s+releaseTestUnloadGuard\(\);/);
  assert.ok(body.indexOf("holdTestUnloadGuard();") > body.indexOf("startRelativePitchSession("), "セッションを始めてから有効にする");
  assert.ok(body.indexOf("holdTestUnloadGuard();") < body.indexOf("showPracticeFlow("), "練習より前に有効にする");
});

test("テスト選択・参加者の変更では、確認を残さない", () => {
  assert.match(functionBody("function showTestSelection()"), /releaseTestUnloadGuard\(\);/);
  assert.match(functionBody("function restartApp()"), /releaseTestUnloadGuard\(\);/);
});

// 2026-11-15 研究者の決定(画面構成図の気になる点 #8): 参加者を変えたら、訓練のメニュー選択は最初のタブから。
test("参加者IDの変更(restartApp)で、訓練のメニュー選択のタブの記憶を消す", () => {
  const body = functionBody("function restartApp()");
  assert.match(body, /trainingMenuTabId = null;/);
  assert.match(source, /\nlet trainingMenuTabId = null;\n/);
});
