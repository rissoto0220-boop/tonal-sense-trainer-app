// 所属向けの画面で共通の、小さな部品。

/** 要素を作る。 */
export function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/** type="button" のボタンを作る。 */
export function button(label, onClick, className) {
  const b = el("button", label, className);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

/** 日時を、画面用の文字列にする（null は空）。 */
export function formatDateTime(iso) {
  return iso ? new Date(iso).toLocaleString("ja-JP") : "";
}

/** 日付だけを、画面用の文字列にする。 */
export function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString("ja-JP") : "";
}

/** 状態表示（status）とエラー表示の、1組の要素と、書き換える関数を作る。 */
export function createMessages() {
  const status = el("p", "", "status");
  status.setAttribute("role", "status");
  const error = el("p", "", "error");
  error.setAttribute("role", "alert");
  error.hidden = true;
  return {
    nodes: [status, error],
    say(text) {
      status.textContent = text;
      error.hidden = true;
    },
    fail(text) {
      status.textContent = "";
      error.textContent = text;
      error.hidden = false;
    },
  };
}
