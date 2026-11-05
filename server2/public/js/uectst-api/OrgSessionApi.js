// 研究者・組織のログイン・ログアウトの API（ApiSpec_Organization.md O1〜O5）。

import { getCredential } from "./WebAuthnBrowser.js";

/**
 * @typedef {object} Organization
 * @property {string} id
 * @property {string} name
 * @property {string} loginId
 * @property {boolean} isSuper 研究者の組織か
 * @property {boolean} passwordChangeRequired true ならパスワードの変更（OrgAccountApi.changePassword）を先に行う
 */

export class OrgSessionApi {
  /**
   * @param {import("./ApiClient.js").ApiClient} client
   * @param {{ credentials?: CredentialsContainer }} [options] テスト用に navigator.credentials を差し替える
   */
  constructor(client, options = {}) {
    this.client = client;
    this.credentials = options.credentials ?? null;
  }

  /**
   * O1 ログイン（ログインID＋パスワード）。
   * authStage が 0（研究者の組織）なら、passkeyRegistered が true ならパスキーの確認（loginWithPasskey）、
   * false ならパスキーの登録（OrgPasskeyApi.registerNew）に進む。
   * 失敗: 401 INVALID_CREDENTIALS、429 ORGANIZATION_PASSWORD_LOCKED（ApiError.retryAfter が解除までの秒数）
   * @param {string} loginId
   * @param {string} password
   * @returns {Promise<{organization: Organization, authStage: 0|1, passkeyRegistered: boolean}>}
   */
  login(loginId, password) {
    return this.client.post("/sessions", { loginId, password });
  }

  /** O2 パスキーによるログインの確認の開始（研究者の組織のみ）。navigator.credentials.get に渡す options を返す */
  passkeyOptions() {
    return this.client.post("/sessions/passkey-options", {});
  }

  /** O3 パスキーによるログインの確認（ログインの完了） @param {object} passkey navigator.credentials.get の結果（toJSON 形式） */
  completeWithPasskey(passkey) {
    return this.client.post("/sessions/passkey", { passkey });
  }

  /**
   * パスキーでログインを完了する（O2 → 端末の生体認証 → O3）。
   * 利用者が端末の画面でキャンセルした場合は、DOMException（NotAllowedError）が投げられる。
   * @returns {Promise<{organization: Organization, authStage: 1}>}
   */
  async loginWithPasskey() {
    const options = await this.passkeyOptions();
    const passkey = await getCredential(options, this.credentials ?? undefined);
    return this.completeWithPasskey(passkey);
  }

  /** O4 ログイン状態と組織の情報の取得（パスキーの確認が未了でも呼べる） */
  current() {
    return this.client.get("/sessions/current");
  }

  /** O5 ログアウト */
  logout() {
    return this.client.delete("/sessions/current");
  }
}
