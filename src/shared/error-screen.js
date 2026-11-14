// エラー画面の共通部品(見出し・本文・戻るボタン1つ)。
// 行き止まり(再読み込みしかない)画面をなくすため、エラー時は拠点の画面へ戻れるようにする(2026-11-14 研究者の決定)。
// エラーの種類ごとの統一(文言・戻り先の整理)は、この部品を土台に後で検討する。
import { escapeHtml } from "./escape-html.js";

// title: 見出し。message: 本文。backLabel: 戻るボタンの文字(省略するとボタンを出さない)。
export function buildErrorScreenHtml({ title, message, backLabel = null }) {
  const back = backLabel
    ? `
      <div class="actions"><button type="button" class="primary" data-role="back">${escapeHtml(backLabel)}</button></div>`
    : "";
  return `
    <div class="panel error-screen">
      <h2 tabindex="-1">${escapeHtml(title)}</h2>
      <p class="error" role="alert">${escapeHtml(message)}</p>${back}
    </div>`;
}

// エラー画面を描画し、見出しにフォーカスを移す。
// onBack: 戻るボタンを押したときに呼ぶ(押した直後にボタンを無効にして、二重押しを防ぐ)。
//   onBack を渡さないと、戻るボタンを出さない(開発用ページなど、戻り先がない場合)。
export function showErrorScreen({ screenEl, title, message, backLabel, onBack = null }) {
  screenEl.innerHTML = buildErrorScreenHtml({ title, message, backLabel: onBack ? backLabel : null });
  screenEl.querySelector("h2")?.focus();
  const button = screenEl.querySelector('[data-role="back"]');
  if (!button) return;
  button.addEventListener("click", () => {
    if (button.disabled) return;
    button.disabled = true;
    onBack();
  });
}
