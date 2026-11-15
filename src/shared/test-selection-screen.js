// テスト選択画面。参加者ID確認の後に表示し、ここから各テストの練習・本番へ進む。
// 表示はtestsの一覧から機械的に作るだけで、テスト固有の処理は持たない
// (テストを追加するときは、呼び出し側の一覧に1件足すだけで済むようにする)。
import { escapeHtml } from "./escape-html.js";

export const TEST_SELECTION_TEXT = {
  title: "受けるテストを選んでください",
  history: "履歴・CSVを見る",
  changeParticipant: "参加者IDを変更する",
};

// 各テストの「履歴・CSVを見る」は、選べるテストで、onShowHistory があるときだけ出す(2026-11-14 研究者の決定)。
const hasHistory = (test) => test.available && typeof test.onShowHistory === "function";

export function buildTestSelectionHtml({ participantId, tests }) {
  return `
    <div class="panel">
      <h2>${TEST_SELECTION_TEXT.title}</h2>
      <p class="note">参加者ID: ${escapeHtml(participantId)}</p>
      <ul class="test-list">
        ${tests.map((test) => `
          <li class="test-item${test.available ? "" : " is-unavailable"}">
            <button id="test-${escapeHtml(test.id)}" class="test-button" data-test-id="${escapeHtml(test.id)}"${test.available ? "" : " disabled"}>
              <span class="test-title">${escapeHtml(test.title)}</span>
              ${test.available ? "" : `<span class="test-badge">準備中</span>`}
            </button>
            <p class="test-description">${escapeHtml(test.description)}</p>${hasHistory(test) ? `
            <div class="test-history"><button type="button" class="secondary test-history-button" data-history-test="${escapeHtml(test.id)}" aria-label="${escapeHtml(`${test.title}の${TEST_SELECTION_TEXT.history}`)}">${TEST_SELECTION_TEXT.history}</button></div>` : ""}
          </li>`).join("")}
      </ul>
      <div class="actions"><button id="change-participant" class="secondary" data-role="change-participant">${TEST_SELECTION_TEXT.changeParticipant}</button></div>
    </div>`;
}

// tests: { id, title, description, available, onStart, onShowHistory } の配列。
//   available が false のテストは「準備中」として表示し、選べないようにする。
//   onShowHistory(省略可): そのテストの「履歴・CSVを見る」を押したときに呼ぶ。
// onChangeParticipant: 「参加者IDを変更する」を押したときに呼ぶ。
export function showTestSelectionScreen({ screenEl, participantId, tests, onChangeParticipant }) {
  screenEl.innerHTML = buildTestSelectionHtml({ participantId, tests });

  for (const test of tests) {
    if (test.available) screenEl.querySelector(`[data-test-id="${test.id}"]`)?.addEventListener("click", test.onStart);
    if (hasHistory(test)) screenEl.querySelector(`[data-history-test="${test.id}"]`)?.addEventListener("click", test.onShowHistory);
  }
  screenEl.querySelector('[data-role="change-participant"]')?.addEventListener("click", onChangeParticipant);
}
