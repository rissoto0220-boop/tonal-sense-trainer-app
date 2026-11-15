import { test } from "node:test";
import assert from "node:assert/strict";
import { appSource, functionBody, assertInOrder, compact } from "../helpers/app-source.js";

// app.js はDOMを直接使うためNodeでは動かせない。機能的音感・音感訓練の接続が、旗つきの形のままであること
// (=旗がなければ「準備中」で選べないこと)と、保存はするが送信には触れないことを、ソースの形で確認する。
const entryOf = (id) => {
  const start = appSource.indexOf(`id: "${id}"`);
  assert.ok(start >= 0, `テスト選択の一覧に ${id} がある`);
  return compact(appSource.slice(start, appSource.indexOf("},", start)));
};
const SEND_WORDS = ["syncSessionsToServer", "syncPendingSessions", "fetch", "upload"];

// 2026-11-15: テスト選択は名前だけにした。旗がないときは、説明文ではなく「準備中」の印で選べなくする。
test("機能的音感・音感訓練: 選べるかどうかは、旗の解釈の結果だけで決まる(常に有効ではなく、説明文も持たない)", () => {
  for (const [id, options] of [["functional-pitch", "functionalPitchOptions"], ["training", "trainingOptions"]]) {
    const entry = entryOf(id);
    assert.ok(entry.includes(`available: ${options}.enabled,`), id);
    assert.equal(entry.includes("available: true"), false, id);
    assert.equal(entry.includes("description:"), false, id);
  }
  assert.match(compact(appSource), /const trainingOptions = resolveTrainingOptions\(window\.location\)/);
  assert.match(compact(appSource), /const functionalPitchOptions = resolveFunctionalPitchOptions\(window\.location\)/);
});

// 2026-10-28: 参加者IDごとにブラウザへ保存し、履歴・CSVを出せるようにした(T7)。送信には触れない(サーバーでの種別が未決定)。
test("音感訓練の起動は、音声の起動に成功してから、参加者IDつきでブラウザに保存する記録係を作る。送信の仕組みには触れない", () => {
  const body = functionBody(appSource, "async function startTraining(menu)");
  assertInOrder(assert, body, ["await resumeAudioContext()", "createTrainingRecorder(participantId", "runTrainingSession("]);
  for (const name of ["onSessionStarted", "onTrialConfirmed", "onTrialUpdated"]) assert.match(compact(body), new RegExp(`${name}: recorder\\.${name}`), name);
  for (const name of ["onFinished", "onInterrupted", "onAudioError"]) assert.match(compact(body), new RegExp(`recorder\\.${name}\\(`), name);
  for (const name of ["function showTrainingMenus(", "async function startTraining(menu)"]) {
    for (const word of SEND_WORDS) assert.equal(functionBody(appSource, name).includes(word), false, `${name}: ${word}`);
  }
});

test("訓練の最中だけ、ページを閉じる前の確認を付け、完了・中断・音声エラー・メニューへ戻るのどれでも外す", () => {
  const body = functionBody(appSource, "async function startTraining(menu)");
  assert.match(compact(body), /const releaseUnloadGuard = enableUnloadGuard\(\)/);
  assert.ok((compact(body).match(/releaseUnloadGuard\(\);/g) ?? []).length >= 4);
});

test("拡張サンプルは ?training=dev&samples=on のときだけメニューに並べ、結果は保存しない", () => {
  assert.match(compact(functionBody(appSource, "function showTrainingMenus(")), /menus: samples \? \[\.\.\.TRAINING_MENUS, \.\.\.SAMPLE_MENUS\] : TRAINING_MENUS/);
  assert.match(compact(functionBody(appSource, "async function startTraining(menu)")), /menu\.sample \? NO_OP_TRAINING_RECORDER : createTrainingRecorder\(/);
});
