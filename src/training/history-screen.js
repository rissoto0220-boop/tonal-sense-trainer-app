// 音感訓練の履歴・CSV出力。機能的音感の history-screen.js と同じ見た目と切り替え。
// 「中断」には、「訓練を終了する」・ページを閉じた等(interrupted)と、音声エラー(audio_error)の両方を含める。
import { escapeHtml } from "../shared/escape-html.js";
import { formatDisplayDateTime } from "../shared/display-format.js";
import { toCsv, downloadTextFile } from "../shared/csv.js";
import {
  buildHistorySummary,
  buildResponseDetailRows,
  buildSessionHistoryRows,
  buildCsvFilename,
  RESPONSE_DETAIL_HEADERS,
  SESSION_HISTORY_HEADERS,
} from "./reports.js";
import { findTrainingMenu } from "./menus.js";

const STATUS_LABEL = { interrupted: "中断", audio_error: "音声エラーで中断" };

// 履歴一覧の1行。例: 第2回 ⑮ 単音 ソラシドレミファの判別(Key ランダム) — Key Es — 2026/10/28 15:35 — 正解 12 / 15
// 中断した回は、正解数の代わりに回答した数を出す(例: 中断(回答 7 / 15))。
export function formatHistoryRow(row) {
  const menuName = findTrainingMenu(row.menuId)?.name ?? row.menuId;
  const status = STATUS_LABEL[row.sessionStatus];
  const result = status ? `${status}(回答 ${row.trialsCompleted} / ${row.trialsPlanned})` : `正解 ${row.correctCount} / ${row.trialsPlanned}`;
  return `<li>第${row.attemptNumber}回 ${escapeHtml(menuName)} — Key ${escapeHtml(row.sessionKeyCode)} — ${escapeHtml(formatDisplayDateTime(row.startedAt))} — ${result}</li>`;
}

// participantData: session-store.js の loadParticipantData() が返す形({ sessions: [...] })。
// onBack: 「メニュー選択へ戻る」を押したときに呼ぶ。
export function showHistoryScreen({ screenEl, participantId, participantData, onBack = () => {} }) {
  let includeInterruptedInList = false;
  let includeInterruptedInCsv = false;

  function render() {
    const summary = buildHistorySummary(participantData.sessions, includeInterruptedInList);
    const listHtml = summary.length
      ? `<ul class="history-list">${summary.map(formatHistoryRow).join("")}</ul>`
      : `<p class="note">まだ記録がありません。</p>`;

    screenEl.innerHTML = `
      <div class="panel">
        <h2>音感訓練の履歴・CSV出力</h2>
        <label class="checkbox"><input type="checkbox" id="toggle-list-interrupted"${includeInterruptedInList ? " checked" : ""}> 中断した履歴を表示</label>
        ${listHtml}
        <div class="notice">回答詳細CSVと訓練履歴CSVの両方を保存してください。</div>
        <label class="checkbox"><input type="checkbox" id="toggle-csv-interrupted"${includeInterruptedInCsv ? " checked" : ""}> 中断した履歴を含める</label>
        <div class="actions">
          <button id="download-responses" class="secondary">回答詳細CSVをダウンロード</button>
          <button id="download-sessions" class="secondary">訓練履歴CSVをダウンロード</button>
        </div>
        <div class="actions"><button id="back" class="primary">メニュー選択へ戻る</button></div>
      </div>`;

    document.getElementById("toggle-list-interrupted").addEventListener("change", (e) => {
      includeInterruptedInList = e.target.checked;
      render();
    });
    document.getElementById("toggle-csv-interrupted").addEventListener("change", (e) => {
      includeInterruptedInCsv = e.target.checked;
    });
    document.getElementById("download-responses").addEventListener("click", () => {
      const rows = buildResponseDetailRows(participantId, participantData.sessions, includeInterruptedInCsv);
      downloadTextFile(buildCsvFilename(participantId, "responses"), toCsv(RESPONSE_DETAIL_HEADERS, rows));
    });
    document.getElementById("download-sessions").addEventListener("click", () => {
      const rows = buildSessionHistoryRows(participantId, participantData.sessions, includeInterruptedInCsv);
      downloadTextFile(buildCsvFilename(participantId, "sessions"), toCsv(SESSION_HISTORY_HEADERS, rows));
    });
    document.getElementById("back").addEventListener("click", onBack);
  }

  render();
}
