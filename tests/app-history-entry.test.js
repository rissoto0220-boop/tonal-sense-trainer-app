import { test } from "node:test";
import assert from "node:assert/strict";
import { appSource, readSource, functionBody, assertInOrder, compact } from "./helpers/app-source.js";

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

// 2026-11-15 研究者の決定: 履歴・CSVの戻り先は、開いた説明画面(ひとつ前の画面)。
test("4つのテストすべてに履歴の入口があり、保存データをその場で読む。履歴画面からは、開いた説明画面へ「戻る」", () => {
  for (const [id, loader] of Object.entries(LOADERS)) {
    const entry = compact(testEntry(id));
    assert.match(entry, /onShowHistory: \(ctx\) =>/, id);
    assert.ok(entry.includes(`${loader}(participantId, localStorage)`), `${id}: 保存データを読む`);
    assert.match(entry, /onBack: ctx\.backToIntro/, `${id}: 戻り先は説明画面`);
    assert.match(entry, /backLabel: BACK_LABEL/, `${id}: 戻るボタンの文字`);
  }
  assert.match(compact(appSource), /const BACK_LABEL = "戻る"/);
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
  assert.match(appSource, /function showHistory\(data = participantData, \{ onBack = showTestSelection, backLabel = "テスト選択へ戻る" \} = \{\}\) \{/);
  assert.match(compact(appSource), /getElementById\("history"\)\.addEventListener\("click", \(\) => showHistory\(\)\)/);
  assert.equal(/participantData\.sessions/.test(functionBody(appSource, "function showHistory(data = participantData")), false);
});

test("テスト選択は説明画面につながる。「始める」は各テストの onStart、「履歴・CSVを見る」は onShowHistory(どちらも、説明画面へ戻る関数を渡す)、戻り先はテスト選択", () => {
  assert.match(compact(functionBody(appSource, "function showTestSelection()")), /onSelect: showTestIntro/);
  const intro = compact(functionBody(appSource, "function showTestIntro(test)"));
  for (const part of ["showTestIntroScreen(", "backToIntro: () => showTestIntro(test)", "onStart: () => test.onStart(ctx)", "onShowHistory: () => test.onShowHistory(ctx)", "onBack: showTestSelection"]) {
    assert.ok(intro.includes(part), part);
  }
});

// 2026-11-15 研究者の決定: テスト開始前の画面に「戻る」を付け、セッションは練習を始めるまで作らない
// (説明を読んで「戻る」だけなら、空の「中断」の記録が残らない)。
test("絶対音感: セッションは「練習を開始」を押したときに作る。説明画面に入っただけ・「戻る」では作らない", () => {
  assert.equal(compact(functionBody(appSource, "function startAbsolutePitchTest(")).includes("startSession("), false);
  const intro = functionBody(appSource, "function showPracticeIntro(");
  const beforeStart = intro.slice(0, intro.indexOf('getElementById("practice-start")'));
  assert.equal(beforeStart.includes("startSession("), false, "「練習を開始」より前(画面を出す・戻る)では作らない");
  assert.match(compact(intro), /getElementById\("practice-back"\)\.addEventListener\("click", onBack\)/);
  assertInOrder(assert, intro, ['getElementById("practice-start")', "startSession(", "syncSessionsToServer("]);
});

test("相対音感: セッションは練習を始めるとき(beginSession)に作る。種類の選択・練習について・練習の説明の「戻る」では作らない", () => {
  const body = functionBody(appSource, "function startRelativePitchTest(");
  assert.equal((body.match(/startRelativePitchSession\(/g) ?? []).length, 1, "作るのは1か所だけ");
  assertInOrder(assert, body, ["const beginSession = () =>", "startRelativePitchSession(", "holdTestUnloadGuard(", "showPracticeFlow("]);
  assert.match(compact(body), /beginSession,/, "showPracticeFlow に beginSession を渡す");
  assert.match(compact(body), /onBack: ctx\.backToIntro/, "種類の選択の戻り先は説明画面");
  // 練習の画面側: beginSession() は、「練習を開始」「練習をスキップして本番へ」のクリックの中だけで呼ぶ
  const practice = compact(readSource("src/relative-pitch/practice-screen.js"));
  assert.equal((practice.match(/session = beginSession\(\)/g) ?? []).length, 2);
  assert.equal((practice.match(/addEventListener\("click", \(\) => \{ session = beginSession\(\)/g) ?? []).length, 2, "どちらもクリックの中");
});
