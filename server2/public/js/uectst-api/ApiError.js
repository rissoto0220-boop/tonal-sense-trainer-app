// API のエラー（ApiSpec_Auth.md 0.5）。サーバが返したエラーを、このクラスにまとめる。
// 通信そのものの失敗（オフラインなど）は、status が 0、code が "NETWORK_ERROR" になる。

/**
 * @typedef {{ field: string, code: string }} ErrorDetail
 */

export class ApiError extends Error {
  /**
   * @param {object} params
   * @param {number} params.status HTTP ステータス（通信の失敗は 0）
   * @param {string} params.code エラーの種類（"VALIDATION_FAILED" など）。処理の分岐には、この値を使う
   * @param {string} params.message 利用者向けの日本語のメッセージ（画面にそのまま表示してよい）
   * @param {ErrorDetail[]} [params.details] 入力エラーの項目ごとの詳細
   * @param {number|null} [params.retryAfter] 再試行までの秒数（429 のとき）
   */
  constructor({ status, code, message, details = [], retryAfter = null }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
  }

  /** @param {string} code */
  is(code) {
    return this.code === code;
  }

  /** 通信の失敗（サーバに届かなかった）か。 */
  get isNetworkError() {
    return this.code === "NETWORK_ERROR";
  }
}
