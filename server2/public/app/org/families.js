// 「家族の管理」画面（運用担当者の組織のみ。ApiSpec_Organization.md O27〜O29）。
// すべての家族の一覧と、所属の解除（O28）・家族の削除（O29）。
// 解除と削除は、パスワードの再確認（O7）が必要。確認が必要なときは、OrgClient の onElevationRequired が、確認のダイアログを出す。
// 運用担当者が見られるのは、家族の ID・所属・ユーザの名前だけ（復旧コード・パスワード・端末のログインは見られない）。
import { errorText } from "../common.js";
import { paragraph, showDialog } from "./dialog.js";
import { el, button, formatDateTime, createMessages } from "./ui.js";

/**
 * @param {HTMLElement} content 内容の領域
 * @param {{ api: import("../../js/uectst-api/index.js").OrgClient }} context
 */
export function renderFamilies(content, { api }) {
  content.append(el("h1", "家族の管理"));
  content.append(el("p", "登録されているすべての家族の一覧です。家族の所属の解除と、家族（アカウント）の削除ができます。どちらも、パスワードの再確認が必要です。", "note"));

  const toolbar = el("div", undefined, "toolbar");
  const summary = el("p", "");
  const search = el("input");
  search.type = "text";
  search.placeholder = "ユーザ名・組織名で絞り込む";
  search.setAttribute("aria-label", "ユーザ名・組織名で絞り込む");
  search.style.maxWidth = "260px";
  const filter = el("select");
  filter.setAttribute("aria-label", "所属で絞り込む");
  for (const [value, label] of [["all", "すべて"], ["member", "組織に所属"], ["individual", "個人ユーザ（所属なし）"]]) {
    const option = el("option", label);
    option.value = value;
    filter.append(option);
  }
  toolbar.append(summary, search, filter);
  const messages = createMessages();
  const list = el("div");
  content.append(toolbar, ...messages.nodes, list);

  /** @type {{id: string, createdAt: string, organization: {id: string, name: string}|null, joinedAt: string|null, users: {id: string, name: string}[]}[]} */
  let families = [];

  async function load() {
    try {
      ({ families } = await api.families.list());
      render();
    } catch (e) {
      if (e?.status !== 401) messages.fail(errorText(e));
    }
  }

  const normalize = (text) => text.normalize("NFKC").toLowerCase();
  const namesOf = (family) => family.users.map((u) => u.name).join("、");

  function render() {
    const keyword = normalize(search.value).trim();
    const shown = families.filter((f) => {
      if (filter.value === "member" && f.organization === null) return false;
      if (filter.value === "individual" && f.organization !== null) return false;
      if (keyword === "") return true;
      return f.users.some((u) => normalize(u.name).includes(keyword)) || normalize(f.organization?.name ?? "").includes(keyword);
    });
    const narrowed = keyword !== "" || filter.value !== "all";
    summary.textContent = narrowed ? `${shown.length} 家族（全 ${families.length} 家族）` : `家族: ${families.length} 家族`;
    list.textContent = "";
    if (families.length === 0) {
      list.append(el("p", "登録されている家族は、まだありません。", "note"));
      return;
    }
    if (shown.length === 0) {
      list.append(el("p", "条件に合う家族は、ありません。", "note"));
      return;
    }
    for (const family of shown) {
      const card = el("div", undefined, "card org-card");
      const names = namesOf(family);
      card.append(el("h3", names === "" ? "（ユーザなし）" : names));
      const where = family.organization === null ? "個人ユーザ（所属なし）" : `${family.organization.name}（${formatDateTime(family.joinedAt)} から）`;
      card.append(el("p", `所属: ${where}`, "note org-meta"));
      card.append(el("p", `登録: ${formatDateTime(family.createdAt)} ／ 家族ID: ${family.id.slice(0, 8)}…（${family.users.length}人）`, "note org-meta"));
      const row = el("div", undefined, "row");
      if (family.organization !== null) row.append(button("所属を解除", () => releaseFamily(family), "danger"));
      row.append(button("家族を削除", () => deleteFamily(family), "danger"));
      card.append(row);
      list.append(card);
    }
  }

  async function releaseFamily(family) {
    const names = namesOf(family);
    const ok = await showDialog({
      title: "所属を解除",
      body: [
        paragraph(`「${names}」の家族を、「${family.organization.name}」の所属から外します。`, "warn"),
        paragraph("家族は、組織に属さない個人ユーザになります。解除した後は、この組織は、この家族のユーザの利用データを参照できなくなります。すでにダウンロードしたデータは、消えません。"),
        paragraph("家族のアカウント自体は、削除されません。", "note"),
      ],
      confirmLabel: "解除する",
      danger: true,
      onConfirm: async () => {
        await api.families.release(family.id);
      },
    });
    if (ok) {
      messages.say(`「${names}」の家族の所属を、解除しました。`);
      await load();
    }
  }

  async function deleteFamily(family) {
    const names = namesOf(family);
    const ok = await showDialog({
      title: "家族を削除",
      body: [
        paragraph(`「${names}」の家族（アカウント）を、削除します。`, "warn"),
        paragraph("家族のユーザ・ログイン・パスキーが削除され、この家族は、アプリを使えなくなります。復旧コードでも、ログインできません。この操作は、取り消せません。"),
        paragraph("利用データ（テスト結果）は、削除されません。運用担当者のみが、参照できます。", "note"),
      ],
      confirmLabel: "削除する",
      danger: true,
      onConfirm: async () => {
        await api.families.delete(family.id);
      },
    });
    if (ok) {
      messages.say(`「${names}」の家族を、削除しました。`);
      await load();
    }
  }

  search.addEventListener("input", render);
  filter.addEventListener("change", render);
  load();
}
