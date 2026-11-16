// 家族・ユーザのホーム（仮実装）。表示の流れは、ユーザの選択 → そのユーザのホーム。
// スーパーユーザのホームからは、家族の編集（ユーザの追加・名前の変更・削除）へ進める。
// ユーザの切り替えにロックはかけない（基本方針 5.）。起動時は、前回選択したユーザがいても、必ず選択から始める。
import { api, byId, showScreen, setError } from "./common.js";
import { field, paragraph, showDialog } from "./org/dialog.js";

const MAX_USERS = 4;
const MAX_NAME_LENGTH = 20;
const TEST_MENU = ["絶対音感テスト", "相対音感テスト", "調性感テスト", "調性感訓練"];

/** @type {object|null} ログイン中の家族（ApiSpec_Auth.md 0.8） */
let family = null;
/** @type {string|null} ホームを表示中のユーザ */
let currentUserId = null;

function currentUser() {
  return family.users.find((user) => user.id === currentUserId) ?? null;
}

function renderUserChoices() {
  const choices = byId("userChoices");
  choices.textContent = "";
  for (const user of family.users) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = user.name;
    button.addEventListener("click", () => selectUser(user.id));
    choices.append(button);
  }
}

// 所属している組織の名前（所属していなければ「なし」）
function renderOrganization() {
  const text = family.organization?.name ?? "なし";
  for (const el of document.querySelectorAll(".orgLabel")) el.textContent = text;
}

function showUserSelection() {
  currentUserId = null;
  setError("selectError", null);
  renderUserChoices();
  showScreen("select");
}

async function selectUser(userId) {
  setError("selectError", null);
  try {
    await api.sessions.selectUser(userId);
    currentUserId = userId;
    showHome();
  } catch (error) {
    setError("selectError", error);
  }
}

function showHome() {
  const user = currentUser();
  byId("homeTitle").textContent = `${user.name}さんのホーム`;
  byId("familyEditArea").hidden = !user.isSuperuser;
  showScreen("home");
}

// テストや訓練の画面は、まだユーザと紐付いていないため、遷移先が決まるまでは案内だけ表示する。
function renderTestMenu() {
  const menu = byId("menu");
  for (const name of TEST_MENU) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary";
    button.textContent = name;
    button.addEventListener("click", () => showDialog({
      title: name,
      body: [paragraph("この画面は準備中です。")],
      cancelLabel: null,
    }));
    menu.append(button);
  }
}

function renderFamilyUsers() {
  const list = byId("familyUsers");
  list.textContent = "";
  for (const user of family.users) {
    const card = document.createElement("div");
    card.className = "card family-user";
    const name = document.createElement("span");
    name.className = "family-user-name";
    name.textContent = user.name;
    if (user.isSuperuser) {
      const badge = document.createElement("span");
      badge.className = "badge super";
      badge.textContent = "代表者";
      name.append(" ", badge);
    }
    const rename = document.createElement("button");
    rename.type = "button";
    rename.textContent = "名前を変更";
    rename.addEventListener("click", () => renameUser(user));
    card.append(name, rename);
    // スーパーユーザは削除できない（ApiSpec_Auth.md 5.5）
    if (!user.isSuperuser) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "削除";
      remove.addEventListener("click", () => deleteUser(user));
      card.append(remove);
    }
    list.append(card);
  }
  const isFull = family.users.length >= MAX_USERS;
  byId("addUser").disabled = isFull;
  byId("limitNote").hidden = !isFull;
  byId("limitNote").textContent = `ユーザは最大${MAX_USERS}名です。`;
}

async function reloadUsers() {
  const { users } = await api.users.list();
  family.users = users;
  renderFamilyUsers();
}

function addUser() {
  const name = field({ label: "ユーザ名", maxLength: MAX_NAME_LENGTH });
  return showDialog({
    title: "ユーザを追加",
    body: [name.node],
    confirmLabel: "追加",
    onConfirm: async () => {
      await api.users.add(name.input.value);
      await reloadUsers();
    },
  });
}

function renameUser(user) {
  const name = field({ label: "ユーザ名", value: user.name, maxLength: MAX_NAME_LENGTH });
  return showDialog({
    title: "名前を変更",
    body: [name.node],
    confirmLabel: "変更",
    onConfirm: async () => {
      await api.users.rename(user.id, name.input.value);
      await reloadUsers();
    },
  });
}

function deleteUser(user) {
  return showDialog({
    title: `${user.name}さんを削除`,
    body: [paragraph("削除すると、このユーザの記録（テスト結果）はアプリから見られなくなります。")],
    confirmLabel: "削除",
    danger: true,
    onConfirm: async () => {
      await api.users.delete(user.id);
      await reloadUsers();
    },
  });
}

// 重要な操作の確認（ApiSpec_Auth.md 0.4）。パスワードが未設定の家族は、復旧コードで確認する。
function confirmElevation() {
  const usesPassword = family.superuserPasswordSet;
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

async function start() {
  try {
    const current = await api.sessions.current();
    family = current.family;
    const expires = new Date(current.session.expiresAt).toLocaleDateString("ja-JP");
    byId("device").textContent = `${current.session.deviceLabel}（${expires} までログインしたままになります）`;
    renderOrganization();
    showUserSelection();
  } catch (error) {
    if (error?.status === 401) {
      showScreen("loggedOut"); // 未ログインなら、ログインしていないことを伝えて、ログインか新規登録を選ばせる
      return;
    }
    byId("loadError").textContent = error?.message ?? "読み込めませんでした。";
    showScreen("error");
  }
}

api.http.onElevationRequired = confirmElevation;
renderTestMenu();

byId("changeUser").addEventListener("click", showUserSelection);
byId("editFamily").addEventListener("click", () => {
  renderFamilyUsers();
  showScreen("family");
});
byId("addUser").addEventListener("click", addUser);
byId("backHome").addEventListener("click", showHome);
byId("logout").addEventListener("click", async () => {
  try {
    await api.sessions.logout();
    showScreen("loggedOut");
  } catch (error) {
    setError("selectError", error);
  }
});

start();
