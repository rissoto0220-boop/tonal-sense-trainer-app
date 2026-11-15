import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// テスト選択の各テストの「履歴・CSVを見る」(2026-11-14 研究者の決定、画面構成図の気になる点 #3)。
// app.js はブラウザなしでは動かせないので、ソースの形で確かめる(tests/training/app-integration.test.js と同じ方法)。
const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");

function functionBody(name) {
  const start = source.slice(source.indexOf(name));
  return start.slice(0, start.indexOf("\n}\n") + 3);
}

// availableTests の、そのテストの項目(id から次の項目の手前まで)。
function testEntry(id) {
  const body = functionBody("function availableTests()");
  const start = body.indexOf(`id: "${id}"`);
  const next = body.indexOf("\n    {\n", start);
  return body.slice(start, next < 0 ? body.length : next);
}

const ENTRIES = {
  "absolute-pitch": /onShowHistory: \(\) => showHistory\(loadAbsolutePitchParticipantData\(participantId, localStorage\)\),/,
  "relative-pitch": /onShowHistory: \(\) => showRelativePitchHistoryScreen\(\{[^}]*participantData: loadRelativePitchParticipantData\(participantId, localStorage\),\s*onBack: showTestSelection,/,
  "functional-pitch": /onShowHistory: \(\) => showFunctionalPitchHistoryScreen\(\{[^}]*participantData: loadFunctionalPitchParticipantData\(participantId, localStorage\),\s*onBack: showTestSelection,/,
  training: /onShowHistory: \(\) => showTrainingHistoryScreen\(\{[^}]*participantData: loadTrainingParticipantData\(participantId, localStorage\),\s*onBack: showTestSelection,/,
};

test("4つのテストすべてに、テスト選択から開く履歴の入口があり、保存データをその場で読んでテスト選択へ戻る", () => {
  for (const [id, pattern] of Object.entries(ENTRIES)) assert.match(testEntry(id), pattern, id);
});

test("履歴の入口は、セッションを始めない(中断の確定・ページを閉じる前の確認・測定や訓練の開始をしない)", () => {
  for (const id of Object.keys(ENTRIES)) {
    const entry = testEntry(id);
    const history = entry.slice(entry.indexOf("onShowHistory"));
    for (const word of ["startSession(", "startRelativePitchSession(", "runFunctionalPitchSession(", "runTrainingSession(", "holdTestUnloadGuard(", "enableUnloadGuard("]) {
      assert.equal(history.includes(word), false, `${id}: ${word}`);
    }
  }
});

test("絶対音感の履歴は、保存データを引数で受け取る。結果画面からは、受けたテストの保存データで開く", () => {
  assert.match(source, /function showHistory\(data = participantData\) \{/);
  assert.match(source, /document\.getElementById\("history"\)\.addEventListener\("click", \(\) => showHistory\(\)\);/);
  assert.equal(/participantData\.sessions/.test(functionBody("function showHistory(data = participantData)")), false);
});

// 2026-11-15 研究者の決定: テスト選択は名前だけ。名前を押すと説明画面を出し、「始める」「履歴・CSVを見る」はそこから呼ぶ。
test("テスト選択は説明画面につながる。「始める」は各テストの onStart、「履歴・CSVを見る」は onShowHistory、戻り先はテスト選択", () => {
  assert.match(functionBody("function showTestSelection()"), /onSelect: showTestIntro,/);
  const intro = functionBody("function showTestIntro(test)");
  assert.match(intro, /showTestIntroScreen\(\{/);
  assert.match(intro, /lines: TEST_INTRO_TEXT\[test\.id\] \?\? \[\],/);
  assert.match(intro, /onStart: test\.onStart,/);
  assert.match(intro, /onShowHistory: test\.onShowHistory,/);
  assert.match(intro, /onBack: showTestSelection,/);
});
