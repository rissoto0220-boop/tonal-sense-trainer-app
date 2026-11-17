// エラー画面の共通部品。エラーの種類ごとの表(error-kinds.js)から、同じ構成の画面を作る。
// 画面の順: 見出し → 何が起きたか → 詳細 → データへの影響 → 次にすべきこと → 戻るボタン
// (仕様書 §26 の「何が起きたか・データへの影響・次にすべきこと」。2026-11-15 研究者の決定でエラーの見せ方を統一した)。
// 行き止まり(再読み込みしかない)画面をなくすため、エラー時は拠点の画面へ戻れるようにする(2026-11-14 研究者の決定)。
import { escapeHtml } from "./escape-html.js";
import { describeError } from "./error-kinds.js";

// kind・impact・backTo・details は describeError を参照。
// withBack が偽なら、戻るボタンを出さない(戻るボタンの文字は「{backTo}へ戻る」)。
export function buildErrorScreenHtml({ kind, impact, backTo, details, withBack = true }) {
  const error = describeError({ kind, impact, backTo, details });
  const detailsHtml = error.details.length
    ? `
      <ul class="error-details">${error.details.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
    : "";
  const impactHtml = error.impact ? `
      <p class="error-impact">${escapeHtml(error.impact)}</p>` : "";
  const back = withBack && backTo
    ? `
      <div class="actions"><button type="button" class="primary" data-role="back">${escapeHtml(`${backTo}へ戻る`)}</button></div>`
    : "";
  return `
    <div class="panel error-screen">
      <h2 tabindex="-1">${escapeHtml(error.title)}</h2>
      <p class="error" role="alert">${escapeHtml(error.cause)}</p>${detailsHtml}${impactHtml}
      <p class="note error-next">${escapeHtml(error.next)}</p>${back}
    </div>`;
}

// エラー画面を描画し、見出しにフォーカスを移す。
// onBack: 戻るボタンを押したときに呼ぶ(押した直後にボタンを無効にして、二重押しを防ぐ)。
//   onBack を渡さないと、戻るボタンを出さない(開発用ページなど、戻り先がない場合。次にすべきことは、再読み込みの案内になる)。
export function showErrorScreen({ screenEl, kind, impact, backTo, details, onBack = null }) {
  const withBack = Boolean(onBack);
  screenEl.innerHTML = buildErrorScreenHtml({ kind, impact, backTo: withBack ? backTo : null, details, withBack });
  screenEl.querySelector("h2")?.focus();
  const button = screenEl.querySelector('[data-role="back"]');
  if (!button) return;
  button.addEventListener("click", () => {
    if (button.disabled) return;
    button.disabled = true;
    onBack();
  });
}
