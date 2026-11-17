// 所属の管理の API（ApiSpec_Belonging.md B17〜B21）。運用担当者の所属のみ（通常の所属は 403 SUPER_ONLY）。

export class BlgAdminApi {
  /** @param {import("./ApiClient.js").ApiClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * B17 所属の一覧（作成が新しい順。運用担当者の所属も含む）
   * @returns {Promise<{belongings: {id: string, name: string, nameKana: string|null, loginId: string, isSuper: boolean, memberFamilyCount: number, createdAt: string}[]}>}
   */
  list() {
    return this.client.get("/belongings");
  }

  /**
   * B18 所属の登録（ログインアカウントの発行）。initialPassword は、このレスポンスでのみ返る
   * 失敗: 409 DUPLICATE_LOGIN_ID・DUPLICATE_BELONGING_NAME、422 VALIDATION_FAILED
   * @param {string} name 所属名（1〜100文字）
   * @param {string} loginId 英小文字・数字・. _ - の4〜64文字
   * @param {string} [nameKana] 読み仮名（省略・空は未登録。ひらがな・長音符・半角英数字・半角空白、100文字まで）
   * @returns {Promise<{belonging: object, initialPassword: string}>}
   */
  create(name, loginId, nameKana) {
    return this.client.post("/belongings", nameKana ? { name, nameKana, loginId } : { name, loginId });
  }

  /**
   * B19 所属名・読み仮名の変更（送った項目だけを変更。nameKana が空文字・null なら未登録に戻す。運用担当者の所属自身は 409 SUPER_BELONGING_PROTECTED）
   * @param {string} belongingId
   * @param {{name?: string, nameKana?: string|null}} changes
   */
  update(belongingId, changes) {
    return this.client.patch(`/belongings/${encodeURIComponent(belongingId)}`, changes);
  }

  /**
   * B20 パスワードの再発行（確認が必要）。その所属のすべてのログインが終了する。initialPassword は、このレスポンスでのみ返る
   * @param {string} belongingId
   * @returns {Promise<{initialPassword: string}>}
   */
  resetPassword(belongingId) {
    return this.client.post(`/belongings/${encodeURIComponent(belongingId)}/password-reset`, {});
  }

  /**
   * B21 所属の削除（確認が必要）。所属していた家族は個人ユーザになる（一覧の memberFamilyCount を、確認画面に表示する）
   * @param {string} belongingId
   * @returns {Promise<{releasedFamilyCount: number}>}
   */
  delete(belongingId) {
    return this.client.delete(`/belongings/${encodeURIComponent(belongingId)}`);
  }
}
