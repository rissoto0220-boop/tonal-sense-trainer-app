// 本登録の画面（ApiSpec_Auth.md #2・#3、基本方針 3.2・6.1）。
// 本登録のリンクのトークンは、URL のフラグメントにある。読み取ったら、URL から消し、再読み込みに備えて
// タブの sessionStorage に保持する（本登録が完了したら削除する）。
import { api, byId, showScreen, setError } from "../common.js";
import { readFragmentToken, clearFragment } from "../../js/uectst-api/index.js";

const STORAGE_KEY = "uectst.registrationToken";
const MAX_USERS = 4;
const MAX_NAME_LENGTH = 20;

/** @type {string|null} */
let token = null;
let recoveryCodeShown = false;

function storage() {
  try {
    return window.sessionStorage;
  } catch {
    return null; // ストレージを使えないブラウザ設定でも、動くようにする。
  }
}

function findToken() {
  const fromUrl = readFragmentToken();
  if (fromUrl) {
    storage()?.setItem(STORAGE_KEY, fromUrl);
    clearFragment();
    return fromUrl;
  }
  return storage()?.getItem(STORAGE_KEY) ?? null;
}

async function start() {
  token = findToken();
  if (!token) {
    showScreen("noToken");
    return;
  }
  try {
    await api.registration.verify(token);
  } catch (error) {
    if (error?.status === 410) {
      storage()?.removeItem(STORAGE_KEY);
      showScreen("invalid");
    } else {
      byId("invalidMessage").textContent = error?.message ?? "確認できませんでした。";
      showScreen("invalid");
    }
    return;
  }
  addUserRow();
  showScreen("form");
}

// --- ユーザ名の入力 -----------------------------------------------------------

function userRows() {
  return [...byId("users").querySelectorAll(".userrow")];
}

function addUserRow() {
  if (userRows().length >= MAX_USERS) return;
  const index = userRows().length;
  const row = document.createElement("div");
  row.className = "userrow";
  const label = document.createElement("label");
  label.textContent = index === 0 ? "1人目（家族の管理をする人）" : `${index + 1}人目`;
  const wrapper = document.createElement("div");
  wrapper.style.flex = "1";
  const input = document.createElement("input");
  input.type = "text";
  input.autocomplete = "off";
  input.maxLength = 40; // 入力の途中の余裕。20文字の検査は、送信時に行う。
  input.setAttribute("aria-label", label.textContent);
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
  byId("addUser").disabled = userRows().length >= MAX_USERS;
}

function renumber() {
  userRows().forEach((row, index) => {
    const text = index === 0 ? "1人目（家族の管理をする人）" : `${index + 1}人目`;
    row.querySelector("label").textContent = text;
    row.querySelector("input").setAttribute("aria-label", text);
  });
  byId("addUser").disabled = userRows().length >= MAX_USERS;
}

/** @returns {string[]|string} 名前の配列。入力に問題があれば、エラーの文章 */
function readNames() {
  const names = userRows().map((row) => row.querySelector("input").value.normalize("NFKC").trim());
  for (const name of names) {
    if (name === "") return "名前が入力されていないユーザがいます。不要な行は、削除してください。";
    if ([...name].length > MAX_NAME_LENGTH) return `名前は${MAX_NAME_LENGTH}文字までです: ${name}`;
  }
  if (new Set(names).size !== names.length) return "同じ名前のユーザがいます。区別できる名前にしてください。";
  return names;
}

byId("addUser").addEventListener("click", addUserRow);

byId("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const names = readNames();
  if (typeof names === "string") {
    setError("formError", { message: names });
    return;
  }
  setError("formError", null);
  const button = byId("submit");
  button.disabled = true;
  try {
    const result = await api.registration.complete(token, names);
    storage()?.removeItem(STORAGE_KEY); // 本登録が済んだら、トークンを消す。
    token = null;
    showRecoveryCode(result.recoveryCode);
  } catch (error) {
    if (error?.status === 410) {
      storage()?.removeItem(STORAGE_KEY);
      showScreen("invalid");
    } else {
      setError("formError", error);
    }
  } finally {
    button.disabled = false;
  }
});

// --- 復旧コードの表示と控え方 ---------------------------------------------------

function showRecoveryCode(code) {
  byId("recoveryCode").textContent = code;
  recoveryCodeShown = true;
  showScreen("done");
}

function currentCode() {
  return byId("recoveryCode").textContent ?? "";
}

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

// 「控えました」にチェックを付けるまで、次の画面へ進めない。
const savedCheckbox = byId("saved");
const next = byId("next");
function updateNext() {
  const ok = savedCheckbox.checked;
  next.setAttribute("aria-disabled", String(!ok));
  next.style.pointerEvents = ok ? "" : "none";
  next.style.opacity = ok ? "" : ".5";
}
savedCheckbox.addEventListener("change", updateNext);
next.addEventListener("click", (event) => {
  if (!savedCheckbox.checked) event.preventDefault();
});
updateNext();

// 復旧コードは、この画面でしか表示されない。控える前に離れようとしたら、確認する。
window.addEventListener("beforeunload", (event) => {
  if (recoveryCodeShown && !savedCheckbox.checked) {
    event.preventDefault();
    event.returnValue = "";
  }
});

start();
