// 機能的音感測定の履歴・CSV出力(仕様20章)。相対音感の history-screen.js と同じ見た目と切り替え。
// 「中断」には、ページを閉じた等(interrupted)と、音声エラー(audio_error)の両方を含める。
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
import { KEY_LABEL } from "./measurement-screens.js";

const STATUS_LABEL = { interrupted: "中断", audio_error: "音声エラーで中断" };

// 履歴一覧の1行。例: 第1回(Key C) — 2026/10/27 15:35 — 90 / 90 試行
export function formatHistoryRow(row) {
  const keyLabel = KEY_LABEL[row.measurementKeyCode] ?? row.measurementKeyCode;
  const status = STATUS_LABEL[row.sessionStatus];
  const trials = `${row.answeredCount} / ${row.totalTrialCount} 試行`;
  return `<li>第${row.attemptNumber}回(${escapeHtml(keyLabel)}) — ${escapeHtml(formatDisplayDateTime(row.startedAt))} — ${status ? `${status}(${trials})` : trials}</li>`;
}

// participantData: session-store.js の loadParticipantData() が返す形({ sessions: [...] })。
// onBack: 「Key選択へ戻る」を押したときに呼ぶ。
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
        <h2>機能的音感テストの履歴・CSV出力</h2>
        <label class="checkbox"><input type="checkbox" id="toggle-list-interrupted"${includeInterruptedInList ? " checked" : ""}> 中断した履歴を表示</label>
        ${listHtml}
        <div class="notice">回答詳細CSVとテスト履歴CSVの両方を保存してください。</div>
        <label class="checkbox"><input type="checkbox" id="toggle-csv-interrupted"${includeInterruptedInCsv ? " checked" : ""}> 中断した履歴を含める</label>
        <div class="actions">
          <button id="download-responses" class="secondary">回答詳細CSVをダウンロード</button>
          <button id="download-sessions" class="secondary">テスト履歴CSVをダウンロード</button>
        </div>
        <div class="actions"><button id="back" class="primary">Key選択へ戻る</button></div>
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
