// パスキーの API（ApiSpec_Auth.md #23〜#27）。ブラウザの WebAuthn 操作まで含めて、1回の呼び出しにまとめたメソッドも持つ。

import { createCredential, getCredential } from "./WebAuthnBrowser.js";

export class PasskeyApi {
  /**
   * @param {import("./ApiClient.js").ApiClient} client
   * @param {{ credentials?: CredentialsContainer }} [options] テスト用に navigator.credentials を差し替える
   */
  constructor(client, options = {}) {
    this.client = client;
    this.credentials = options.credentials ?? null;
  }

  /** #24 パスキーの一覧 @returns {Promise<{passkeys: object[]}>} */
  list() {
    return this.client.get("/superuser/passkeys");
  }

  /** #25 登録の開始（確認が必要）。navigator.credentials.create に渡す options を返す */
  registrationOptions() {
    return this.client.post("/superuser/passkeys/registration-options", {});
  }

  /** #26 登録（確認が必要） @param {object} credential navigator.credentials.create の結果（toJSON 形式） @returns {Promise<{passkey: object}>} */
  register(credential) {
    return this.client.post("/superuser/passkeys", { credential });
  }

  /** #27 削除（確認が必要）。端末のパスキーの管理画面からも削除するよう、画面で案内する @param {string} passkeyId */
  delete(passkeyId) {
    return this.client.delete(`/superuser/passkeys/${encodeURIComponent(passkeyId)}`);
  }

  /** #23 確認の開始。navigator.credentials.get に渡す options を返す */
  elevationOptions() {
    return this.client.post("/elevation/passkey-options", {});
  }

  /**
   * パスキーを新しく登録する（#25 → 端末の生体認証 → #26）。確認が必要。
   * 利用者が端末の画面でキャンセルした場合は、DOMException（NotAllowedError）が投げられる。
   * @returns {Promise<{passkey: object}>}
   */
  async registerNew() {
    const options = await this.registrationOptions();
    const credential = await createCredential(options, this.credentials ?? undefined);
    return this.register(credential);
  }

  /**
   * パスキーで確認する（#23 → 端末の生体認証 → #15）。成功すると、この端末で5分間、重要な操作ができる。
   * @returns {Promise<{elevatedUntil: string}>}
   */
  async elevate() {
    const options = await this.elevationOptions();
    const passkey = await getCredential(options, this.credentials ?? undefined);
    return this.client.post("/elevation", { passkey });
  }
}
