// 所属向けの画面で使う、ダイアログ（確認・入力）の部品。<dialog> 要素を使う。
import { errorText } from "../common.js";

/**
 * ラベル付きの入力欄を作る。
 * @param {{label: string, type?: string, value?: string, maxLength?: number, autocomplete?: string, hint?: string}} options
 * @returns {{node: HTMLElement, input: HTMLInputElement}}
 */
export function field({ label, type = "text", value = "", maxLength, autocomplete = "off", hint }) {
  const wrap = document.createElement("div");
  const id = `f${Math.random().toString(36).slice(2, 8)}`;
  const lab = document.createElement("label");
  lab.htmlFor = id;
  lab.textContent = label;
  const input = document.createElement("input");
  input.id = id;
  input.type = type;
  input.value = value;
  input.autocomplete = autocomplete;
  input.spellcheck = false;
  if (maxLength) input.maxLength = maxLength;
  wrap.append(lab, input);
  if (hint) {
    const note = document.createElement("p");
    note.className = "note";
    note.textContent = hint;
    wrap.append(note);
  }
  return { node: wrap, input };
}

/** 文章の段落を作る。 */
export function paragraph(text, className) {
  const p = document.createElement("p");
  p.textContent = text;
  if (className) p.className = className;
  return p;
}

/**
 * ダイアログを表示する。閉じたら、決定されたか（true）・取り消されたか（false）で解決する。
 * onConfirm が true（または何も返さない）なら閉じる。例外を投げたら、ダイアログ内にエラーを表示して、開いたままにする。
 * 実行中は、決定ボタンを無効にする（二重送信を防ぐ）。
 *
 * @param {object} options
 * @param {string} options.title
 * @param {Node[]} [options.body]
 * @param {string} [options.confirmLabel]
 * @param {string|null} [options.cancelLabel] null ならキャンセルボタンを出さない
 * @param {boolean} [options.danger] 取り消せない操作（決定ボタンを警告の色にする）
 * @param {() => Promise<boolean|void>|boolean|void} [options.onConfirm]
 * @returns {Promise<boolean>}
 */
export function showDialog({ title, body = [], confirmLabel = "OK", cancelLabel = "キャンセル", danger = false, onConfirm = () => true }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    const form = document.createElement("form");
    form.noValidate = true;
    const heading = document.createElement("h2");
    heading.textContent = title;
    const error = document.createElement("p");
    error.className = "error";
    error.setAttribute("role", "alert");
    error.hidden = true;

    const actions = document.createElement("div");
    actions.className = "row";
    if (cancelLabel !== null) {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = cancelLabel;
      cancel.addEventListener("click", () => dialog.close());
      actions.append(cancel);
    }
    const confirm = document.createElement("button");
    confirm.type = "submit";
    confirm.className = danger ? "primary danger" : "primary";
    confirm.textContent = confirmLabel;
    actions.append(confirm);

    form.append(heading, ...body, error, actions);
    dialog.append(form);

    let confirmed = false;
    let busy = false;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      confirm.disabled = true;
      error.hidden = true;
      try {
        if ((await onConfirm()) !== false) {
          confirmed = true;
          dialog.close();
        }
      } catch (e) {
        error.textContent = errorText(e);
        error.hidden = false;
      } finally {
        busy = false;
        confirm.disabled = false;
      }
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(confirmed);
    });

    document.body.append(dialog);
    dialog.showModal();
    // 入力欄があれば、そこから始める。
    (dialog.querySelector("input") ?? confirm).focus();
  });
}
