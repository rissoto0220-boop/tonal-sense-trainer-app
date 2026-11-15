// テスト選択画面。参加者ID確認の後に表示し、ここから各テストの練習・本番へ進む。
// 表示はtestsの一覧から機械的に作るだけで、テスト固有の処理は持たない
// (テストを追加するときは、呼び出し側の一覧に1件足すだけで済むようにする)。
import { escapeHtml } from "./escape-html.js";

export const TEST_SELECTION_TEXT = {
  title: "受けるテストを選んでください",
  changeParticipant: "参加者IDを変更する",
};

// 2026-11-15 研究者の決定: テスト選択はテストの名前だけにする。名前を押すと、説明画面(test-intro-screen.js)を出す。
// 説明の文章と「履歴・CSVを見る」は、説明画面へ移した。

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
          </li>`).join("")}
      </ul>
      <div class="actions"><button id="change-participant" class="secondary" data-role="change-participant">${TEST_SELECTION_TEXT.changeParticipant}</button></div>
    </div>`;
}

// tests: { id, title, available } の配列。
//   available が false のテストは「準備中」として表示し、選べないようにする。
// onSelect(test): 選べるテストの名前を押したときに呼ぶ(呼び出し側が、そのテストの説明画面を出す)。
// onChangeParticipant: 「参加者IDを変更する」を押したときに呼ぶ。
export function showTestSelectionScreen({ screenEl, participantId, tests, onSelect, onChangeParticipant }) {
  screenEl.innerHTML = buildTestSelectionHtml({ participantId, tests });

  for (const test of tests) {
    if (test.available) screenEl.querySelector(`[data-test-id="${test.id}"]`)?.addEventListener("click", () => onSelect(test));
  }
  screenEl.querySelector('[data-role="change-participant"]')?.addEventListener("click", onChangeParticipant);
}
