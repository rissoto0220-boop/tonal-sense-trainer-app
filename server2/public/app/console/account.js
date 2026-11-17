// 「アカウント」画面（ApiSpec_Belonging.md B6: パスワードの変更）。ログイン後のパスワードの変更。
// 変更に成功すると、この端末以外の、同じ所属のログインは、すべて終了する（サーバの仕様）。
import { field } from "./dialog.js";
import { errorText } from "../common.js";
import { el } from "./ui.js";

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;

/**
 * @param {HTMLElement} content 内容の領域
 * @param {{ api: import("../../js/uectst-api/index.js").BlgClient, belonging: {name: string, loginId: string} }} context
 */
export function renderAccount(content, { api, belonging }) {
  content.append(el("h1", "アカウント"));

  const info = el("div", undefined, "card");
  const dl = el("dl", undefined, "kv");
  dl.append(el("dt", "所属名"), el("dd", belonging.name), el("dt", "ログインID"), el("dd", belonging.loginId));
  info.append(dl);
  content.append(info);

  content.append(el("h2", "パスワードの変更"));
  const form = el("form", undefined, "card");
  form.noValidate = true;
  const current = field({ label: "現在のパスワード", type: "password", autocomplete: "current-password", maxLength: MAX_LENGTH });
  const next = field({ label: "新しいパスワード", type: "password", autocomplete: "new-password", maxLength: MAX_LENGTH, hint: `${MIN_LENGTH}〜${MAX_LENGTH}文字。現在のパスワードとは、違うものにしてください。` });
  const again = field({ label: "新しいパスワード（確認）", type: "password", autocomplete: "new-password", maxLength: MAX_LENGTH });
  const error = el("p", "", "error");
  error.setAttribute("role", "alert");
  error.hidden = true;
  const done = el("p", "", "status");
  done.setAttribute("role", "status");
  const submit = el("button", "変更する", "primary");
  submit.type = "submit";
  const row = el("div", undefined, "row");
  row.append(submit);
  form.append(current.node, next.node, again.node, error, row);
  content.append(form, done);
  content.append(el("p", "パスワードを変更すると、この端末以外のログインは、すべて終了します。現在のパスワードを5回続けて間違えると、この所属は15分間、ログインできなくなります。", "note"));

  function fail(message) {
    error.textContent = message;
    error.hidden = false;
    done.textContent = "";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    done.textContent = "";
    const currentPassword = current.input.value;
    const newPassword = next.input.value;
    const length = [...newPassword].length;
    if (currentPassword === "") return fail("現在のパスワードを入力してください。");
    if (length < MIN_LENGTH || length > MAX_LENGTH) return fail(`新しいパスワードは、${MIN_LENGTH}〜${MAX_LENGTH}文字にしてください。`);
    if (newPassword !== again.input.value) return fail("新しいパスワードが、確認の入力と一致しません。");
    if (newPassword === currentPassword) return fail("新しいパスワードは、現在のパスワードとは違うものにしてください。");

    submit.disabled = true;
    try {
      await api.account.changePassword(currentPassword, newPassword);
      for (const f of [current, next, again]) f.input.value = "";
      done.textContent = "パスワードを変更しました。この端末以外のログインは、終了しました。";
    } catch (e) {
      // 期限切れの 401（UNAUTHENTICATED）は、ログイン画面へ戻る処理が行う。現在のパスワードの誤りは、この画面用の文言にする。
      if (e?.code === "INVALID_CREDENTIALS") fail("現在のパスワードが正しくありません。");
      else if (e?.status !== 401) fail(errorText(e));
    } finally {
      submit.disabled = false;
    }
  });
}
