// 登録の画面（本登録・招待ページの新規登録）で共通の部品。
//   - ユーザ名の入力欄（1〜4名）
//   - 復旧コードの表示と控え方（コピー・保存・印刷・「控えました」の確認）
// 画面の側に、次の id の要素があること。
//   ユーザ名: #users, #addUser
//   復旧コード: #recoveryCode, #copy, #save, #print, #copyResult, #saved, #next
import { byId } from "./common.js";

const MAX_USERS = 4;
const MAX_NAME_LENGTH = 20;

/**
 * ユーザ名の入力欄を用意する。最初の1行を、追加しておく。
 * @returns {{ readNames: () => string[]|string }} readNames: 名前の配列。入力に問題があれば、エラーの文章
 */
export function setupUserRows() {
  const rows = () => [...byId("users").querySelectorAll(".userrow")];

  function labelOf(index) {
    return index === 0 ? "1人目（家族の管理をする人）" : `${index + 1}人目`;
  }

  function renumber() {
    rows().forEach((row, index) => {
      row.querySelector("label").textContent = labelOf(index);
      row.querySelector("input").setAttribute("aria-label", labelOf(index));
    });
    byId("addUser").disabled = rows().length >= MAX_USERS;
  }

  function addRow() {
    if (rows().length >= MAX_USERS) return;
    const index = rows().length;
    const row = document.createElement("div");
    row.className = "userrow";
    const label = document.createElement("label");
    const wrapper = document.createElement("div");
    wrapper.style.flex = "1";
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    input.maxLength = 40; // 入力の途中の余裕。20文字の検査は、送信時に行う。
    wrapper.append(label, input);
    row.append(wrapper);
    if (index > 0) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "削除";
      remove.addEventListener("click", () => {
        row.remove();
        renumber();
      });
      row.append(remove);
    }
    byId("users").append(row);
    renumber();
  }

  byId("addUser").addEventListener("click", addRow);
  addRow();

  return {
    readNames() {
      const names = rows().map((row) => row.querySelector("input").value.normalize("NFKC").trim());
      for (const name of names) {
        if (name === "") return "名前が入力されていないユーザがいます。不要な行は、削除してください。";
        if ([...name].length > MAX_NAME_LENGTH) return `名前は${MAX_NAME_LENGTH}文字までです: ${name}`;
      }
      if (new Set(names).size !== names.length) return "同じ名前のユーザがいます。区別できる名前にしてください。";
      return names;
    },
  };
}

/**
 * 復旧コードの表示と控え方の部品を用意する。復旧コードは、表示されたときだけ見られる。
 * 控える前に離れようとしたら、確認する。「控えました」にチェックを付けるまで、「次へ」は押せない。
 * @param {{ showScreen: (name: string) => void, screen?: string }} options screen: 復旧コードを表示する画面の名前（既定: "done"）
 * @returns {{ show: (code: string) => void }}
 */
export function setupRecoveryCodeView({ showScreen, screen = "done" }) {
  let shown = false;
  const currentCode = () => byId("recoveryCode").textContent ?? "";

  function say(text) {
    const el = byId("copyResult");
    el.textContent = text;
    el.hidden = false;
  }

  byId("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(currentCode());
      say("コピーしました。");
    } catch {
      // クリップボードを使えない場合は、コードを選択状態にして、手でコピーしてもらう。
      const range = document.createRange();
      range.selectNodeContents(byId("recoveryCode"));
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      say("自動でコピーできませんでした。選択されているコードを、コピーしてください。");
    }
  });

  byId("save").addEventListener("click", () => {
    const text = `TonalSenseTrainer 復旧コード\r\n\r\n${currentCode()}\r\n\r\n復旧コードと Cookie の両方を失うと、アカウントは復旧できません。他の人に見せないでください。\r\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "tonalsensetrainer-recovery-code.txt";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  byId("print").addEventListener("click", () => window.print());

  const saved = byId("saved");
  const next = byId("next");
  function updateNext() {
    const ok = saved.checked;
    next.setAttribute("aria-disabled", String(!ok));
    next.style.pointerEvents = ok ? "" : "none";
    next.style.opacity = ok ? "" : ".5";
  }
  saved.addEventListener("change", updateNext);
  next.addEventListener("click", (event) => {
    if (!saved.checked) event.preventDefault();
  });
  updateNext();

  window.addEventListener("beforeunload", (event) => {
    if (shown && !saved.checked) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  return {
    show(code) {
      byId("recoveryCode").textContent = code;
      shown = true;
      showScreen(screen);
    },
  };
}
