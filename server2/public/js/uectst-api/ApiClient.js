// API 呼び出しの共通の土台。fetch・JSON・エラーの変換・共通のイベント（未ログイン、確認が必要）を扱う。
// 家族・ユーザ用（FamilyClient）と、運用担当者・所属用（BlgClient）の、どちらも、これを使う。
//
// 認証は HttpOnly Cookie で行うため、このクラスはトークンを扱わない（credentials: "same-origin" で、Cookie が自動で付く）。
// Origin ヘッダは、ブラウザが自動で付ける。Content-Type: application/json は、本文があるときにこのクラスが付ける
// （サーバの CSRF 対策が、これを求める。ApiSpec_Auth.md 0.3）。

import { ApiError } from "./ApiError.js";

/**
 * @typedef {object} ApiClientOptions
 * @property {string} [basePath] API のベースパス（既定: "/api/v1"）。運用担当者・所属用は "/api/v1/blg" を、それぞれのクライアントで付ける
 * @property {typeof fetch} [fetchFn] テスト用に、fetch を差し替える
 * @property {() => Promise<boolean>|boolean} [onElevationRequired]
 *   403 ELEVATION_REQUIRED のときに呼ばれる。確認の画面を出して、確認に成功したら true を返すと、同じ操作を、1回だけ自動でやり直す
 * @property {(error: ApiError) => void} [onUnauthenticated] 401 UNAUTHENTICATED のときに呼ばれる（ログイン画面へ戻すなど）
 * @property {((url: string) => void)|null} [onDebugMail]
 *   サーバがデバッグ状態で、メールを送った（記録した）ときに、メール表示ページの URL（"/debug/mails?highlight=..."）を受け取る。
 *   既定は、名前付きのタブ（uectst-debug-mail）で開く（2通目以降は、同じタブが更新される）。null を渡すと、何もしない。
 *   ブラウザのポップアップブロックで開けない場合は、表示ページを一度開いておけば、新しいメールが自動で表示される
 */

/** 既定のメール表示ページの開き方。開けなくても（ポップアップブロックなど）、通常の処理には影響させない。 */
export const DEBUG_MAIL_TAB_NAME = "uectst-debug-mail";

function openDebugMailTab(url) {
  try {
    globalThis.window?.open?.(url, DEBUG_MAIL_TAB_NAME);
  } catch {
    // 開けない場合は、何もしない。
  }
}

export class ApiClient {
  /** @param {ApiClientOptions} [options] */
  constructor(options = {}) {
    this.basePath = options.basePath ?? "/api/v1";
    this.fetchFn = options.fetchFn ?? ((...args) => globalThis.fetch(...args));
    this.onElevationRequired = options.onElevationRequired ?? null;
    this.onUnauthenticated = options.onUnauthenticated ?? null;
    this.onDebugMail = options.onDebugMail === undefined ? openDebugMailTab : options.onDebugMail;
  }

  /**
   * @param {string} path basePath からの相対パス（"/users" など）
   * @param {object} [options]
   * @param {object} [options.query] クエリパラメータ（null・undefined は付けない）
   */
  get(path, options = {}) {
    return this.#request("GET", path, undefined, options);
  }

  /**
   * ファイルとして受け取る GET（CSV・ZIP のダウンロード）。成功時は { blob, filename, contentType } を返す。
   * エラーは、get と同じ ApiError。
   * @param {string} path
   * @param {object} [options]
   * @param {object} [options.query]
   * @returns {Promise<{blob: Blob, filename: string|null, contentType: string|null}>}
   */
  getFile(path, options = {}) {
    return this.#request("GET", path, undefined, { ...options, file: true });
  }

  /** @param {string} path @param {object} [body] */
  post(path, body = {}) {
    return this.#request("POST", path, body, {});
  }

  /** @param {string} path @param {object} [body] */
  put(path, body = {}) {
    return this.#request("PUT", path, body, {});
  }

  /** @param {string} path @param {object} [body] */
  patch(path, body = {}) {
    return this.#request("PATCH", path, body, {});
  }

  /** @param {string} path */
  delete(path) {
    return this.#request("DELETE", path, undefined, {});
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {object|undefined} body
   * @param {{ query?: Record<string, string|number|boolean|null|undefined>, file?: boolean }} options
   * @param {boolean} [retried] 確認の後のやり直しか（無限にやり直さないため）
   * @returns {Promise<any>} 成功時はレスポンスの JSON（204 は null）
   */
  async #request(method, path, body, options, retried = false) {
    const url = this.#url(path, options.query);
    /** @type {RequestInit} */
    const init = { method, credentials: "same-origin", headers: { Accept: options.file ? "*/*" : "application/json" } };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await this.fetchFn(url, init);
    } catch {
      throw new ApiError({ status: 0, code: "NETWORK_ERROR", message: "通信に失敗しました。接続を確認して、もう一度お試しください。" });
    }

    if (response.ok) {
      if (options.file) return this.#readFile(response);
      if (response.status === 204) return null;
      const data = await this.#readJson(response);
      this.#notifyDebugMail(data);
      return data;
    }

    const error = await this.#toError(response);

    if (error.is("ELEVATION_REQUIRED") && !retried && this.onElevationRequired) {
      const confirmed = await this.onElevationRequired();
      if (confirmed) return this.#request(method, path, body, options, true);
    }
    if (error.is("UNAUTHENTICATED") && this.onUnauthenticated) {
      this.onUnauthenticated(error);
    }
    throw error;
  }

  /** デバッグ状態のサーバが付ける debug.mailViewUrl（同じオリジンのパスだけ）を見て、メール表示ページを開く。 */
  #notifyDebugMail(data) {
    const url = data?.debug?.mailViewUrl;
    // 同じオリジンのパス（"/" で始まり "//" ではない）で、メール表示ページ（…/debug/mails?…）のものだけ開く。
    // サーバをサブパスに置いている場合は、パスの前に接頭辞が付く（例: /uec-tst/server2/public/index.php/debug/mails?…）。
    if (typeof url === "string" && /^(\/[^/?#][^?#]*)?\/debug\/mails\?/.test(url) && this.onDebugMail) {
      this.onDebugMail(url);
    }
  }

  /** @param {string} path @param {Record<string, any>} [query] */
  #url(path, query) {
    let url = this.basePath + path;
    const entries = Object.entries(query ?? {}).filter(([, v]) => v !== null && v !== undefined);
    if (entries.length > 0) {
      url += "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
    }
    return url;
  }

  /** @param {Response} response */
  async #readFile(response) {
    const disposition = response.headers?.get?.("Content-Disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disposition);
    try {
      return { blob: await response.blob(), filename: match ? match[1] : null, contentType: response.headers?.get?.("Content-Type") ?? null };
    } catch {
      throw new ApiError({ status: response.status, code: "INVALID_RESPONSE", message: "ダウンロードしたデータを読み取れませんでした。" });
    }
  }

  /** @param {Response} response */
  async #readJson(response) {
    try {
      return await response.json();
    } catch {
      throw new ApiError({ status: response.status, code: "INVALID_RESPONSE", message: "サーバの応答を読み取れませんでした。" });
    }
  }

  /** @param {Response} response */
  async #toError(response) {
    const retryAfterHeader = response.headers?.get?.("Retry-After");
    const retryAfter = retryAfterHeader && /^\d+$/.test(retryAfterHeader) ? Number(retryAfterHeader) : null;
    try {
      const data = await response.json();
      const e = data?.error;
      if (e && typeof e.code === "string") {
        return new ApiError({
          status: response.status,
          code: e.code,
          message: typeof e.message === "string" ? e.message : "エラーが発生しました。",
          details: Array.isArray(e.details) ? e.details : [],
          retryAfter,
        });
      }
    } catch {
      // JSON でない応答（プロキシのエラーページなど）は、下で、汎用のエラーにする。
    }
    return new ApiError({ status: response.status, code: "HTTP_ERROR", message: "サーバでエラーが発生しました。しばらくしてから、もう一度お試しください。", retryAfter });
  }
}
