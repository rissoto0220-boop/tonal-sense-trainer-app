// 「パスキーの管理」画面（運用担当者の所属のみ。ApiSpec_Belonging.md B8〜B11）。
// 一覧（B8）、追加（B9・B10）、削除（B11）。追加と削除は、パスワードの再確認（B7）が必要
// （確認が必要なときは、BlgClient の onElevationRequired が、確認のダイアログを出す）。
// 運用担当者の所属は、パスキーが1件以上必要なため、最後の1件は削除できない。
import { isPasskeySupported } from "../../js/uectst-api/index.js";
import { errorText } from "../common.js";
import { paragraph, showDialog } from "./dialog.js";
import { el, button } from "./ui.js";

const MAX_PASSKEYS = 10;

/** パスキーの操作（端末の画面）で起きた例外を、利用者向けの文章にする。 */
function passkeyErrorText(error) {
  if (error?.name === "NotAllowedError") return "パスキーの操作が、キャンセルされました。";
  if (error?.name === "InvalidStateError") return "この端末のパスキーは、すでに登録されています。";
  return errorText(error);
}

/**
 * @param {HTMLElement} content 内容の領域
 * @param {{ api: import("../../js/uectst-api/index.js").BlgClient }} context
 */
export function renderPasskeys(content, { api }) {
  content.append(el("h1", "パスキーの管理"));
  content.append(el("p", "運用担当者の所属は、パスワードに加えて、パスキー（指紋・顔認証など）でログインを確認します。端末の買い替えや故障に備えて、2つ以上登録しておくことをおすすめします。", "note"));

  const summary = el("p", "");
  const advice = el("p", "", "warn");
  advice.hidden = true;
  const toolbar = el("div", undefined, "toolbar");
  const addButton = button("パスキーを追加", addPasskey, "primary");
  toolbar.append(summary, addButton);
  const status = el("p", "", "status");
  status.setAttribute("role", "status");
  const error = el("p", "", "error");
  error.setAttribute("role", "alert");
  error.hidden = true;
  const list = el("div");
  content.append(toolbar, advice, status, error, list);
  content.append(el("p", "パスキーは、HTTPS または localhost で開いたときだけ使えます。共用の端末には、登録しないでください。同期されるパスキー（iCloud キーチェーン・Google パスワードマネージャーなど）は、新しい端末でも使えます。端末に固定されたパスキーは、その端末を失うと使えなくなります。", "note"));

  function say(text) {
    status.textContent = text;
    error.hidden = true;
  }

  function fail(message) {
    status.textContent = "";
    error.textContent = message;
    error.hidden = false;
  }

  async function load() {
    try {
      const { passkeys } = await api.passkeys.list();
      render(passkeys);
    } catch (e) {
      if (e?.status !== 401) fail(errorText(e)); // 401 は、ログイン画面へ戻る処理が行う。
    }
  }

  function render(passkeys) {
    summary.textContent = `登録済み: ${passkeys.length} 件（上限 ${MAX_PASSKEYS} 件）`;
    addButton.disabled = passkeys.length >= MAX_PASSKEYS;
    advice.hidden = passkeys.length !== 1;
    advice.textContent = "パスキーが1件だけです。この端末を失うと、ログインできなくなります。別の端末や、セキュリティキーのパスキーも、登録してください。";
    list.textContent = "";
    for (const passkey of passkeys) {
      const card = el("div", undefined, "card blg-card");
      const title = el("h3", passkey.name);
      title.append(" ", el("span", passkey.synced ? "同期あり" : "この端末のみ", "badge"));
      const registered = new Date(passkey.createdAt).toLocaleString("ja-JP");
      const lastUsed = passkey.lastUsedAt ? new Date(passkey.lastUsedAt).toLocaleString("ja-JP") : "まだ使っていません";
      card.append(title, el("p", `登録: ${registered} ／ 最後に使った日時: ${lastUsed}`, "note blg-meta"));
      const row = el("div", undefined, "row");
      const remove = button("削除", () => deletePasskey(passkey), "danger");
      if (passkeys.length <= 1) {
        remove.disabled = true;
        remove.title = "最後の1件は、削除できません";
        row.append(remove, el("span", "最後の1件は、削除できません。", "note"));
      } else {
        row.append(remove);
      }
      card.append(row);
      list.append(card);
    }
  }

  // --- 追加（B9 → 端末の認証 → B10。確認が必要） ---
  async function addPasskey() {
    if (!isPasskeySupported()) {
      fail("この環境では、パスキーを使えません。HTTPS または localhost で開いてください。");
      return;
    }
    addButton.disabled = true;
    say("");
    try {
      await api.passkeys.registerNew();
      say("パスキーを登録しました。");
      await load();
    } catch (e) {
      if (e?.status !== 401 || e?.code === "PASSKEY_VERIFICATION_FAILED") fail(passkeyErrorText(e));
      addButton.disabled = false;
    }
  }

  // --- 削除（B11。確認が必要） ---
  async function deletePasskey(passkey) {
    const ok = await showDialog({
      title: "パスキーを削除",
      body: [
        paragraph(`「${passkey.name}」を削除します。`),
        paragraph("このパスキーでは、ログインできなくなります。端末に残ったパスキーは、サーバから削除できないため、端末のパスキーの管理画面からも削除してください。", "note"),
        paragraph("実行には、あなた（運用担当者）のパスワードの再入力が必要です。", "note"),
      ],
      confirmLabel: "削除する",
      danger: true,
      onConfirm: async () => {
        await api.passkeys.delete(passkey.id);
      },
    });
    if (ok) {
      say(`「${passkey.name}」を削除しました。端末のパスキーの管理画面からも、削除してください。`);
      await load();
    }
  }

  load();
}
