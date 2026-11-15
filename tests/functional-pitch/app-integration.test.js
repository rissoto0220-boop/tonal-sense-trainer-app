import { test } from "node:test";
import assert from "node:assert/strict";
import { appSource, functionBody, compact } from "../helpers/app-source.js";

// app.js はDOMを直接使うためNodeでは動かせない。機能的音感の起動が、保存はするが送信には触れないことを、ソースの形で確認する。
// (旗がなければ選べないこと(available)は、tests/training/app-integration.test.js がまとめて確かめる)
// 2026-10-27: 参加者IDごとにブラウザへ保存し、履歴・CSVを出せるようにした。送信には、引き続き触れない。
test("機能的音感の起動は、参加者IDつきでブラウザに保存するが、送信の仕組みには触れない", () => {
  const body = functionBody(appSource, "function startFunctionalPitchTest()");
  const text = compact(body);
  assert.match(text, /runFunctionalPitchSession\(/);
  assert.match(text, /createFunctionalPitchRecorder\(participantId, \{ storage: localStorage \}\)/);
  for (const name of ["onSessionStarted", "onTrialStarted", "onTrialConfirmed"]) assert.match(text, new RegExp(`${name}: recorder\\.${name}`), name);
  assert.match(text, /recorder\.onKeyMeasured\(result\)/);
  for (const word of ["syncSessionsToServer", "syncPendingSessions", "fetch", "upload"]) assert.equal(body.includes(word), false, word);
});
