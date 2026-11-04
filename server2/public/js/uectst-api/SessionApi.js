// ログイン・端末の API（ApiSpec_Auth.md #4〜#9）。

export class SessionApi {
  /** @param {import("./ApiClient.js").ApiClient} client */
  constructor(client) {
    this.client = client;
  }

  /** #4 復旧コードでログイン @param {string} recoveryCode */
  login(recoveryCode) {
    return this.client.post("/sessions", { recoveryCode });
  }

  /** #5 ログイン状態と家族の情報 @returns {Promise<{session: object, family: object}>} */
  current() {
    return this.client.get("/sessions/current");
  }

  /** #6 ログアウト */
  logout() {
    return this.client.delete("/sessions/current");
  }

  /** #7 使うユーザを切り替える @param {string} userId */
  selectUser(userId) {
    return this.client.put("/sessions/current/selected-user", { userId });
  }

  /** #8 ログイン中の端末の一覧 @returns {Promise<{sessions: object[]}>} */
  list() {
    return this.client.get("/sessions");
  }

  /** #9 端末のログアウト（他の端末は、確認が必要） @param {string} sessionId */
  revoke(sessionId) {
    return this.client.delete(`/sessions/${encodeURIComponent(sessionId)}`);
  }
}
