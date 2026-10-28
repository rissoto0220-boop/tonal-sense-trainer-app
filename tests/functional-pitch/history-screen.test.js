import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHistoryRow } from "../../src/functional-pitch/history-screen.js";

// history-screen.js の画面部分は document を直接書き換えるため、相対音感の履歴画面と同じく
// ブラウザでの手動確認で検証する。ここでは、一覧の1行の文言と、import できることを確かめる
// (行データ自体の正しさは reports.test.js で検証済み)。
const ROW = {
  attemptNumber: 2, measurementKeyCode: "Fis", startedAt: "不正な日時", answeredCount: 3, totalTrialCount: 90,
};

test("一覧の1行: 第n回(Key) — 日時 — 回答済み / 総試行数", () => {
  assert.equal(formatHistoryRow({ ...ROW, sessionStatus: "completed" }), "<li>第2回(Key Fis) — 不正な日時 — 3 / 90 試行</li>");
});

test("一覧の1行: 中断・音声エラーの回は、その旨を添える", () => {
  assert.match(formatHistoryRow({ ...ROW, sessionStatus: "interrupted" }), /— 中断\(3 \/ 90 試行\)<\/li>$/);
  assert.match(formatHistoryRow({ ...ROW, sessionStatus: "audio_error" }), /— 音声エラーで中断\(3 \/ 90 試行\)<\/li>$/);
});

test("document が無い環境でも history-screen.js のimportで例外にならない", async () => {
  await assert.doesNotReject(import("../../src/functional-pitch/history-screen.js"));
});
