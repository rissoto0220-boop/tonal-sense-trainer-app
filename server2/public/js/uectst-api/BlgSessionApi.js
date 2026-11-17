// 運用担当者・所属のログイン・ログアウトの API（ApiSpec_Belonging.md B1〜B5）。

import { getCredential } from "./WebAuthnBrowser.js";

/**
 * @typedef {object} Belonging
 * @property {string} id
 * @property {string} name
 * @property {string} loginId
 * @property {boolean} isSuper 運用担当者の所属か
 * @property {boolean} passwordChangeRequired true ならパスワードの変更（BlgAccountApi.changePassword）を先に行う
 */

export class BlgSessionApi {
  /**
   * @param {import("./ApiClient.js").ApiClient} client
   * @param {{ credentials?: CredentialsContainer }} [options] テスト用に navigator.credentials を差し替える
   */
  constructor(client, options = {}) {
    this.client = client;
    this.credentials = options.credentials ?? null;
  }

  /**
   * B1 ログイン（ログインID＋パスワード）。
   * authStage が 0（運用担当者の所属）なら、passkeyRegistered が true ならパスキーの確認（loginWithPasskey）、
   * false ならパスキーの登録（BlgPasskeyApi.registerNew）に進む。
   * 失敗: 401 INVALID_CREDENTIALS、429 BELONGING_PASSWORD_LOCKED（ApiError.retryAfter が解除までの秒数）
   * @param {string} loginId
   * @param {string} password
   * @returns {Promise<{belonging: Belonging, authStage: 0|1, passkeyRegistered: boolean}>}
   */
  login(loginId, password) {
    return this.client.post("/sessions", { loginId, password });
  }

  /** B2 パスキーによるログインの確認の開始（運用担当者の所属のみ）。navigator.credentials.get に渡す options を返す */
  passkeyOptions() {
    return this.client.post("/sessions/passkey-options", {});
  }

  /** B3 パスキーによるログインの確認（ログインの完了） @param {object} passkey navigator.credentials.get の結果（toJSON 形式） */
  completeWithPasskey(passkey) {
    return this.client.post("/sessions/passkey", { passkey });
  }

  /**
   * パスキーでログインを完了する（B2 → 端末の生体認証 → B3）。
   * 利用者が端末の画面でキャンセルした場合は、DOMException（NotAllowedError）が投げられる。
   * @returns {Promise<{belonging: Belonging, authStage: 1}>}
   */
  async loginWithPasskey() {
    const options = await this.passkeyOptions();
    const passkey = await getCredential(options, this.credentials ?? undefined);
    return this.completeWithPasskey(passkey);
  }

  /** B4 ログイン状態と所属の情報の取得（パスキーの確認が未了でも呼べる） */
  current() {
    return this.client.get("/sessions/current");
  }

  /** B5 ログアウト */
  logout() {
    return this.client.delete("/sessions/current");
  }
}
