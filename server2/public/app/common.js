// 仮実装の画面で共通の部品。API の呼び出し口（FamilyClient）と、画面の切り替え・エラー表示。
//
// API の基準パスは、このファイルの置き場所から決める（サーバを、ドキュメントルートに置いても、
// MAMP のようにサブパスに置いても動くようにするため）。public/app/common.js → public/index.php/api/v1
// URL Rewrite が使えない環境でも動くよう、index.php を含む形で呼ぶ。

import { FamilyClient } from "../js/uectst-api/index.js";

export const API_BASE_PATH = new URL("../index.php/api/v1", import.meta.url).pathname;

// デバッグ状態のサーバがメールを送ると、既定の動作で、メール表示ページが別タブで開く（ApiClient の onDebugMail）。
export const api = new FamilyClient({ basePath: API_BASE_PATH });

/** @param {string} id */
export function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} がありません`);
  return el;
}

/** data-screen を持つ区画のうち、指定した1つだけを表示する。 */
export function showScreen(name) {
  for (const el of document.querySelectorAll("[data-screen]")) {
    el.hidden = el.dataset.screen !== name;
  }
}

/**
 * エラーを、画面に表示する文章にする。サーバのエラーは、利用者向けの日本語のメッセージを持つ。
 * @param {unknown} error
 * @returns {string}
 */
export function errorText(error) {
  if (!error || typeof error !== "object" || !("message" in error)) return "エラーが発生しました。";
  let text = String(error.message);
  const retryAfter = /** @type {any} */ (error).retryAfter;
  if (typeof retryAfter === "number" && retryAfter > 0) {
    const minutes = Math.ceil(retryAfter / 60);
    text += `\n（${retryAfter >= 90 ? `約${minutes}分` : `約${retryAfter}秒`}後に、もう一度お試しください）`;
  }
  return text;
}

/** エラー表示用の要素に、メッセージを入れる（null で消す）。 */
export function setError(id, error) {
  const el = byId(id);
  el.textContent = error === null ? "" : errorText(error);
  el.hidden = error === null;
}
