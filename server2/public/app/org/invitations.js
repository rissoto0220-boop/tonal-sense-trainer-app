// 「招待」画面（ApiSpec_Organization.md O12〜O14）。家族を、この組織に招待するメールを送る。
// 招待先のメールアドレスは、サーバに保存されない。個別の招待は区別できないため、取り消しは「すべて」。
import { errorText } from "../common.js";
import { field, paragraph, showDialog } from "./dialog.js";
import { el, button, formatDateTime, createMessages } from "./ui.js";

/**
 * @param {HTMLElement} content 内容の領域
 * @param {{ api: import("../../js/uectst-api/index.js").OrgClient, organization: {name: string} }} context
 */
export function renderInvitations(content, { api, organization }) {
  /** 直前に送った結果（確認ダイアログの中で受け取り、閉じた後に使う） */
  let sent = null;

  content.append(el("h1", "招待"));
  content.append(el("p", `メールアドレスを入力すると、「${organization.name}」への招待メールを送ります。招待された方は、メールのリンクから、この組織に所属して登録できます。`, "note"));

  // --- 未使用の招待 ---
  const pendingCard = el("div", undefined, "card");
  const pendingText = el("p", "");
  const revokeButton = button("未使用の招待をすべて取り消す", revokeAll, "danger");
  revokeButton.disabled = true;
  const pendingRow = el("div", undefined, "row");
  pendingRow.append(revokeButton);
  pendingCard.append(
    el("h2", "未使用の招待", undefined),
    pendingText,
    el("p", "招待の有効期限は、送信から7日です。誰に送ったかは、サーバに残らないため、個別の取り消しはできません（取り消すときは、未使用の招待をすべて取り消します）。", "note"),
    pendingRow,
  );
  pendingCard.querySelector("h2").style.marginTop = "0";

  // --- 送信 ---
  const form = el("form", undefined, "card");
  form.noValidate = true;
  const email = field({ label: "招待するメールアドレス", type: "email", autocomplete: "off", maxLength: 254, hint: "メールアドレスは、保存されません（送信にだけ使います）。送る前に、アドレスをもう一度、確認します。" });
  email.input.inputMode = "email";
  email.input.autocapitalize = "off";
  const sendButton = el("button", "招待メールを送る", "primary");
  sendButton.type = "submit";
  const sendRow = el("div", undefined, "row");
  sendRow.append(sendButton);
  const messages = createMessages();
  const debugLink = el("p", "", "note");
  debugLink.hidden = true;
  form.append(email.node, ...messages.nodes, debugLink, sendRow);

  content.append(form, pendingCard);

  async function loadPending() {
    try {
      const { pendingCount } = await api.invitations.pendingCount();
      pendingText.textContent = `未使用の招待: ${pendingCount} 件`;
      revokeButton.disabled = pendingCount === 0;
      revokeButton.dataset.count = String(pendingCount);
    } catch (e) {
      if (e?.status !== 401) messages.fail(errorText(e));
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    debugLink.hidden = true;
    const address = email.input.value.trim();
    if (address === "" || !address.includes("@") || address.length > 254) {
      messages.fail("メールアドレスの形式が正しくありません。");
      return;
    }
    messages.say("");
    // 送る前に、アドレスを確認する（打ち間違いで、別の人に招待が届くのを防ぐ）。
    const confirmed = await showDialog({
      title: "招待メールを送る",
      body: [paragraph("次のアドレスに、招待メールを送ります。よろしいですか。"), el("p", address, "address")],
      confirmLabel: "送信する",
      onConfirm: async () => {
        const result = await api.invitations.send(address);
        sent = result;
      },
    });
    if (!confirmed || !sent) return;
    const result = sent;
    sent = null;
    email.input.value = "";
    messages.say(`招待メールを送りました（送信元: ${result.sender}）。届かない場合は、迷惑メールフォルダの確認を、お伝えください。有効期限: ${formatDateTime(result.expiresAt)}`);
    // デバッグ状態では、メール表示ページが別タブで開く。開けなかった場合のためのリンクも出す。
    const url = result.debug?.mailViewUrl;
    if (url) {
      debugLink.textContent = "デバッグ: ";
      const a = el("a", "送信したメールを表示");
      a.href = url;
      a.target = "uectst-debug-mail";
      debugLink.append(a);
      debugLink.hidden = false;
    }
    await loadPending();
  });

  async function revokeAll() {
    const count = Number(revokeButton.dataset.count ?? 0);
    let revoked = null;
    const ok = await showDialog({
      title: "未使用の招待をすべて取り消す",
      body: [
        paragraph(`有効期限内で未使用の招待 ${count} 件を、すべて取り消します。`, "warn"),
        paragraph("取り消した招待のリンクは、使えなくなります。個別の取り消しはできません。必要な方には、もう一度、招待メールを送ってください。"),
      ],
      confirmLabel: "取り消す",
      danger: true,
      onConfirm: async () => {
        revoked = await api.invitations.revokeAll();
      },
    });
    if (ok && revoked) {
      messages.say(`未使用の招待 ${revoked.revokedCount} 件を取り消しました。`);
      await loadPending();
    }
  }

  loadPending();
}
