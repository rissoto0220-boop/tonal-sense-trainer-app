// 利用データ（テスト結果）の API（研究者・組織向け。ApiSpec_TestData.md O22〜O26）。
// 参照できる範囲は、サーバが現在の所属で決める。参照できないユーザは 404 NOT_FOUND。

/** 配列は、カンマ区切りにする（複数のユーザ・種類を指定するため）。 */
function joinLists(query) {
  const out = { ...query };
  for (const key of ["userId", "testType"]) {
    if (Array.isArray(out[key])) out[key] = out[key].join(",");
  }
  return out;
}

export class OrgTestDataApi {
  /** @param {import("./ApiClient.js").ApiClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * O22 参照できるユーザの一覧
   * @param {{limit?: number, cursor?: string|null}} [query]
   * @returns {Promise<{users: {userId: string, name: string|null, sessionCount: number, lastSessionAt: string|null, organization?: {name: string}|null}[], nextCursor: string|null}>}
   */
  users(query = {}) {
    return this.client.get("/users", { query });
  }

  /**
   * O23 ユーザのセッションの一覧
   * @param {string} userId
   * @param {{testType?: string, from?: string, to?: string, includeInterrupted?: boolean, limit?: number, cursor?: string|null}} [query]
   * @returns {Promise<{sessions: object[], nextCursor: string|null}>}
   */
  sessions(userId, query = {}) {
    return this.client.get(`/users/${encodeURIComponent(userId)}/test-sessions`, { query });
  }

  /** O24 セッション1件の詳細 @param {string} userId @param {string} sessionId @returns {Promise<{session: object}>} */
  session(userId, sessionId) {
    return this.client.get(`/users/${encodeURIComponent(userId)}/test-sessions/${encodeURIComponent(sessionId)}`);
  }

  /**
   * O25 CSV・ZIP のダウンロード。範囲が大きすぎると 422 EXPORT_TOO_LARGE（絞って再度要求する）
   * format "csv" は、userId・testType・kind がそれぞれ1つに決まっている場合のみ
   * @param {{format?: "zip"|"csv", userId?: string|string[], testType?: string|string[], kind?: "responses"|"sessions", from?: string, to?: string, includeInterrupted?: boolean}} [query]
   * @returns {Promise<{blob: Blob, filename: string|null, contentType: string|null}>}
   */
  export(query = {}) {
    return this.client.getFile("/test-exports", { query: joinLists(query) });
  }

  /** O26 セッション1件の削除（研究者のみ。確認が必要） @param {string} sessionId */
  deleteSession(sessionId) {
    return this.client.delete(`/test-sessions/${encodeURIComponent(sessionId)}`);
  }
}
