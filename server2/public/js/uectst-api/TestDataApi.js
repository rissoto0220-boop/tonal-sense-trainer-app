// 利用データ（テスト結果）の API（家族・ユーザ向け。ApiSpec_TestData.md #32〜#35）。
// すべて、userId（ログイン中の家族のユーザ）のパスの下。

export class TestDataApi {
  /** @param {import("./ApiClient.js").ApiClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * #32 セッション1件の送信（DataFormat_TestData.md の形。ユーザの識別は、本文に含めない）。
   * 成功: 201（初回）または 200（保存済みの再送）。どちらも成功として扱う。
   * 失敗: 通信エラー・5xx は再送する。400・409 SESSION_ID_CONFLICT・413・422 は、再送しても直らない。
   * @param {string} userId
   * @param {object} session sessionId・testType・startedAt・endedAt・sessionStatus・responses（訓練は trials）など
   * @returns {Promise<{sessionId: string, testType: string, receivedAt: string}>}
   */
  submit(userId, session) {
    return this.client.post(`/users/${encodeURIComponent(userId)}/test-sessions`, session);
  }

  /**
   * #33 自分のセッションの一覧（開始日時の新しい順）
   * @param {string} userId
   * @param {{testType?: string, from?: string, to?: string, includeInterrupted?: boolean, limit?: number, cursor?: string|null}} [query]
   * @returns {Promise<{sessions: object[], nextCursor: string|null}>}
   */
  list(userId, query = {}) {
    return this.client.get(`/users/${encodeURIComponent(userId)}/test-sessions`, { query });
  }

  /** #34 セッション1件の詳細 @param {string} userId @param {string} sessionId @returns {Promise<{session: object}>} */
  get(userId, sessionId) {
    return this.client.get(`/users/${encodeURIComponent(userId)}/test-sessions/${encodeURIComponent(sessionId)}`);
  }

  /**
   * #35 自分のデータの CSV（BOM 付き UTF-8）。ファイルとして保存するのは、呼び出し側（blob と filename を返す）
   * @param {string} userId
   * @param {{testType: string, kind: "responses"|"sessions", from?: string, to?: string, includeInterrupted?: boolean}} query
   * @returns {Promise<{blob: Blob, filename: string|null, contentType: string|null}>}
   */
  exportCsv(userId, query) {
    return this.client.getFile(`/users/${encodeURIComponent(userId)}/test-exports`, { query });
  }
}
