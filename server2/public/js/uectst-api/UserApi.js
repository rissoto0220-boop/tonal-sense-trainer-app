// ユーザ管理の API（ApiSpec_Auth.md #10〜#14）。

export class UserApi {
  /** @param {import("./ApiClient.js").ApiClient} client */
  constructor(client) {
    this.client = client;
  }

  /** #10 一覧 @returns {Promise<{users: object[]}>} */
  list() {
    return this.client.get("/users");
  }

  /** #11 追加（最大4名） @param {string} name @returns {Promise<{user: object}>} */
  add(name) {
    return this.client.post("/users", { name });
  }

  /** #12 名前の変更 @param {string} userId @param {string} name @returns {Promise<{user: object}>} */
  rename(userId, name) {
    return this.client.patch(`/users/${encodeURIComponent(userId)}`, { name });
  }

  /** #13 並べ替え（全員の ID を、新しい順に） @param {string[]} userIds @returns {Promise<{users: object[]}>} */
  reorder(userIds) {
    return this.client.put("/users/order", { userIds });
  }

  /** #14 削除（確認が必要） @param {string} userId */
  delete(userId) {
    return this.client.delete(`/users/${encodeURIComponent(userId)}`);
  }
}
