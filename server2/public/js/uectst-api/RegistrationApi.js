// 登録の API（ApiSpec_Auth.md #1〜#3）。未ログインで呼ぶ。

export class RegistrationApi {
  /** @param {import("./ApiClient.js").ApiClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * #1 仮登録（確認メールを送る）
   * @param {string} email
   * @param {string|null} captchaToken
   * @returns {Promise<{sender: string}>} sender は、確認メールの送信元（迷惑メール対策の案内用）
   */
  start(email, captchaToken = null) {
    return this.client.post("/registrations", { email, captchaToken });
  }

  /** #2 本登録リンクの照合 @param {string} token @returns {Promise<{expiresAt: string}>} */
  verify(token) {
    return this.client.post("/registrations/verify", { token });
  }

  /**
   * #3 本登録（ユーザを作り、ログインする）。復旧コードは、このときだけ表示される
   * @param {string} token
   * @param {string[]} userNames 1〜4名
   * @returns {Promise<{recoveryCode: string, family: object}>}
   */
  complete(token, userNames) {
    return this.client.post("/registrations/complete", { token, users: userNames.map((name) => ({ name })) });
  }
}
