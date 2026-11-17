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

  /**
   * #3 招待経由の本登録。招待メールが届いたことがメールアドレスの確認になるため、仮登録（start）は不要。
   * 登録と同時に、招待した所属する。無効・期限切れは 410 INVITATION_INVALID
   * @param {string} invitationToken 招待URLのトークン
   * @param {string[]} userNames 1〜4名
   * @returns {Promise<{recoveryCode: string, family: object}>}
   */
  completeWithInvitation(invitationToken, userNames) {
    return this.client.post("/registrations/complete", { invitationToken, users: userNames.map((name) => ({ name })) });
  }
}
