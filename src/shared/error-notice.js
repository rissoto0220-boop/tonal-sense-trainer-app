// 想定外の例外(コードの不具合・ブラウザの想定外の動き)を、画面の上の帯で知らせる
// (2026-11-15 エラーの見せ方の統一 フェーズ5-C。研究者の決定: 帯で知らせ、テストは続けられる)。
// 画面(#screen)の外に置くので、画面が切り替わっても帯は残る。文言はエラーの種類の表(error-kinds.js)の unexpected。
// 詳細(エラーの中身)は、参加者向けの画面には出さない(コンソールには、ブラウザが出している)。
import { escapeHtml } from "./escape-html.js";
import { describeError } from "./error-kinds.js";

// 画面の動きに影響がない、ブラウザ由来の通知。想定外の例外として扱わない。
const IGNORED_MESSAGES = [/^ResizeObserver loop/];

function isIgnorable(event) {
  if (event.type === "unhandledrejection") return false;
  // error イベントのうち、メッセージのないもの(画像・音声などの読み込みの失敗)は対象外
  const message = typeof event.message === "string" ? event.message : "";
  if (!message) return true;
  return IGNORED_MESSAGES.some((pattern) => pattern.test(message));
}

export function buildErrorNoticeHtml() {
  const error = describeError({ kind: "unexpected" });
  return `
    <p class="error-notice-title" role="alert"><strong>${escapeHtml(error.title)}</strong> ${escapeHtml(error.cause)}</p>
    <p class="note error-next">${escapeHtml(error.next)}</p>
    <div class="actions">
      <button type="button" class="primary" data-role="restart">最初からやり直す</button>
      <button type="button" data-role="close">閉じる</button>
    </div>`;
}

// anchorEl: 画面の要素(#screen)。帯は、その直前に1つだけ出す。
// onRestart: 「最初からやり直す」を押したときに呼ぶ(押した直後にボタンを無効にして、二重押しを防ぐ)。
// 戻り値: 取り外す関数(帯も消す。何度呼んでも安全)。
export function installErrorNotice({ target = typeof window !== "undefined" ? window : null, doc = typeof document !== "undefined" ? document : null, anchorEl, onRestart }) {
  if (!target || !doc || !anchorEl) return () => {};
  let banner = null;

  function hide() {
    banner?.remove();
    banner = null;
  }

  function show() {
    if (banner) return; // すでに出ている間は、同じ帯を繰り返さない
    const element = doc.createElement("div");
    element.className = "error-notice";
    element.innerHTML = buildErrorNoticeHtml();
    anchorEl.parentNode.insertBefore(element, anchorEl);
    const restart = element.querySelector('[data-role="restart"]');
    restart.addEventListener("click", () => {
      if (restart.disabled) return;
      restart.disabled = true;
      onRestart();
    });
    element.querySelector('[data-role="close"]').addEventListener("click", hide);
    banner = element;
  }

  const handler = (event) => {
    if (isIgnorable(event)) return;
    show();
  };
  target.addEventListener("error", handler);
  target.addEventListener("unhandledrejection", handler);
  let installed = true;
  return () => {
    if (!installed) return;
    installed = false;
    target.removeEventListener("error", handler);
    target.removeEventListener("unhandledrejection", handler);
    hide();
  };
}
