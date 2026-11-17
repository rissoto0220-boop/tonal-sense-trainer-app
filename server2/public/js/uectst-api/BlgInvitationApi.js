// 招待と、所属している家族の管理の API（ApiSpec_Belonging.md B12〜B16）。

export class BlgInvitationApi {
  /** @param {import("./ApiClient.js").ApiClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * B12 招待メールの送信。招待先のメールアドレスは、サーバに保存されない
   * @param {string} email
   * @returns {Promise<{sender: string, expiresAt: string}>} sender は送信元（迷惑メール対策の案内用）
   */
  send(email) {
    return this.client.post("/invitations", { email });
  }

  /** B13 未使用の招待の件数（誰に送ったかは分からない） @returns {Promise<{pendingCount: number}>} */
  pendingCount() {
    return this.client.get("/invitations");
  }

  /** B14 未使用の招待のすべての取り消し @returns {Promise<{revokedCount: number}>} */
  revokeAll() {
    return this.client.delete("/invitations");
  }

  /**
   * B15 所属している家族の一覧（所属が新しい順）。所属が見られるのは、家族の ID・所属日時・ユーザの ID と名前だけ
   * @returns {Promise<{families: {id: string, joinedAt: string, users: {id: string, name: string}[]}[]}>}
   */
  members() {
    return this.client.get("/members");
  }

  /** B16 所属している家族を外す（家族は個人ユーザになる）。他の所属の家族は 404 @param {string} familyId */
  removeMember(familyId) {
    return this.client.delete(`/members/${encodeURIComponent(familyId)}`);
  }
}
