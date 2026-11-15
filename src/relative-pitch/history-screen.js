// フェーズ7: 相対音感の履歴・CSV出力(仕様 relative-pitch-test-spec.md §19〜20)。
// 絶対音感のshowHistory()と同一画面にはせず、別の画面として用意する
// (仕様19章「同一画面に表示する場合はテスト種別を切り替えられるように」という要求を、
// そもそも同一画面にしないことで単純に満たす)。
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
import { formatAccuracyLabel } from "./scoring.js";

// 履歴一覧には簡易版・完全版のセッションが混在し得るため、行ごとにバージョンを明記する
// (総問題数・分母がバージョンによって異なり、ラベルが無いと紛らわしいため。仕様19章と同じ
// 「同じ系列へ無条件に混在させない」という考え方を、一覧表示でも踏襲する)。
const VERSION_LABELS = { simplified: "簡易版", full: "完全版" };

// participantId: 参加者ID。
// participantData: session-store.jsのloadParticipantData()が返す形({ sessions: [...] })。
// onBack: 戻るボタンを押したときに呼ぶ。backLabel: そのボタンの文字(省略すると「テスト選択へ戻る」。説明画面から開いたときは「戻る」)。
export function showHistoryScreen({ screenEl, participantId, participantData, onBack = () => {}, backLabel = "テスト選択へ戻る" }) {
  let includeInterruptedInList = false;
  let includeInterruptedInCsv = false;

  function formatRow(row) {
    const versionLabel = VERSION_LABELS[row.testVersion] ?? row.testVersion;
    if (row.sessionStatus === "interrupted") {
      return `<li>第${row.attemptNumber}回(${versionLabel}) — ${escapeHtml(formatDisplayDateTime(row.startedAt))} — 中断</li>`;
    }
    return `<li>第${row.attemptNumber}回(${versionLabel}) — ${escapeHtml(formatDisplayDateTime(row.startedAt))} — ${row.correctCount} / ${row.totalQuestions}(正答率 ${formatAccuracyLabel(row.correctCount, row.totalQuestions)})</li>`;
  }

  function render() {
    const summary = buildHistorySummary(participantData.sessions, includeInterruptedInList);
    const listHtml = summary.length
      ? `<ul class="history-list">${summary.map(formatRow).join("")}</ul>`
      : `<p class="note">まだ記録がありません。</p>`;

    screenEl.innerHTML = `
      <div class="panel">
        <h2>相対音感テストの履歴・CSV出力</h2>
        <label class="checkbox"><input type="checkbox" id="toggle-list-interrupted"${includeInterruptedInList ? " checked" : ""}> 中断した履歴を表示</label>
        ${listHtml}
        <div class="notice">回答詳細CSVとテスト履歴CSVの両方を保存してください。</div>
        <label class="checkbox"><input type="checkbox" id="toggle-csv-interrupted"${includeInterruptedInCsv ? " checked" : ""}> 中断した履歴を含める</label>
        <div class="actions">
          <button id="download-responses" class="secondary">回答詳細CSVをダウンロード</button>
          <button id="download-sessions" class="secondary">テスト履歴CSVをダウンロード</button>
        </div>
        <div class="actions"><button id="back" class="primary">${escapeHtml(backLabel)}</button></div>
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
