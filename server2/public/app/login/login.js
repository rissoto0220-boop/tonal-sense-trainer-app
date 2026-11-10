// ログインの画面（ApiSpec_Auth.md #4、基本方針 6.）。復旧コードでログインする。
// 打ち間違い（チェック用の文字の不一致など）は、サーバへ送る前に検出する（失敗回数に数えないため）。
import { api, byId, setError } from "../common.js";
import { RecoveryCode } from "../../js/uectst-api/index.js";

const code = byId("code");

// 入力欄を離れたら、読みやすい形式（5文字ずつハイフン区切り）にそろえる。
code.addEventListener("blur", () => {
  code.value = RecoveryCode.format(code.value);
});

byId("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const normalized = RecoveryCode.normalize(code.value);
  if (RecoveryCode.validate(normalized) !== null) {
    setError("formError", { message: "入力ミスがあります。もう一度確かめてください。" });
    return;
  }
  setError("formError", null);
  const button = byId("submit");
  button.disabled = true;
  try {
    await api.sessions.login(RecoveryCode.format(normalized));
    location.href = "../"; // 仮実装: ログイン後の画面は、ホーム（ログイン状態の表示）
  } catch (error) {
    setError("formError", error);
    button.disabled = false;
  }
});
