import { test } from "node:test";
import assert from "node:assert/strict";
import { appSource, functionBody, compact } from "./helpers/app-source.js";

// テスト選択 → 説明画面 →「履歴・CSVを見る」(2026-11-14 研究者の決定、画面構成図の気になる点 #3。
// 2026-11-15 に、入口をテスト選択から説明画面へ移した)。
// 核心は「履歴を見るだけで、セッションを始めない(中断の確定・確認・測定や訓練の開始をしない)」こと。

// availableTests の、そのテストの項目(id から次の項目の手前まで)。
function testEntry(id) {
  const body = functionBody(appSource, "function availableTests()");
  const start = body.indexOf(`id: "${id}"`);
  assert.ok(start >= 0, `${id} の項目がある`);
  const next = body.indexOf("\n    {\n", start);
  return body.slice(start, next < 0 ? body.length : next);
}

const LOADERS = {
  "absolute-pitch": "loadAbsolutePitchParticipantData",
  "relative-pitch": "loadRelativePitchParticipantData",
  "functional-pitch": "loadFunctionalPitchParticipantData",
  training: "loadTrainingParticipantData",
};

test("4つのテストすべてに履歴の入口があり、保存データをその場で読む。履歴画面からはテスト選択へ戻る(絶対音感は結果画面の履歴も同じ画面)", () => {
  for (const [id, loader] of Object.entries(LOADERS)) {
    const entry = compact(testEntry(id));
    assert.match(entry, /onShowHistory:/, id);
    assert.ok(entry.includes(`${loader}(participantId, localStorage)`), `${id}: 保存データを読む`);
    if (id !== "absolute-pitch") assert.match(entry, /onBack: showTestSelection/, `${id}: 戻り先`);
  }
});

test("履歴の入口は、セッションを始めない(中断の確定・ページを閉じる前の確認・測定や訓練の開始をしない)", () => {
  for (const id of Object.keys(LOADERS)) {
    const entry = testEntry(id);
    const history = entry.slice(entry.indexOf("onShowHistory"));
    for (const word of ["startSession(", "startRelativePitchSession(", "runFunctionalPitchSession(", "runTrainingSession(", "holdTestUnloadGuard(", "enableUnloadGuard("]) {
      assert.equal(history.includes(word), false, `${id}: ${word}`);
    }
  }
});

test("絶対音感の履歴は、保存データを引数で受け取る。結果画面からは、受けたテストの保存データで開く", () => {
  assert.match(appSource, /function showHistory\(data = participantData\) \{/);
  assert.match(compact(appSource), /getElementById\("history"\)\.addEventListener\("click", \(\) => showHistory\(\)\)/);
  assert.equal(/participantData\.sessions/.test(functionBody(appSource, "function showHistory(data = participantData)")), false);
});

test("テスト選択は説明画面につながる。「始める」は各テストの onStart、「履歴・CSVを見る」は onShowHistory、戻り先はテスト選択", () => {
  assert.match(compact(functionBody(appSource, "function showTestSelection()")), /onSelect: showTestIntro/);
  const intro = compact(functionBody(appSource, "function showTestIntro(test)"));
  for (const part of ["showTestIntroScreen(", "onStart: test.onStart", "onShowHistory: test.onShowHistory", "onBack: showTestSelection"]) {
    assert.ok(intro.includes(part), part);
  }
});
