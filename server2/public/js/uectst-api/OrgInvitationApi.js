// 招待と、所属している家族の管理の API（ApiSpec_Organization.md O12〜O16）。

export class OrgInvitationApi {
  /** @param {import("./ApiClient.js").ApiClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * O12 招待メールの送信。招待先のメールアドレスは、サーバに保存されない
   * @param {string} email
   * @returns {Promise<{sender: string, expiresAt: string}>} sender は送信元（迷惑メール対策の案内用）
   */
  send(email) {
    return this.client.post("/invitations", { email });
  }

  /** O13 未使用の招待の件数（誰に送ったかは分からない） @returns {Promise<{pendingCount: number}>} */
  pendingCount() {
    return this.client.get("/invitations");
  }

  /** O14 未使用の招待のすべての取り消し @returns {Promise<{revokedCount: number}>} */
  revokeAll() {
    return this.client.delete("/invitations");
  }

  /**
   * O15 所属している家族の一覧（所属が新しい順）。組織が見られるのは、家族の ID・所属日時・ユーザの ID と名前だけ
   * @returns {Promise<{families: {id: string, joinedAt: string, users: {id: string, name: string}[]}[]}>}
   */
  members() {
    return this.client.get("/members");
  }

  /** O16 所属している家族を外す（家族は個人ユーザになる）。他の組織の家族は 404 @param {string} familyId */
  removeMember(familyId) {
    return this.client.delete(`/members/${encodeURIComponent(familyId)}`);
  }
}
