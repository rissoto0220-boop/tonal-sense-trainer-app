// スーパーユーザ・パスワードの API（ApiSpec_Auth.md #17〜#20, #22）。

export class SuperuserApi {
  /** @param {import("./ApiClient.js").ApiClient} client */
  constructor(client) {
    this.client = client;
  }

  /** #17 スーパーユーザとパスワードの設定状況 @returns {Promise<{superuserId: string, passwordSet: boolean, passwordLockedUntil: string|null}>} */
  get() {
    return this.client.get("/superuser");
  }

  /** #18 パスワードの設定・変更（確認が必要） @param {string} newPassword 4〜64文字 */
  setPassword(newPassword) {
    return this.client.put("/superuser/password", { newPassword });
  }

  /** #19 パスワードの削除（確認が必要。パスキーが残っていると 409 PASSKEYS_REGISTERED） */
  deletePassword() {
    return this.client.delete("/superuser/password");
  }

  /** #20 スーパーユーザを他のユーザへ移す（確認が必要） @param {string} userId @returns {Promise<{users: object[]}>} */
  transfer(userId) {
    return this.client.put("/superuser", { userId });
  }

  /**
   * #22 パスワードを忘れた場合の再設定（復旧コードで確認。成功すると、続けて5分間、重要な操作ができる）
   * @param {string} recoveryCode
   * @param {string} newPassword
   * @returns {Promise<{elevatedUntil: string}>}
   */
  resetPassword(recoveryCode, newPassword) {
    return this.client.post("/superuser/password/reset", { recoveryCode, newPassword });
  }
}
