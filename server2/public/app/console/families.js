// 「家族の管理」画面（運用担当者の所属のみ。ApiSpec_Belonging.md B27〜B29）。
// すべての家族の一覧と、所属の解除（B28）・家族の削除（B29）。
// 解除と削除は、パスワードの再確認（B7）が必要。確認が必要なときは、BlgClient の onElevationRequired が、確認のダイアログを出す。
// 運用担当者が見られるのは、家族の ID・所属・ユーザの名前だけ（復旧コード・パスワード・端末のログインは見られない）。
import { errorText } from "../common.js";
import { paragraph, showDialog } from "./dialog.js";
import { el, button, formatDateTime, createMessages } from "./ui.js";

/**
 * @param {HTMLElement} content 内容の領域
 * @param {{ api: import("../../js/uectst-api/index.js").BlgClient }} context
 */
export function renderFamilies(content, { api }) {
  content.append(el("h1", "家族の管理"));
  content.append(el("p", "登録されているすべての家族の一覧です。家族の所属の解除と、家族（アカウント）の削除ができます。どちらも、パスワードの再確認が必要です。", "note"));

  const toolbar = el("div", undefined, "toolbar");
  const summary = el("p", "");
  const search = el("input");
  search.type = "text";
  search.placeholder = "ユーザ名で絞り込む";
  search.setAttribute("aria-label", "ユーザ名で絞り込む");
  search.style.maxWidth = "260px";
  // 所属先で絞り込む。「すべて」「所属なし」と、家族が所属先の名前（読み込んだ家族から作る）
  const filter = el("select");
  filter.setAttribute("aria-label", "所属先で絞り込む");
  toolbar.append(summary, search, filter);
  const messages = createMessages();
  const list = el("div");
  content.append(toolbar, ...messages.nodes, list);

  /** @type {{id: string, createdAt: string, belonging: {id: string, name: string}|null, joinedAt: string|null, users: {id: string, name: string}[]}[]} */
  let families = [];

  async function load() {
    try {
      ({ families } = await api.families.list());
      renderFilterOptions();
      render();
    } catch (e) {
      if (e?.status !== 401) messages.fail(errorText(e));
    }
  }

  const normalize = (text) => text.normalize("NFKC").toLowerCase();
  const namesOf = (family) => family.users.map((u) => u.name).join("、");

  const ALL = "all";
  const NONE = "none";

  /** 絞り込みの選択肢を作り直す（選択中の値は、残っていれば保つ） */
  function renderFilterOptions() {
    const selected = filter.value || ALL;
    const counts = new Map();
    let noneCount = 0;
    for (const f of families) {
      if (f.belonging === null) noneCount++;
      else counts.set(f.belonging.id, { name: f.belonging.name, count: (counts.get(f.belonging.id)?.count ?? 0) + 1 });
    }
    const belongings = [...counts.entries()].sort((a, b) => (a[1].name < b[1].name ? -1 : a[1].name > b[1].name ? 1 : 0));
    filter.textContent = "";
    const add = (value, label) => {
      const option = el("option", label);
      option.value = value;
      filter.append(option);
    };
    add(ALL, `所属先: すべて（${families.length}）`);
    add(NONE, `所属なし（${noneCount}）`);
    for (const [id, { name, count }] of belongings) add(id, `${name}（${count}）`);
    filter.value = [...filter.options].some((o) => o.value === selected) ? selected : ALL;
  }

  function render() {
    const keyword = normalize(search.value).trim();
    const shown = families.filter((f) => {
      if (filter.value === NONE && f.belonging !== null) return false;
      if (filter.value !== ALL && filter.value !== NONE && f.belonging?.id !== filter.value) return false;
      if (keyword === "") return true;
      return f.users.some((u) => normalize(u.name).includes(keyword));
    });
    const narrowed = keyword !== "" || filter.value !== ALL;
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
      const card = el("div", undefined, "card blg-card");
      const names = namesOf(family);
      card.append(el("h3", names === "" ? "（ユーザなし）" : names));
      const where = family.belonging === null ? "所属なし（個人ユーザ）" : `${family.belonging.name}（${formatDateTime(family.joinedAt)} から）`;
      const blg = el("p", "", "blg-meta");
      blg.append("所属先: ", el("strong", where));
      card.append(blg);
      card.append(el("p", `登録: ${formatDateTime(family.createdAt)} ／ 家族ID: ${family.id.slice(0, 8)}…（${family.users.length}人）`, "note blg-meta"));
      const row = el("div", undefined, "row");
      if (family.belonging !== null) row.append(button("所属を解除", () => releaseFamily(family), "danger"));
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
        paragraph(`「${names}」の家族を、「${family.belonging.name}」の所属から外します。`, "warn"),
        paragraph("家族は、どこにも所属しない個人ユーザになります。解除した後は、この所属は、この家族のユーザの利用データを参照できなくなります。すでにダウンロードしたデータは、消えません。"),
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
