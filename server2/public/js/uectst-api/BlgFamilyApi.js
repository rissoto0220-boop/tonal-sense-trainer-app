// 家族の管理の API（ApiSpec_Belonging.md B27〜B29）。運用担当者の所属のみ（通常の所属は 403 SUPER_ONLY）。

export class BlgFamilyApi {
  /** @param {import("./ApiClient.js").ApiClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * B27 すべての家族の一覧（登録が新しい順。所属先・ユーザの名前を含む。復旧コードなどは含まない）
   * @returns {Promise<{families: {id: string, createdAt: string, belonging: {id: string, name: string}|null, joinedAt: string|null, users: {id: string, name: string}[]}[]}>}
   */
  list() {
    return this.client.get("/families");
  }

  /**
   * B28 家族の所属の解除（確認が必要）。家族は個人ユーザになる
   * 失敗: 404 NOT_FOUND、409 NOT_A_MEMBER（どこにも所属していない）
   * @param {string} familyId
   */
  release(familyId) {
    return this.client.delete(`/families/${encodeURIComponent(familyId)}/belonging`);
  }

  /**
   * B29 家族の削除（確認が必要）。家族・ユーザ・ログイン・パスキーを削除する。利用データは削除しない
   * @param {string} familyId
   */
  delete(familyId) {
    return this.client.delete(`/families/${encodeURIComponent(familyId)}`);
  }
}
