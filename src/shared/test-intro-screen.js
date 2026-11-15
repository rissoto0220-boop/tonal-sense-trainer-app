// テストの説明画面(2026-11-15 研究者の決定)。テスト選択で名前を押した次に出す。
// 「始める」を押すまでは、セッションも音声も始めない(ページを閉じる前の確認も出さない)。
// 文章は呼び出し側から受け取る(文章は test-intro-text.js にまとめてある)。
import { escapeHtml } from "./escape-html.js";

export const TEST_INTRO_SCREEN_TEXT = {
  start: "始める",
  history: "履歴・CSVを見る",
  back: "テスト選択へ戻る",
};

// title: テスト名(見出し)。lines: 説明の段落の配列(省略・空でもよい)。onShowHistory がないときは、履歴のボタンを出さない。
export function buildTestIntroHtml({ title, lines = [], hasHistory = true }) {
  return `
    <div class="panel test-intro">
      <h2 tabindex="-1">${escapeHtml(title)}</h2>
      ${lines.map((line) => `<p class="test-intro-text">${escapeHtml(line)}</p>`).join("\n      ")}
      <div class="actions">
        <button type="button" class="primary" data-role="start">${TEST_INTRO_SCREEN_TEXT.start}</button>${hasHistory ? `
        <button type="button" class="secondary" data-role="history">${TEST_INTRO_SCREEN_TEXT.history}</button>` : ""}
        <button type="button" class="secondary" data-role="back">${TEST_INTRO_SCREEN_TEXT.back}</button>
      </div>
    </div>`;
}

// onStart: 「始める」(各テストの、今までの最初の画面へ進む)。onShowHistory(省略可): 「履歴・CSVを見る」。onBack: 「テスト選択へ戻る」。
export function showTestIntroScreen({ screenEl, title, lines = [], onStart, onShowHistory, onBack }) {
  const hasHistory = typeof onShowHistory === "function";
  screenEl.innerHTML = buildTestIntroHtml({ title, lines, hasHistory });
  screenEl.querySelector('[data-role="start"]')?.addEventListener("click", onStart);
  if (hasHistory) screenEl.querySelector('[data-role="history"]')?.addEventListener("click", onShowHistory);
  screenEl.querySelector('[data-role="back"]')?.addEventListener("click", onBack);
  screenEl.querySelector("h2")?.focus();
}
