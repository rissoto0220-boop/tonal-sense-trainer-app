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

test("app.js: 音感訓練の起動は、参加者IDや保存・送信の仕組みに触れない", () => {
  for (const name of ["function showTrainingMenus()", "async function startTraining(menu)"]) {
    const body = functionBody(name);
    assert.ok(body.length > 10, name);
    for (const word of ["participantId", "participantData", "persist", "syncSessionsToServer", "syncPendingSessions", "localStorage", "fetch"]) {
      assert.equal(body.includes(word), false, `${name}: ${word}`);
    }
  }
  assert.match(functionBody("async function startTraining(menu)"), /await resumeAudioContext\(\);\n\s+runTrainingSession\(/);
});
