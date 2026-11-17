// 家族の、所属の API（ApiSpec_Auth.md #28〜#31）。招待ページ（/invite#token=...）が使う。
//
// 招待ページは、registration の画面と同じく、location.hash からトークンを読み取って sessionStorage に保持し、
// clearFragment() でアドレスバーから消す（TokenFragment.js）。所属が完了したら、保持したトークンを削除する。

export class MembershipApi {
  /** @param {import("./ApiClient.js").ApiClient} client */
  constructor(client) {
    this.client = client;
  }

  /**
   * #28 招待の照合（DB は変更しない）。未ログインでも呼べる。無効・期限切れは 410 INVITATION_INVALID
   * @param {string} token 招待URLのトークン
   * @returns {Promise<{belongingName: string, expiresAt: string}>}
   */
  verifyInvitation(token) {
    return this.client.post("/invitations/verify", { token });
  }

  /** #29 所属先の取得 @returns {Promise<{belonging: {name: string, joinedAt: string}|null}>} */
  get() {
    return this.client.get("/belonging");
  }

  /**
   * #30 登録済みの家族の所属（確認が必要）。別の所属から移ることもできるため、画面で警告して同意を得てから呼ぶ。
   * すでに同じ所属先に所属していれば 409 ALREADY_MEMBER（招待は消費されない）
   * @param {string} invitationToken
   * @returns {Promise<{belonging: {name: string, joinedAt: string}, previousBelonging: {name: string}|null}>}
   */
  join(invitationToken) {
    return this.client.post("/belonging", { invitationToken });
  }

  /** #31 所属の解除（確認が必要）。所属がすでにダウンロードしたデータは消えないことを、画面で案内する */
  leave() {
    return this.client.delete("/belonging");
  }
}
