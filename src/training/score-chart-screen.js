// 音感訓練の得点推移の画面。メニューを選ぶと、そのメニューの完了した回の正解数を折れ線グラフで見せる。
// participantData は session-store.js の loadParticipantData() が返す形({ sessions: [...] })。
// この画面は sessions の配列だけを見る(保存の出どころを知らない)。サーバー保存にするときは、渡す側(app.js)だけ替える。
import { escapeHtml } from "../shared/escape-html.js";
import { formatDisplayDateTime } from "../shared/display-format.js";
import { buildScoreSeries, listMenuIdsWithScores } from "./reports.js";
import { buildScoreChartSvg } from "./score-chart.js";
import { TRAINING_MENUS } from "./menus.js";

export const SCORE_SCREEN_TEXT = {
  title: "得点の推移",
  menuLabel: "メニュー",
  back: "メニュー選択へ戻る",
};

// 点の一覧の1行。例: 第2回 — Key Es — 2026/10/28 15:35 — 正解 12 / 15
export function formatScorePointRow(point) {
  return `<li>第${point.index}回 — Key ${escapeHtml(point.sessionKeyCode)} — ${escapeHtml(formatDisplayDateTime(point.startedAt))} — 正解 ${point.correctCount} / ${point.trialsPlanned}</li>`;
}

// 最初に選ぶメニュー: 完了した回があるメニューのうち、メニュー番号がいちばん小さいもの。なければ先頭のメニュー。
export function chooseInitialMenuId(sessions, menus = TRAINING_MENUS) {
  const scored = new Set(listMenuIdsWithScores(sessions));
  return (menus.find((menu) => scored.has(menu.menuId)) ?? menus[0]).menuId;
}

export function buildScoreScreenHtml(sessions, menuId, menus = TRAINING_MENUS) {
  const series = buildScoreSeries(sessions, menuId);
  const scored = new Set(listMenuIdsWithScores(sessions));
  const options = menus.map((menu) => {
    const mark = scored.has(menu.menuId) ? "" : "(記録なし)";
    return `<option value="${escapeHtml(menu.menuId)}"${menu.menuId === menuId ? " selected" : ""}>${escapeHtml(menu.name + mark)}</option>`;
  }).join("");
  const list = series.points.length
    ? `<ul class="history-list">${series.points.map(formatScorePointRow).join("")}</ul>`
    : "";
  return `
    <div class="panel">
      <h2 tabindex="-1">${SCORE_SCREEN_TEXT.title}</h2>
      <label class="score-menu-select">${SCORE_SCREEN_TEXT.menuLabel}
        <select id="score-menu">${options}</select>
      </label>
      ${buildScoreChartSvg(series)}
      ${list}
      <div class="actions"><button type="button" class="primary" data-role="back">${SCORE_SCREEN_TEXT.back}</button></div>
    </div>`;
}

export function showScoreChartScreen({ screenEl, participantData, menus = TRAINING_MENUS, onBack = () => {} }) {
  const sessions = participantData.sessions;

  function render(menuId) {
    screenEl.innerHTML = buildScoreScreenHtml(sessions, menuId, menus);
    screenEl.querySelector("#score-menu")?.addEventListener("change", (e) => render(e.target.value));
    screenEl.querySelector('[data-role="back"]')?.addEventListener("click", onBack);
  }

  render(chooseInitialMenuId(sessions, menus));
}
