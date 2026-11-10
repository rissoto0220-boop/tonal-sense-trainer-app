// 仮登録の画面（ApiSpec_Auth.md #1、基本方針 3.1）。メールアドレスの入力 → 確認 → 送信 → 送信完了。
import { api, byId, showScreen, setError } from "../common.js";

let email = "";

byId("form").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = byId("email").value.trim();
  if (value === "" || !value.includes("@") || value.length > 254) {
    setError("formError", { message: "メールアドレスの形式が正しくありません。" });
    return;
  }
  setError("formError", null);
  email = value;
  byId("confirmAddress").textContent = email;
  setError("confirmError", null);
  showScreen("confirm");
});

byId("back").addEventListener("click", () => showScreen("form"));

byId("send").addEventListener("click", async () => {
  const button = byId("send");
  button.disabled = true;
  setError("confirmError", null);
  try {
    // 仮実装: CAPTCHA は、まだない（サーバの captcha.driver が none のときだけ動く）。
    const result = await api.registration.start(email, null);
    email = ""; // 送信したアドレスは、画面にも残さない。
    byId("email").value = "";
    byId("sender").textContent = result.sender;
    // デバッグ状態では、メール表示ページが、別タブで自動で開く。開けなかった場合のためのリンクも出す。
    const debugUrl = result.debug?.mailViewUrl;
    byId("debugMail").hidden = !debugUrl;
    if (debugUrl) byId("debugMailLink").setAttribute("href", debugUrl);
    showScreen("sent");
  } catch (error) {
    setError("confirmError", error);
  } finally {
    button.disabled = false;
  }
});
