// 運用担当者の組織のパスキーの API（ApiSpec_Organization.md O8〜O11）。通常の組織が呼ぶと 403 SUPER_ONLY。

import { createCredential } from "./WebAuthnBrowser.js";

export class OrgPasskeyApi {
  /**
   * @param {import("./ApiClient.js").ApiClient} client
   * @param {{ credentials?: CredentialsContainer }} [options] テスト用に navigator.credentials を差し替える
   */
  constructor(client, options = {}) {
    this.client = client;
    this.credentials = options.credentials ?? null;
  }

  /** O8 パスキーの一覧 @returns {Promise<{passkeys: object[]}>} */
  list() {
    return this.client.get("/passkeys");
  }

  /**
   * O9 登録の開始。navigator.credentials.create に渡す options を返す。
   * ログイン完了後（段階1）は確認（OrgAccountApi.elevate）が必要。最初のログイン（パスキーが1件もない段階0）は不要
   */
  registrationOptions() {
    return this.client.post("/passkeys/registration-options", {});
  }

  /**
   * O10 登録。段階0で最初のパスキーを登録できたら、ログインが完了する（authStage: 1）
   * @param {object} credential navigator.credentials.create の結果（toJSON 形式）
   * @returns {Promise<{passkey: object, authStage: 1}>}
   */
  register(credential) {
    return this.client.post("/passkeys", { credential });
  }

  /**
   * O11 削除（確認が必要）。最後の1件は 409 LAST_PASSKEY。端末のパスキーの管理画面からも削除するよう、画面で案内する
   * @param {string} passkeyId
   */
  delete(passkeyId) {
    return this.client.delete(`/passkeys/${encodeURIComponent(passkeyId)}`);
  }

  /**
   * パスキーを新しく登録する（O9 → 端末の生体認証 → O10）。
   * 利用者が端末の画面でキャンセルした場合は、DOMException（NotAllowedError）が投げられる。
   * @returns {Promise<{passkey: object, authStage: 1}>}
   */
  async registerNew() {
    const options = await this.registrationOptions();
    const credential = await createCredential(options, this.credentials ?? undefined);
    return this.register(credential);
  }
}
