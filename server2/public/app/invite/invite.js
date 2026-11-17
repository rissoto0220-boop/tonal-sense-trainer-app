// 招待ページ（ApiSpec_Auth.md #3 招待経由の本登録・#28 照合・#30 所属、基本方針 11.）。
// 招待メールのリンク（…/invite#token=…）のトークンは、URL のフラグメントにある。読み取ったら、URL から消し、
// 再読み込みに備えて、タブの sessionStorage に保持する（登録・所属が完了したら削除する）。
// 照合は、データベースを変更しない。リンクを開いただけでは、招待は使われない。
import { api, byId, showScreen, setError } from "../common.js";
import { setupUserRows, setupRecoveryCodeView } from "../registration-ui.js";
import { field, paragraph, showDialog } from "../console/dialog.js";
import { readFragmentToken, clearFragment, RecoveryCode } from "../../js/uectst-api/index.js";

const STORAGE_KEY = "uectst.invitationToken";

/** @type {string|null} */
let token = null;
let belongingName = "";
/** @type {object|null} 所属の追加で使う、ログイン中の家族 */
let family = null;

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

function forgetToken() {
  storage()?.removeItem(STORAGE_KEY);
  token = null;
}

function showInvalid(message) {
  if (message) byId("invalidMessage").textContent = message;
  showScreen("invalid");
}

const userRows = setupUserRows();
const recoveryCodeView = setupRecoveryCodeView({ showScreen });

async function start() {
  token = findToken();
  if (!token) {
    showScreen("noToken");
    return;
  }
  try {
    const info = await api.membership.verifyInvitation(token);
    belongingName = info.belongingName;
    byId("blgName").textContent = belongingName;
    byId("expiresAt").textContent = new Date(info.expiresAt).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
    for (const el of document.querySelectorAll(".blgNameCopy")) el.textContent = `「${belongingName}」`;
    showScreen("intro");
  } catch (error) {
    if (error?.status === 410) {
      forgetToken();
      showInvalid();
    } else {
      showInvalid(error?.message ?? "確認できませんでした。");
    }
  }
}

// --- 選択 -----------------------------------------------------------------------

byId("chooseNew").addEventListener("click", () => showScreen("form"));
byId("backFromForm").addEventListener("click", () => showScreen("intro"));
byId("chooseJoin").addEventListener("click", startJoin);
byId("backFromLogin").addEventListener("click", () => showScreen("intro"));
byId("backFromJoin").addEventListener("click", () => showScreen("intro"));

// --- 新しく登録する（基本方針 11.3） ---------------------------------------------

byId("agree").addEventListener("change", () => {
  byId("submit").disabled = !byId("agree").checked;
});

byId("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!byId("agree").checked) return;
  const names = userRows.readNames();
  if (typeof names === "string") {
    setError("formError", { message: names });
    return;
  }
  setError("formError", null);
  const button = byId("submit");
  button.disabled = true;
  try {
    const result = await api.registration.completeWithInvitation(token, names);
    forgetToken(); // 登録が済んだら、トークンを消す。
    recoveryCodeView.show(result.recoveryCode);
  } catch (error) {
    if (error?.status === 410) {
      forgetToken();
      showInvalid();
    } else {
      setError("formError", error);
      button.disabled = !byId("agree").checked;
    }
  }
});

// --- 登録済みの家族に所属を追加する（基本方針 11.4） -------------------------------

async function startJoin() {
  try {
    family = (await api.sessions.current()).family;
  } catch (error) {
    if (error?.status === 401) {
      setError("loginError", null);
      showScreen("login"); // この端末でログインしていなければ、復旧コードでログインする。
      return;
    }
    byId("loadError").textContent = error?.message ?? "読み込めませんでした。";
    showScreen("error");
    return;
  }
  showJoin();
}

const code = byId("code");
code.addEventListener("blur", () => {
  code.value = RecoveryCode.format(code.value);
});

byId("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const normalized = RecoveryCode.normalize(code.value);
  if (RecoveryCode.validate(normalized) !== null) {
    setError("loginError", { message: "入力ミスがあります。もう一度確かめてください。" });
    return;
  }
  setError("loginError", null);
  const button = byId("loginSubmit");
  button.disabled = true;
  try {
    await api.sessions.login(RecoveryCode.format(normalized));
    await startJoin();
  } catch (error) {
    setError("loginError", error);
  } finally {
    button.disabled = false;
  }
});

/** 現在の所属に応じて、確認の内容を出す。 */
function showJoin() {
  const current = family.belonging;
  const same = current?.name === belongingName;
  const warn = byId("joinWarn");
  warn.hidden = !current || same;
  if (current && !same) {
    warn.textContent = `現在の所属「${current.name}」から、この所属に移ります。現在の所属は、あなたの家族のデータを見られなくなります。`;
  }
  byId("alreadyMember").hidden = !same;
  byId("joinSubmit").disabled = same;
  setError("joinError", null);
  showScreen("join");
}

// 重要な操作の確認（ApiSpec_Auth.md 0.4）。パスワードが未設定の家族は、復旧コードで確認する。
function confirmElevation() {
  const usesPassword = family?.superuserPasswordSet === true;
  const secret = usesPassword
    ? field({ label: "スーパーユーザのパスワード", type: "password", autocomplete: "current-password" })
    : field({ label: "復旧コード" });
  return showDialog({
    title: "確認",
    body: [paragraph("この操作には確認が必要です。"), secret.node],
    confirmLabel: "確認",
    onConfirm: async () => {
      if (usesPassword) {
        await api.account.elevateWithPassword(secret.input.value);
      } else {
        await api.account.elevateWithRecoveryCode(secret.input.value);
      }
    },
  });
}

api.http.onElevationRequired = confirmElevation;

byId("joinSubmit").addEventListener("click", async () => {
  setError("joinError", null);
  const button = byId("joinSubmit");
  button.disabled = true;
  try {
    await api.membership.join(token);
    forgetToken();
    showScreen("joined");
  } catch (error) {
    if (error?.status === 410) {
      forgetToken();
      showInvalid();
    } else if (error?.code === "ALREADY_MEMBER") {
      family.belonging = { name: belongingName };
      showJoin(); // すでに所属している。招待は使われない。
    } else {
      setError("joinError", error?.code === "ELEVATION_REQUIRED" ? { message: "確認が完了しなかったため、所属していません。" } : error);
      button.disabled = false;
    }
  }
});

start();
