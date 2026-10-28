// 音感訓練のメニュー選択画面。①〜⑧(Key C)と⑨〜⑯(Key ランダム)の2つに分けて並べる。
// 見た目は、テスト選択画面と同じ目次リスト形式(既存の .test-list などのスタイルを使う)。
import { escapeHtml } from "../shared/escape-html.js";

export const MENU_SCREEN_TEXT = {
  title: "訓練メニューを選んでください",
  back: "テスト選択へ戻る",
  history: "履歴・CSVを見る",
};

// 1メニューの説明(出題数とKey)。
function describe(menu) {
  const key = menu.keyPolicy.mode === "fixed" ? `Key ${menu.keyPolicy.keyCode}` : "Key はランダム(C/Es/Fis/A)";
  return `${menu.generation.questionCount}問・${key}`;
}

function groupHtml(heading, menus) {
  return `
      <h3 class="training-menu-group">${escapeHtml(heading)}</h3>
      <ul class="test-list">
        ${menus.map((menu) => `
          <li class="test-item">
            <button type="button" class="test-button" data-menu-id="${escapeHtml(menu.menuId)}">
              <span class="test-title">${escapeHtml(menu.name)}</span>
            </button>
            <p class="test-description">${escapeHtml(describe(menu))}</p>
          </li>`).join("")}
      </ul>`;
}

export function buildMenuScreenHtml(menus) {
  const fixed = menus.filter((menu) => menu.keyPolicy.mode === "fixed");
  const random = menus.filter((menu) => menu.keyPolicy.mode !== "fixed");
  return `
    <div class="panel">
      <h2 tabindex="-1">${MENU_SCREEN_TEXT.title}</h2>
      ${groupHtml("Key C", fixed)}
      ${groupHtml("Key ランダム", random)}
      <div class="actions">
        <button type="button" class="secondary" data-role="history">${MENU_SCREEN_TEXT.history}</button>
        <button type="button" class="secondary" data-role="back">${MENU_SCREEN_TEXT.back}</button>
      </div>
    </div>`;
}

// onSelect(menu): メニューを押したとき(参加者のクリックの中で呼ぶので、音声の有効化に使える)。
// onShowHistory(): 「履歴・CSVを見る」を押したとき。onBack(): 「テスト選択へ戻る」を押したとき。
export function showTrainingMenuScreen({ screenEl, menus, onSelect, onShowHistory = () => {}, onBack }) {
  screenEl.innerHTML = buildMenuScreenHtml(menus);
  screenEl.querySelector("h2")?.focus();
  for (const button of screenEl.querySelectorAll("[data-menu-id]")) {
    button.addEventListener("click", () => {
      const menu = menus.find((item) => item.menuId === button.dataset.menuId);
      if (menu) onSelect(menu);
    });
  }
  screenEl.querySelector('[data-role="history"]')?.addEventListener("click", onShowHistory);
  screenEl.querySelector('[data-role="back"]')?.addEventListener("click", onBack);
}
