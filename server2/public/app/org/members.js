// 「所属している家族」画面（ApiSpec_Organization.md O15・O16）。この組織に所属している家族の一覧と、所属から外す操作。
// 組織が見られるのは、家族の ID・所属日時・ユーザの名前だけ（復旧コード・パスワード・端末のログインは見られない）。
import { errorText } from "../common.js";
import { paragraph, showDialog } from "./dialog.js";
import { el, button, formatDateTime, createMessages } from "./ui.js";

/**
 * @param {HTMLElement} content 内容の領域
 * @param {{ api: import("../../js/uectst-api/index.js").OrgClient, organization: {name: string} }} context
 */
export function renderMembers(content, { api, organization }) {
  content.append(el("h1", "所属している家族"));
  content.append(el("p", `「${organization.name}」に、現在所属している家族の一覧です。家族は、招待メールのリンクから登録するか、登録済みの方が所属すると、ここに表示されます。`, "note"));

  const toolbar = el("div", undefined, "toolbar");
  const summary = el("p", "");
  const search = el("input");
  search.type = "text";
  search.placeholder = "ユーザ名で絞り込む";
  search.setAttribute("aria-label", "ユーザ名で絞り込む");
  search.style.maxWidth = "260px";
  toolbar.append(summary, search);
  const messages = createMessages();
  const list = el("div");
  content.append(toolbar, ...messages.nodes, list);

  /** @type {{id: string, joinedAt: string, users: {id: string, name: string}[]}[]} */
  let families = [];

  async function load() {
    try {
      ({ families } = await api.invitations.members());
      render();
    } catch (e) {
      if (e?.status !== 401) messages.fail(errorText(e));
    }
  }

  function render() {
    const keyword = search.value.normalize("NFKC").trim().toLowerCase();
    const shown = keyword === "" ? families : families.filter((f) => f.users.some((u) => u.name.normalize("NFKC").toLowerCase().includes(keyword)));
    summary.textContent = keyword === "" ? `所属している家族: ${families.length} 家族` : `${shown.length} 家族（全 ${families.length} 家族）`;
    list.textContent = "";
    if (families.length === 0) {
      list.append(el("p", "所属している家族は、まだありません。「招待」から、招待メールを送ってください。", "note"));
      return;
    }
    if (shown.length === 0) {
      list.append(el("p", "条件に合う家族は、ありません。", "note"));
      return;
    }
    for (const family of shown) {
      const card = el("div", undefined, "card org-card");
      const names = family.users.map((u) => u.name).join("、");
      card.append(el("h3", names === "" ? "（ユーザなし）" : names));
      card.append(el("p", `所属: ${formatDateTime(family.joinedAt)} ／ 家族ID: ${family.id.slice(0, 8)}…（${family.users.length}人）`, "note org-meta"));
      const row = el("div", undefined, "row");
      row.append(button("所属から外す", () => removeFamily(family, names), "danger"));
      card.append(row);
      list.append(card);
    }
  }

  async function removeFamily(family, names) {
    const ok = await showDialog({
      title: "所属から外す",
      body: [
        paragraph(`「${names}」の家族を、この組織の所属から外します。`, "warn"),
        paragraph("家族は、組織に属さない個人ユーザになります。外した後は、この家族のユーザの利用データを、この組織から参照できなくなります。すでにダウンロードしたデータは、消えません。"),
        paragraph("家族のアカウント自体は、削除されません。もう一度所属するには、招待メールを送り直します。", "note"),
      ],
      confirmLabel: "外す",
      danger: true,
      onConfirm: async () => {
        await api.invitations.removeMember(family.id);
      },
    });
    if (ok) {
      messages.say(`「${names}」の家族を、所属から外しました。`);
      await load();
    }
  }

  search.addEventListener("input", render);
  load();
}
