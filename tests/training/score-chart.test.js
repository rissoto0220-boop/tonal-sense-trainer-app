import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScoreChartSvg, yTicks, SCORE_CHART_TEXT } from "../../src/training/score-chart.js";
import { buildScoreScreenHtml, chooseInitialMenuId, formatScorePointRow } from "../../src/training/score-chart-screen.js";
import { buildScoreSeries } from "../../src/training/reports.js";

const point = (index, correctCount) => ({
  index, correctCount, trialsPlanned: 15, startedAt: "不正な日時", sessionKeyCode: "C",
});
const series = (...scores) => ({ menuId: "menu-01", maxScore: 15, points: scores.map((score, i) => point(i + 1, score)) });
const count = (text, pattern) => (text.match(pattern) ?? []).length;

test("縦軸の目盛りは0から満点まで(15なら 0・5・10・15、60なら 0・20・40・60)", () => {
  assert.deepEqual(yTicks(15), [0, 5, 10, 15]);
  assert.deepEqual(yTicks(60), [0, 20, 40, 60]);
  assert.deepEqual(yTicks(1), [0, 1]);
});

test("記録がないときは、グラフではなく案内を出す", () => {
  const html = buildScoreChartSvg(series());
  assert.match(html, new RegExp(SCORE_CHART_TEXT.empty));
  assert.doesNotMatch(html, /<svg/);
});

test("点の数だけ丸を描き、2点以上のときだけ線を引く", () => {
  assert.equal(count(buildScoreChartSvg(series(5)), /<circle/g), 1);
  assert.equal(count(buildScoreChartSvg(series(5)), /<polyline/g), 0);
  assert.equal(count(buildScoreChartSvg(series(5, 9, 12)), /<circle/g), 3);
  assert.equal(count(buildScoreChartSvg(series(5, 9, 12)), /<polyline/g), 1);
});

test("点には値の文字を付け、スクリーンリーダー向けの要約を付ける", () => {
  const svg = buildScoreChartSvg(series(5, 9));
  assert.match(svg, /class="score-chart-value"[^>]*>5</);
  assert.match(svg, /class="score-chart-value"[^>]*>9</);
  assert.match(svg, /role="img" aria-label="2回分の正解数: 第1回 5、第2回 9\(満点 15\)"/);
});

test("満点を超えた値・負の値でも、描画範囲の外に出ない", () => {
  const ys = [...buildScoreChartSvg(series(99, -3)).matchAll(/<circle[^>]* cy="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(ys.length, 2);
  assert.ok(ys.every((y) => y >= 24 && y <= 236), `範囲外: ${ys}`);
});

test("点が多いときは、横軸の数字を間引く(最初と最後は出す)", () => {
  const svg = buildScoreChartSvg(series(...Array.from({ length: 30 }, (_, i) => i % 15)));
  const labels = [...svg.matchAll(/class="score-chart-label" x="[\d.]+" y="254" text-anchor="middle">(\d+)</g)].map((m) => Number(m[1]));
  assert.ok(labels.length < 30 && labels.length >= 10, `${labels.length}個`);
  assert.equal(labels[0], 1);
  assert.equal(labels.at(-1), 30);
});

test("画面: 選んだメニューが選択状態で、全メニューが選べ、記録がないメニューにはその旨が付く", () => {
  const sessions = [{ menuId: "menu-02", startedAt: "不正な日時", sessionStatus: "completed", correctCount: 8, trialsPlanned: 15, sessionKeyCode: "C" }];
  const html = buildScoreScreenHtml(sessions, "menu-02");
  assert.equal(count(html, /<option /g), 16);
  assert.match(html, /<option value="menu-02" selected>② /);
  assert.match(html, /<option value="menu-01">① [^<]*\(記録なし\)<\/option>/);
  assert.match(html, /<li>第1回 — Key C — 不正な日時 — 正解 8 \/ 15<\/li>/);
  assert.match(html, /data-role="back"/);
});

test("最初に選ぶメニュー: 完了した回があるメニューのうち番号が最小のもの。なければ先頭", () => {
  const done = (menuId, status = "completed") => ({ menuId, startedAt: "A", sessionStatus: status, correctCount: 1, trialsPlanned: 15, sessionKeyCode: "C" });
  assert.equal(chooseInitialMenuId([done("menu-05"), done("menu-03")]), "menu-03");
  assert.equal(chooseInitialMenuId([done("menu-03", "interrupted")]), "menu-01");
  assert.equal(chooseInitialMenuId([]), "menu-01");
});

test("1行の表示と、series の組み立てがつながる(buildScoreSeries の結果をそのまま渡せる)", () => {
  const s = buildScoreSeries([{ menuId: "menu-01", startedAt: "A", sessionStatus: "completed", correctCount: 4, trialsPlanned: 15, sessionKeyCode: "Fis" }], "menu-01");
  assert.match(buildScoreChartSvg(s), /<circle/);
  assert.equal(formatScorePointRow(s.points[0]), "<li>第1回 — Key Fis — A — 正解 4 / 15</li>");
});

test("document が無い環境でも score-chart-screen.js のimportで例外にならない", async () => {
  await assert.doesNotReject(import("../../src/training/score-chart-screen.js"));
});
