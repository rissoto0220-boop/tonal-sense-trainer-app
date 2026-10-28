import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// app.js はDOMを直接使うためNodeでは動かせない。音感訓練の接続が、旗(?training=dev)つきの
// 形のままであること(=旗がなければ「準備中」で選べないこと)を、ソースの形で確認する
// (tests/functional-pitch/app-integration.test.js と同じ方法)。
const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const entryStart = source.indexOf('id: "training"');
const entry = source.slice(entryStart, source.indexOf("},", entryStart));

function functionBody(name) {
  const start = source.slice(source.indexOf(name));
  return start.slice(0, start.indexOf("\n}\n") + 3);
}

test("app.js: 音感訓練の選択可否は、旗の解釈(resolveTrainingOptions)の結果だけで決まる", () => {
  assert.ok(entryStart >= 0, "テスト選択の一覧に音感訓練がある");
  assert.match(source, /const trainingOptions = resolveTrainingOptions\(window\.location\);/);
  assert.match(entry, /available: trainingOptions\.enabled,/);
  assert.equal(/available: true/.test(entry), false);
});

test("app.js: 旗がないときの説明文は「現在準備中です。」", () => {
  assert.match(entry, /trainingOptions\.enabled \? "[^"]+" : "現在準備中です。"/);
});

// 2026-10-28: 機能的音感と同じく、参加者IDごとにブラウザへ保存し、履歴・CSVを出せるようにした(T7)。
// 送信には、引き続き触れない(サーバーでの種別が未決定)。
test("app.js: 音感訓練の起動は、参加者IDつきでブラウザに保存するが、送信の仕組みには触れない", () => {
  const body = functionBody("async function startTraining(menu)");
  assert.match(body, /await resumeAudioContext\(\);\n\s+const recorder = createTrainingRecorder\(participantId, \{ storage: localStorage \}\);/);
  assert.match(body, /runTrainingSession\(/);
  for (const name of ["onSessionStarted", "onTrialConfirmed", "onTrialUpdated"]) {
    assert.match(body, new RegExp(`${name}: recorder\\.${name},`), name);
  }
  for (const name of ["onFinished", "onInterrupted", "onAudioError"]) {
    assert.match(body, new RegExp(`recorder\\.${name}\\(`), name);
  }
  for (const name of ["function showTrainingMenus()", "async function startTraining(menu)"]) {
    for (const word of ["syncSessionsToServer", "syncPendingSessions", "fetch", "upload"]) {
      assert.equal(functionBody(name).includes(word), false, `${name}: ${word}`);
    }
  }
});

test("app.js: メニュー選択の「履歴・CSVを見る」で、訓練の履歴画面を出す", () => {
  const body = functionBody("function showTrainingMenus()");
  assert.match(body, /onShowHistory: \(\) => showTrainingHistoryScreen\(/);
  assert.match(body, /participantData: loadTrainingParticipantData\(participantId, localStorage\),/);
});

test("app.js: 訓練の最中だけ、ページを閉じる前の確認を有効にする", () => {
  const body = functionBody("async function startTraining(menu)");
  assert.match(body, /const releaseUnloadGuard = enableUnloadGuard\(\);/);
  assert.equal((body.match(/releaseUnloadGuard\(\);/g) ?? []).length, 4, "完了・中断・音声エラー・メニューへ戻るで解除する");
});
