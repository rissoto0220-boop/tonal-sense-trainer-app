// 運用担当者・所属のパスワードの変更と、破壊的な操作の確認の API（ApiSpec_Belonging.md B6・B7）。

export class BlgAccountApi {
  /** @param {import("./ApiClient.js").ApiClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * B6 パスワードの変更（12〜128文字）。他の端末のログインは、すべて終了する。
   * 失敗: 401 INVALID_CREDENTIALS、422 VALIDATION_FAILED（details の code が TOO_SHORT・TOO_LONG・SAME_PASSWORD）
   * @param {string} currentPassword 初回は、発行された初期パスワード
   * @param {string} newPassword
   */
  changePassword(currentPassword, newPassword) {
    return this.client.put("/password", { currentPassword, newPassword });
  }

  /**
   * B7 破壊的な操作（パスキーの削除・パスワードの再発行・所属の削除）の確認。パスワードを再入力して、この端末で5分間有効にする
   * @param {string} password
   * @returns {Promise<{elevatedUntil: string}>}
   */
  elevate(password) {
    return this.client.post("/elevation", { password });
  }
}
