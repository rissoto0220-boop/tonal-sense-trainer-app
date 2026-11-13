import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScoreSeries, listMenuIdsWithScores } from "../../src/training/reports.js";

// 保存データに依存せず、セッションの配列だけで動くことを確かめる(サーバー保存でも同じ形で渡せる)。
const session = (menuId, startedAt, sessionStatus, correctCount, extra = {}) => ({
  menuId, startedAt, sessionStatus, correctCount, trialsPlanned: 15, sessionKeyCode: "C", ...extra,
});

test("完了した回だけを、開始日時の古い順に、1から振り直した実施回で並べる", () => {
  const sessions = [
    session("menu-01", "2026-10-28T10:00:00", "completed", 9),
    session("menu-01", "2026-10-26T10:00:00", "completed", 5),
    session("menu-01", "2026-10-27T10:00:00", "interrupted", 3),
    session("menu-01", "2026-10-27T12:00:00", "audio_error", 2),
    session("menu-01", "2026-10-29T10:00:00", null, 4),
  ];
  const { points } = buildScoreSeries(sessions, "menu-01");
  assert.deepEqual(points.map((p) => [p.index, p.correctCount]), [[1, 5], [2, 9]]);
});

test("指定したメニューだけを対象にする", () => {
  const sessions = [
    session("menu-01", "2026-10-26T10:00:00", "completed", 5),
    session("menu-02", "2026-10-27T10:00:00", "completed", 11),
  ];
  assert.deepEqual(buildScoreSeries(sessions, "menu-02").points.map((p) => p.correctCount), [11]);
});

test("点にはKeyと開始日時と出題数を持たせる", () => {
  const sessions = [session("menu-09", "2026-10-26T10:00:00", "completed", 7, { sessionKeyCode: "Es" })];
  assert.deepEqual(buildScoreSeries(sessions, "menu-09").points[0], {
    index: 1, correctCount: 7, trialsPlanned: 15, startedAt: "2026-10-26T10:00:00", sessionKeyCode: "Es",
  });
});

test("満点は出題数の最大値。出題数が15より少なくても、記録がなくても15を下限にする", () => {
  assert.equal(buildScoreSeries([], "menu-01").maxScore, 15);
  assert.deepEqual(buildScoreSeries([], "menu-01").points, []);
  assert.equal(buildScoreSeries([session("menu-01", "A", "completed", 2, { trialsPlanned: 3 })], "menu-01").maxScore, 15);
  assert.equal(buildScoreSeries([session("menu-01", "A", "completed", 2, { trialsPlanned: 20 })], "menu-01").maxScore, 20);
});

test("渡した配列は書き換えない", () => {
  const sessions = [session("menu-01", "B", "completed", 1), session("menu-01", "A", "completed", 2)];
  const copy = structuredClone(sessions);
  buildScoreSeries(sessions, "menu-01");
  assert.deepEqual(sessions, copy);
});

test("完了した回があるメニューを、重複なしで初めて完了した順に返す", () => {
  const sessions = [
    session("menu-03", "2026-10-26T10:00:00", "completed", 5),
    session("menu-01", "2026-10-27T10:00:00", "interrupted", 3),
    session("menu-02", "2026-10-28T10:00:00", "completed", 5),
    session("menu-03", "2026-10-29T10:00:00", "completed", 6),
  ];
  assert.deepEqual(listMenuIdsWithScores(sessions), ["menu-03", "menu-02"]);
});
