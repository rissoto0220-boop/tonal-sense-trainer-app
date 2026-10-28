import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHistoryRow } from "../../src/training/history-screen.js";

// history-screen.js の画面部分は document を直接書き換えるため、機能的音感の履歴画面と同じく
// ブラウザでの手動確認で検証する。ここでは、一覧の1行の文言と、import できることを確かめる
// (行データ自体の正しさは reports.test.js で検証済み)。
const ROW = {
  attemptNumber: 2, menuId: "menu-15", sessionKeyCode: "Es", startedAt: "不正な日時",
  trialsCompleted: 7, correctCount: 5, trialsPlanned: 15,
};

test("一覧の1行: 第n回 メニュー名 — Key — 日時 — 正解数 / 出題数", () => {
  assert.equal(
    formatHistoryRow({ ...ROW, sessionStatus: "completed" }),
    "<li>第2回 ⑮ 単音 ソラシドレミファの判別(Key ランダム) — Key Es — 不正な日時 — 正解 5 / 15</li>",
  );
});

test("一覧の1行: 中断・音声エラーの回は、その旨と回答した数を出す", () => {
  assert.match(formatHistoryRow({ ...ROW, sessionStatus: "interrupted" }), /— 中断\(回答 7 \/ 15\)<\/li>$/);
  assert.match(formatHistoryRow({ ...ROW, sessionStatus: "audio_error" }), /— 音声エラーで中断\(回答 7 \/ 15\)<\/li>$/);
});

test("一覧の1行: 定義にないメニューは menuId のまま出す", () => {
  assert.match(formatHistoryRow({ ...ROW, menuId: "menu-99", sessionStatus: "completed" }), /^<li>第2回 menu-99 — /);
});

test("document が無い環境でも history-screen.js のimportで例外にならない", async () => {
  await assert.doesNotReject(import("../../src/training/history-screen.js"));
});
