// 重要な操作の確認・復旧コード・退会の API（ApiSpec_Auth.md #15, #16, #21）。

export class AccountApi {
  /** @param {import("./ApiClient.js").ApiClient} client */
  constructor(client) {
    this.client = client;
  }

  /** #15 復旧コードによる確認（5分間、重要な操作ができる） @param {string} recoveryCode @returns {Promise<{elevatedUntil: string}>} */
  elevateWithRecoveryCode(recoveryCode) {
    return this.client.post("/elevation", { recoveryCode });
  }

  /** #16 復旧コードの再発行（確認が必要）。他の端末はログアウトされる @returns {Promise<{recoveryCode: string, revokedSessionCount: number}>} */
  reissueRecoveryCode() {
    return this.client.post("/recovery-code", {});
  }

  /** #21 退会（確認が必要） */
  withdraw() {
    return this.client.delete("/family");
  }
}
