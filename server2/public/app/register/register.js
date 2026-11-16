// 本登録の画面（ApiSpec_Auth.md #2・#3、基本方針 3.2・6.1）。
// 本登録のリンクのトークンは、URL のフラグメントにある。読み取ったら、URL から消し、再読み込みに備えて
// タブの sessionStorage に保持する（本登録が完了したら削除する）。
import { api, byId, showScreen, setError } from "../common.js";
import { setupUserRows, setupRecoveryCodeView } from "../registration-ui.js";
import { readFragmentToken, clearFragment } from "../../js/uectst-api/index.js";

const STORAGE_KEY = "uectst.registrationToken";

/** @type {string|null} */
let token = null;

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

const userRows = setupUserRows();
const recoveryCodeView = setupRecoveryCodeView({ showScreen });

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
  showScreen("form");
}

byId("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const names = userRows.readNames();
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
    recoveryCodeView.show(result.recoveryCode);
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

start();
