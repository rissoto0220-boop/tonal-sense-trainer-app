// 「所属の管理」画面（運用担当者の所属のみ。ApiSpec_Belonging.md B17〜B21）。
// 一覧、所属の追加（B18）、名前・読み仮名の変更（B19）、パスワードの再発行（B20）、削除（B21）。
// 再発行と削除は、パスワードの再確認（B7）が必要。確認が必要なときは、BlgClient の onElevationRequired が、確認のダイアログを出す。
import { field, paragraph, showDialog } from "./dialog.js";
import { el, button } from "./ui.js";

const LOGIN_ID_PATTERN = /^[a-z0-9._-]{4,64}$/;
const KANA_PATTERN = /^[ぁ-ゖー0-9a-z ]*$/;
const KANA_HINT = "任意。所属名順の並べ替えに使います。ひらがなで入力してください（カタカナは、ひらがなに変換されます）。";

/** 読み仮名を、サーバーと同じ形に正規化する（NFKC、カタカナ→ひらがな、英字は小文字、空白は1つ）。 */
function normalizeKana(text) {
  return text
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** 読み仮名の入力を検査して、正規化した値を返す（空は未登録）。問題があれば、メッセージつきで投げる。 */
function checkedKana(text) {
  const kana = normalizeKana(text);
  if ([...kana].length > 100) throw { message: "読み仮名は、100文字までで入力してください。" };
  if (!KANA_PATTERN.test(kana)) throw { message: "読み仮名は、ひらがな（カタカナ・長音符・英数字・空白も可）で入力してください。漢字や記号は使えません。" };
  return kana;
}

/** 文字コード順の比較（読み仮名・所属名の並べ替え用。ロケールに依存しない） */
function compareCode(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 所属名順: 第1キーが読み仮名、第2キーが所属名の文字コード順。
 * 読み仮名が未登録の所属は、読み仮名のある所属の後ろに、所属名の文字コード順で並べる。
 */
function compareByName(a, b) {
  const aHas = Boolean(a.nameKana);
  const bHas = Boolean(b.nameKana);
  if (aHas !== bHas) return aHas ? -1 : 1;
  return (aHas ? compareCode(a.nameKana, b.nameKana) : 0) || compareCode(a.name, b.name);
}

/**
 * @param {HTMLElement} content 内容の領域
 * @param {{ api: import("../../js/uectst-api/index.js").BlgClient }} context
 */
export function renderBelongings(content, { api }) {
  content.append(el("h1", "所属の管理"));
  content.append(el("p", "所属（運用担当者以外）のログインアカウントを、発行・管理します。所属には、ログインIDと初期パスワードを、安全な方法で伝えてください。", "note"));

  const toolbar = el("div", undefined, "toolbar");
  toolbar.append(button("所属を追加", addBelonging, "primary"));
  const status = el("p", "", "status");
  status.setAttribute("role", "status");

  // 絞り込みと並べ替え（取得済みの一覧に対して、画面の中で行う）
  const filterBar = el("div", undefined, "toolbar");
  const search = el("input");
  search.type = "text";
  search.placeholder = "所属名・読み仮名・ログインIDで絞り込む";
  search.setAttribute("aria-label", "所属名・読み仮名・ログインIDで絞り込む");
  search.style.maxWidth = "320px";
  const sort = el("select");
  sort.setAttribute("aria-label", "並べ替え");
  for (const [value, label] of [["created", "作成が新しい順"], ["name", "所属名順（読み仮名順）"], ["members", "所属している家族が多い順"]]) {
    const option = el("option", label);
    option.value = value;
    sort.append(option);
  }
  const count = el("span", "", "note");
  filterBar.append(search, sort, count);

  const list = el("div");
  content.append(toolbar, filterBar, status, list);

  /** @type {{id: string, name: string, nameKana: string|null, loginId: string, isSuper: boolean, memberFamilyCount: number, createdAt: string}[]} */
  let belongings = [];

  function say(text) {
    status.textContent = text;
  }

  search.addEventListener("input", render);
  sort.addEventListener("change", render);

  async function load() {
    try {
      // 運用担当者の所属（isSuper）は、管理の対象ではないので、一覧に表示しない。
      ({ belongings } = await api.admin.list());
      belongings = belongings.filter((o) => !o.isSuper);
      render();
    } catch (error) {
      if (error?.status !== 401) say(error?.message ?? "一覧を取得できませんでした。"); // 401 は、ログイン画面へ戻る処理が行う。
    }
  }

  /** 絞り込みと並べ替えをした一覧 */
  function visibleBelongings() {
    const keyword = search.value.normalize("NFKC").trim().toLowerCase();
    const matched = belongings.filter((o) => keyword === "" || o.name.normalize("NFKC").toLowerCase().includes(keyword) || (o.nameKana ?? "").includes(normalizeKana(keyword)) || o.loginId.includes(keyword));
    const compare = {
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
      name: compareByName,
      members: (a, b) => b.memberFamilyCount - a.memberFamilyCount || compareByName(a, b),
    }[sort.value];
    return [...matched].sort(compare);
  }

  function render() {
    const shown = visibleBelongings();
    count.textContent = shown.length === belongings.length ? `${belongings.length} 件` : `${shown.length} 件（全 ${belongings.length} 件）`;
    list.textContent = "";
    if (belongings.length === 0) {
      list.append(el("p", "所属がありません。", "note"));
    } else if (shown.length === 0) {
      list.append(el("p", "条件に合う所属は、ありません。", "note"));
    }
    for (const blg of shown) {
      const card = el("div", undefined, "card blg-card");
      const title = el("h3", blg.name);
      const created = new Date(blg.createdAt).toLocaleDateString("ja-JP");
      card.append(title);
      if (blg.nameKana) card.append(el("p", `読み仮名: ${blg.nameKana}`, "note blg-meta"));
      card.append(el("p", `ログインID: ${blg.loginId} ／ 所属している家族: ${blg.memberFamilyCount} ／ 作成: ${created}`, "note blg-meta"));
      const row = el("div", undefined, "row");
      row.append(
        button("名前・読み仮名を変更", () => renameBelonging(blg)),
        button("パスワードを再発行", () => resetPassword(blg)),
        button("削除", () => deleteBelonging(blg), "danger"),
      );
      card.append(row);
      list.append(card);
    }
  }

  /** 初期パスワードを表示する（このとき一度だけ。画面を閉じると、二度と表示できない）。 */
  function showInitialPassword(title, blg, initialPassword) {
    const code = el("div", initialPassword, "initial-password");
    const copy = button("コピー", async () => {
      try {
        await navigator.clipboard.writeText(initialPassword);
        copy.textContent = "コピーしました";
      } catch {
        const range = document.createRange();
        range.selectNodeContents(code);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        copy.textContent = "選択しました。コピーしてください";
      }
    });
    const copyRow = el("div", undefined, "row");
    copyRow.append(copy);
    return showDialog({
      title,
      confirmLabel: "閉じる",
      cancelLabel: null,
      body: [
        paragraph(`所属: ${blg.name}（ログインID: ${blg.loginId}）`),
        paragraph("初期パスワード（この画面でしか表示されません）", "note"),
        code,
        copyRow,
        paragraph("所属の担当者に、安全な方法で伝えてください。担当者は、最初のログインで、パスワードを変更します。", "note"),
      ],
    });
  }

  // --- 追加（B18） ---
  async function addBelonging() {
    const name = field({ label: "所属名", maxLength: 100, hint: "1〜100文字。他の所属と重複できません。招待メールに表示されます。" });
    const kana = field({ label: "読み仮名", maxLength: 100, hint: KANA_HINT });
    const loginId = field({ label: "ログインID", maxLength: 64, autocomplete: "off", hint: "英小文字・数字・ . _ - の4〜64文字。他の所属と重複できません。" });
    let created = null;
    const ok = await showDialog({
      title: "所属を追加",
      body: [name.node, kana.node, loginId.node],
      confirmLabel: "追加する",
      onConfirm: async () => {
        const n = name.input.value.normalize("NFKC").trim();
        const id = loginId.input.value.trim().toLowerCase();
        if (n === "" || [...n].length > 100) throw { message: "所属名は、1〜100文字で入力してください。" };
        const k = checkedKana(kana.input.value);
        if (!LOGIN_ID_PATTERN.test(id)) throw { message: "ログインIDは、英小文字・数字・ . _ - の4〜64文字で入力してください。" };
        created = await api.admin.create(n, id, k);
      },
    });
    if (ok && created) {
      say(`所属「${created.belonging.name}」を追加しました。`);
      await load();
      await showInitialPassword("所属を追加しました", created.belonging, created.initialPassword);
    }
  }

  // --- 名前・読み仮名の変更（B19） ---
  async function renameBelonging(blg) {
    const name = field({ label: "所属名", value: blg.name, maxLength: 100, hint: "変更後の名前は、以降の招待メール・招待ページに表示されます。送信済みの招待メールは、変わりません。" });
    const kana = field({ label: "読み仮名", value: blg.nameKana ?? "", maxLength: 100, hint: KANA_HINT });
    const ok = await showDialog({
      title: "名前・読み仮名を変更",
      body: [paragraph(`ログインID: ${blg.loginId}`, "note"), name.node, kana.node],
      confirmLabel: "変更する",
      onConfirm: async () => {
        const n = name.input.value.normalize("NFKC").trim();
        if (n === "" || [...n].length > 100) throw { message: "所属名は、1〜100文字で入力してください。" };
        const k = checkedKana(kana.input.value);
        const changes = {};
        if (n !== blg.name) changes.name = n;
        if (k !== (blg.nameKana ?? "")) changes.nameKana = k;
        if (Object.keys(changes).length === 0) throw { message: "変更がありません。" };
        await api.admin.update(blg.id, changes);
      },
    });
    if (ok) {
      say("所属名・読み仮名を変更しました。");
      await load();
    }
  }

  // --- パスワードの再発行（B20。確認が必要） ---
  async function resetPassword(blg) {
    let result = null;
    const ok = await showDialog({
      title: "パスワードを再発行",
      body: [
        paragraph(`「${blg.name}」の新しい初期パスワードを発行します。`),
        paragraph("現在のパスワードは使えなくなり、この所属のログイン中の端末は、すべてログアウトされます。", "warn"),
        paragraph("実行には、あなた（運用担当者）のパスワードの再入力が必要です。", "note"),
      ],
      confirmLabel: "再発行する",
      danger: true,
      onConfirm: async () => {
        result = await api.admin.resetPassword(blg.id);
      },
    });
    if (ok && result) {
      say(`「${blg.name}」のパスワードを再発行しました。`);
      await showInitialPassword("パスワードを再発行しました", blg, result.initialPassword);
    }
  }

  // --- 削除（B21。確認が必要） ---
  async function deleteBelonging(blg) {
    const confirmName = field({ label: `確認のため、所属名「${blg.name}」を入力してください`, maxLength: 100 });
    let result = null;
    const ok = await showDialog({
      title: "所属を削除",
      body: [
        paragraph(`「${blg.name}」を削除します。この操作は取り消せません。`, "warn"),
        paragraph(`所属している ${blg.memberFamilyCount} 家族は、どこにも所属しない個人ユーザになります。利用データ（テスト結果）は削除されず、運用担当者だけが参照できます。この所属のログインアカウント・パスキー・未使用の招待は削除されます。`),
        paragraph("実行には、あなた（運用担当者）のパスワードの再入力が必要です。", "note"),
        confirmName.node,
      ],
      confirmLabel: "削除する",
      danger: true,
      onConfirm: async () => {
        if (confirmName.input.value.normalize("NFKC").trim() !== blg.name) throw { message: "所属名が一致しません。" };
        result = await api.admin.delete(blg.id);
      },
    });
    if (ok && result) {
      say(`「${blg.name}」を削除しました（所属していた ${result.releasedFamilyCount} 家族は、個人ユーザになりました）。`);
      await load();
    }
  }

  load();
}
