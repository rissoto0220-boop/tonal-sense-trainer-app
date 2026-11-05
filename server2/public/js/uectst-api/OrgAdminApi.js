// 組織の管理の API（ApiSpec_Organization.md O17〜O21）。研究者の組織のみ（通常の組織は 403 SUPER_ONLY）。

export class OrgAdminApi {
  /** @param {import("./ApiClient.js").ApiClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * O17 組織の一覧（作成が新しい順。研究者の組織も含む）
   * @returns {Promise<{organizations: {id: string, name: string, loginId: string, isSuper: boolean, memberFamilyCount: number, createdAt: string}[]}>}
   */
  list() {
    return this.client.get("/organizations");
  }

  /**
   * O18 組織の登録（ログインアカウントの発行）。initialPassword は、このレスポンスでのみ返る
   * 失敗: 409 DUPLICATE_LOGIN_ID・DUPLICATE_ORGANIZATION_NAME、422 VALIDATION_FAILED
   * @param {string} name 組織名（1〜100文字）
   * @param {string} loginId 英小文字・数字・. _ - の4〜64文字
   * @returns {Promise<{organization: object, initialPassword: string}>}
   */
  create(name, loginId) {
    return this.client.post("/organizations", { name, loginId });
  }

  /** O19 組織名の変更（研究者の組織自身は 409 SUPER_ORGANIZATION_PROTECTED） @param {string} organizationId @param {string} name */
  rename(organizationId, name) {
    return this.client.patch(`/organizations/${encodeURIComponent(organizationId)}`, { name });
  }

  /**
   * O20 パスワードの再発行（確認が必要）。その組織のすべてのログインが終了する。initialPassword は、このレスポンスでのみ返る
   * @param {string} organizationId
   * @returns {Promise<{initialPassword: string}>}
   */
  resetPassword(organizationId) {
    return this.client.post(`/organizations/${encodeURIComponent(organizationId)}/password-reset`, {});
  }

  /**
   * O21 組織の削除（確認が必要）。所属していた家族は個人ユーザになる（一覧の memberFamilyCount を、確認画面に表示する）
   * @param {string} organizationId
   * @returns {Promise<{releasedFamilyCount: number}>}
   */
  delete(organizationId) {
    return this.client.delete(`/organizations/${encodeURIComponent(organizationId)}`);
  }
}
