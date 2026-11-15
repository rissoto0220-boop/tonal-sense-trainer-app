import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// app.js はDOMを直接使うためNodeでは動かせない。機能的音感の接続が、旗(?functional=dev)つきの
// 形のままであること(=旗がなければ「準備中」で選べないこと)を、ソースの形で確認する。
const source = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const entry = source.slice(source.indexOf('id: "functional-pitch"'), source.indexOf('id: "functional-pitch"') + 500);

test("app.js: 機能的音感の選択可否は、旗の解釈(resolveFunctionalPitchOptions)の結果だけで決まる", () => {
  assert.match(source, /const functionalPitchOptions = resolveFunctionalPitchOptions\(window\.location\);/);
  assert.match(entry, /available: functionalPitchOptions\.enabled,/);
  assert.equal(/available: true/.test(entry.split("},")[0]), false); // 常に有効になっていない
});

// 2026-11-15: テスト選択は名前だけにした。旗がないときは、説明文ではなく「準備中」の印(test-selection-screen.js)で選べなくする。
test("app.js: 旗がないときは選べない(available が旗に従う)。説明文は持たない(説明は test-intro-text.js)", () => {
  assert.match(entry, /available: functionalPitchOptions\.enabled,/);
  assert.equal(entry.includes("description:"), false);
});

// 2026-10-27: 絶対音感・相対音感の「API送信を入れる前」と同じく、参加者IDごとにブラウザへ保存し、
// 履歴・CSVを出せるようにした。送信には、引き続き触れない。
test("app.js: 機能的音感の起動は、参加者IDつきでブラウザに保存するが、送信の仕組みには触れない", () => {
  const start = source.slice(source.indexOf("function startFunctionalPitchTest()"));
  const body = start.slice(0, start.indexOf("\n}\n") + 3);
  assert.match(body, /runFunctionalPitchSession\(/);
  assert.match(body, /createFunctionalPitchRecorder\(participantId, \{ storage: localStorage \}\)/);
  for (const name of ["onSessionStarted", "onTrialStarted", "onTrialConfirmed"]) {
    assert.match(body, new RegExp(`${name}: recorder\\.${name},`), name);
  }
  assert.match(body, /recorder\.onKeyMeasured\(result\);/);
  assert.match(body, /onShowHistory: \(backToKeySelect\) => showFunctionalPitchHistoryScreen\(/);
  for (const word of ["syncSessionsToServer", "syncPendingSessions", "fetch", "upload"]) {
    assert.equal(body.includes(word), false, word);
  }
});
