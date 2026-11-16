// 運用担当者・組織のログインの画面と、ログイン後の枠（ApiSpec_Organization.md O1〜O6・O9・O10・O2・O3・O4・O5）。
// ログインの段階に応じて、1つのページで画面を切り替える。
//   パスワード(O1) → [初回: パスワードの変更(O6)] → [運用担当者のみ: パスキーの登録(O9・O10)または確認(O2・O3)] → ログイン後の枠
// ログイン後は、左にメニュー、右に内容を表示する。メニューの項目は、運用担当者（isSuper）かどうかで変わる。
// 各メニューの画面は、順に実装する（render を持つ項目は実装済み。まだの項目は「準備中」を表示する）。
import { API_BASE_PATH, byId, showScreen, setError } from "../common.js";
import { OrgClient, isPasskeySupported } from "../../js/uectst-api/index.js";
import { field, paragraph, showDialog } from "./dialog.js";
import { renderOrganizations } from "./organizations.js";
import { renderAccount } from "./account.js";
import { renderPasskeys } from "./passkeys.js";
import { renderInvitations } from "./invitations.js";
import { renderMembers } from "./members.js";
import { renderFamilies } from "./families.js";

// 組織の API は、家族の API とは別の Cookie・別のパス（…/api/v1/org）を使う。
// ログイン後に 401 UNAUTHENTICATED（期限切れなど）になったら、ログイン画面へ戻す。
// 破壊的な操作（パスワードの再発行・組織の削除など）で確認が必要になったら、パスワードの再入力を求める（O7）。成功したら、操作を自動でやり直す。
const api = new OrgClient({
  basePath: API_BASE_PATH + "/org",
  onUnauthenticated: () => {
    loggedIn = null;
    gate("login");
  },
  onElevationRequired: () => askElevationPassword(),
});

function askElevationPassword() {
  const password = field({ label: "あなたのパスワード", type: "password", autocomplete: "current-password" });
  return showDialog({
    title: "パスワードの再確認",
    body: [paragraph("取り消せない操作のため、パスワードを再入力してください（5分間、有効です）。", "note"), password.node],
    confirmLabel: "確認する",
    onConfirm: async () => {
      await api.account.elevate(password.input.value);
    },
  });
}

/** ログイン後の状態（{ organization, session }）。未ログインなら null */
let loggedIn = null;

/** ログイン前の画面（ログイン・パスワード変更・パスキー）を表示する。ログイン後の枠は隠す。 */
function gate(name) {
  byId("gate").hidden = false;
  byId("shell").hidden = true;
  showScreen(name);
}

// --- メニューの定義 ----------------------------------------------------------
// superOnly: 運用担当者の組織だけに表示する。メニューを隠すのは、見た目のためだけで、権限の確認はサーバが行う（403 SUPER_ONLY）。
// api: 準備中の画面に、その項目で使う API を表示する（実装の目印）。
const MENU = [
  { id: "home", label: "ホーム" },
  { id: "invitations", label: "招待", api: "O12〜O14", render: renderInvitations },
  { id: "members", label: "所属している家族", api: "O15・O16", render: renderMembers },
  {
    id: "testdata",
    label: "利用データ",
    api: "O22〜O25",
    about: (org) => (org.isSuper ? "すべてのユーザの利用データ（テスト結果）の閲覧と、CSV・ZIP のダウンロード。" : "この組織に所属している家族のユーザの、利用データ（テスト結果）の閲覧と、CSV・ZIP のダウンロード。"),
    note: (org) => (org.isSuper ? "セッションの削除（O26）は、各セッションの詳細画面に表示します（運用担当者のみ、パスワードの再確認が必要）。" : null),
  },
  { id: "families", label: "家族の管理", superOnly: true, api: "O27〜O29", render: renderFamilies },
  { id: "organizations", label: "組織の管理", superOnly: true, api: "O17〜O21", render: renderOrganizations },
  { id: "passkeys", label: "パスキーの管理", superOnly: true, api: "O8〜O11", render: renderPasskeys },
  { id: "account", label: "アカウント", api: "O6", render: renderAccount },
];

/** この組織が使えるメニュー項目 */
function menuFor(organization) {
  return MENU.filter((item) => !item.superOnly || organization.isSuper);
}

/** URL のフラグメント（#invitations など）から、表示する項目を決める。使えない項目・不明な項目は、ホーム。 */
function currentMenuId(organization) {
  const id = location.hash.replace(/^#\/?/, "");
  return menuFor(organization).some((item) => item.id === id) ? id : "home";
}

// --- ログイン後の枠 -----------------------------------------------------------

function renderShell() {
  const { organization } = loggedIn;
  byId("shellOrgName").textContent = organization.name;
  const badge = byId("shellBadge");
  badge.textContent = organization.isSuper ? "運用担当者" : "組織";
  badge.classList.toggle("super", organization.isSuper);

  const list = byId("menuList");
  list.textContent = "";
  for (const item of menuFor(organization)) {
    if (item.id === "organizations") {
      const group = document.createElement("li");
      group.className = "group";
      group.textContent = "運用担当者のみ";
      list.append(group);
    }
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `#${item.id}`;
    a.textContent = item.label;
    a.dataset.menuId = item.id;
    li.append(a);
    list.append(li);
  }
  renderContent();
}

function renderContent() {
  if (!loggedIn) return;
  const { organization } = loggedIn;
  const id = currentMenuId(organization);
  for (const a of byId("menuList").querySelectorAll("a")) {
    if (a.dataset.menuId === id) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  const content = byId("content");
  content.textContent = "";
  const item = MENU.find((entry) => entry.id === id);
  if (id === "home") renderHome(content);
  else if (item.render) item.render(content, { api, organization });
  else renderComingSoon(content, item);
  closeMenu();
  document.title = `${MENU.find((item) => item.id === id).label} - 組織（仮）`;
}

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function renderHome(content) {
  const { organization, session } = loggedIn;
  content.append(el("h1", "ホーム"));
  const card = el("div", undefined, "card");
  const dl = el("dl", undefined, "kv");
  const rows = [
    ["組織名", organization.name],
    ["ログインID", organization.loginId],
    ["種類", organization.isSuper ? "運用担当者（全ユーザの利用データを参照でき、組織を管理できます）" : "組織"],
    ["ログインの期限", session ? new Date(session.expiresAt).toLocaleString("ja-JP") : ""],
  ];
  for (const [label, value] of rows) {
    dl.append(el("dt", label), el("dd", value));
  }
  card.append(dl);
  content.append(card);
  content.append(el("p", "左のメニューから、操作を選んでください。", "note"));
  const usable = menuFor(organization).filter((item) => item.id !== "home").map((item) => item.label);
  content.append(el("p", `使える機能: ${usable.join("、")}`, "note"));
}

function renderComingSoon(content, item) {
  const { organization } = loggedIn;
  content.append(el("h1", item.label));
  const card = el("div", undefined, "card soon");
  const about = typeof item.about === "function" ? item.about(organization) : item.about;
  card.append(el("p", about));
  const note = item.note ? item.note(organization) : null;
  if (note) card.append(el("p", note, "note"));
  card.append(el("p", `この画面は、今後実装します。（使う API: ${item.api}）`, "note"));
  content.append(card);
}

// --- メニューの開閉（狭い画面） ------------------------------------------------

function setMenuOpen(open) {
  byId("menu").classList.toggle("open", open);
  byId("menuBackdrop").hidden = !open;
  byId("menuToggle").setAttribute("aria-expanded", String(open));
}
function closeMenu() {
  setMenuOpen(false);
}
byId("menuToggle").addEventListener("click", () => setMenuOpen(!byId("menu").classList.contains("open")));
byId("menuBackdrop").addEventListener("click", closeMenu);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu();
});
window.addEventListener("hashchange", renderContent);

// ログイン直後（O1）の応答で分かった、パスキーの登録の有無。パスワードの変更の後の画面の判断に使う。
let knownPasskeyRegistered = null;

/**
 * ログイン状態から、次に出す画面を決める。
 * @param {{organization: object, authStage: number}} state
 * @param {boolean|null} passkeyRegistered 運用担当者でパスキーの登録の有無が分かっていれば true/false。分からなければ null
 */
function route(state, passkeyRegistered = null) {
  const { organization, authStage } = state;
  if (organization.passwordChangeRequired) {
    gate("passwordChange");
    return;
  }
  if (authStage === 0) {
    // パスキーの登録の有無は、ログイン直後（O1）の応答でだけ分かる。再読み込み後は、確認の開始（O2）が 404 なら、登録に進む。
    if (passkeyRegistered === false) gate("passkeyRegister");
    else gate("passkeyVerify");
    return;
  }
  showShell(state);
}

async function showShell({ organization, session }) {
  // ログイン直後（O1）や、パスキーの完了（O3）の応答には、セッションの期限が含まれない。ホームに期限を出すため、取得する。
  if (!session) {
    try {
      session = (await api.sessions.current()).session;
    } catch {
      return; // 401 のときは、onUnauthenticated がログイン画面へ戻す。
    }
  }
  loggedIn = { organization, session };
  byId("gate").hidden = true;
  byId("shell").hidden = false;
  renderShell();
  byId("content").focus();
}

async function start() {
  try {
    const current = await api.sessions.current();
    route({ organization: current.organization, authStage: current.session.authStage, session: current.session });
  } catch (error) {
    if (error?.status === 401) {
      gate("login");
    } else {
      byId("loadError").textContent = error?.message ?? "読み込めませんでした。";
      gate("error");
    }
  }
}

// --- ログイン（O1） ----------------------------------------------------------

byId("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const loginId = byId("loginId").value.trim();
  const password = byId("password").value;
  if (loginId === "" || password === "") {
    setError("loginError", { message: "ログインIDとパスワードを入力してください。" });
    return;
  }
  setError("loginError", null);
  const button = event.submitter ?? byId("loginForm").querySelector("button");
  button.disabled = true;
  try {
    const result = await api.sessions.login(loginId, password);
    // 初回ログインの「現在のパスワード」に使えるよう、入力欄に引き継ぐ（画面を閉じれば消える）。
    byId("currentPassword").value = result.organization.passwordChangeRequired ? password : "";
    byId("password").value = "";
    knownPasskeyRegistered = result.passkeyRegistered;
    route({ organization: result.organization, authStage: result.authStage }, result.passkeyRegistered);
  } catch (error) {
    setError("loginError", error);
  } finally {
    button.disabled = false;
  }
});

// --- パスワードの変更（O6） --------------------------------------------------

byId("passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const current = byId("currentPassword").value;
  const next = byId("newPassword").value;
  if ([...next].length < 12 || [...next].length > 128) {
    setError("passwordError", { message: "新しいパスワードは、12〜128文字にしてください。" });
    return;
  }
  if (next !== byId("newPassword2").value) {
    setError("passwordError", { message: "新しいパスワードが、確認の入力と一致しません。" });
    return;
  }
  setError("passwordError", null);
  const button = event.submitter ?? byId("passwordForm").querySelector("button");
  button.disabled = true;
  try {
    await api.account.changePassword(current, next);
    for (const id of ["currentPassword", "newPassword", "newPassword2"]) byId(id).value = "";
    // 変更後の段階は、サーバに聞き直す（運用担当者なら、続けてパスキー）。
    const state = await api.sessions.current();
    route({ organization: state.organization, authStage: state.session.authStage, session: state.session }, knownPasskeyRegistered);
  } catch (error) {
    setError("passwordError", error);
  } finally {
    button.disabled = false;
  }
});

// --- パスキーの確認（O2・O3）・登録（O9・O10） --------------------------------

function passkeyErrorText(error) {
  if (error?.name === "NotAllowedError") return "パスキーの操作が、キャンセルされました。";
  return error;
}

byId("verifyButton").addEventListener("click", async () => {
  if (!isPasskeySupported()) {
    setError("verifyError", { message: "この環境では、パスキーを使えません。HTTPS または localhost で開いてください。" });
    return;
  }
  setError("verifyError", null);
  const button = byId("verifyButton");
  button.disabled = true;
  try {
    const result = await api.sessions.loginWithPasskey();
    const state = await api.sessions.current();
    route({ organization: result.organization, authStage: result.authStage, session: state.session });
  } catch (error) {
    if (error?.status === 404) {
      gate("passkeyRegister"); // パスキーが1件もない（再読み込みの後など）。登録に進む。
    } else {
      const shown = passkeyErrorText(error);
      setError("verifyError", typeof shown === "string" ? { message: shown } : shown);
    }
  } finally {
    button.disabled = false;
  }
});

byId("registerButton").addEventListener("click", async () => {
  if (!isPasskeySupported()) {
    setError("registerError", { message: "この環境では、パスキーを使えません。HTTPS または localhost で開いてください。" });
    return;
  }
  setError("registerError", null);
  const button = byId("registerButton");
  button.disabled = true;
  try {
    await api.passkeys.registerNew();
    const state = await api.sessions.current();
    route({ organization: state.organization, authStage: state.session.authStage, session: state.session });
  } catch (error) {
    const shown = passkeyErrorText(error);
    setError("registerError", typeof shown === "string" ? { message: shown } : shown);
  } finally {
    button.disabled = false;
  }
});

// --- ログアウト（O5） --------------------------------------------------------

byId("logout").addEventListener("click", async () => {
  try {
    await api.sessions.logout();
    loggedIn = null;
    history.replaceState(null, "", location.pathname); // #invitations などを消す
    gate("login");
  } catch (error) {
    window.alert(error?.message ?? "ログアウトできませんでした。");
  }
});

start();
