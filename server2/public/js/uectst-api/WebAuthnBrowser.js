// ブラウザの WebAuthn（navigator.credentials）と、API の JSON 形式（base64url）との変換。
// サーバが返す options（JSON）を navigator.credentials に渡せる形にし、結果を API に送れる JSON（toJSON と同じ形式）にする。

/** @param {string} text */
export function base64UrlToBuffer(text) {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** @param {ArrayBuffer|ArrayBufferView|null|undefined} buffer */
export function bufferToBase64Url(buffer) {
  if (buffer === null || buffer === undefined) return null;
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** パスキーが使える環境か（HTTPS または localhost で、WebAuthn に対応しているブラウザ）。 */
export function isPasskeySupported() {
  return typeof globalThis.PublicKeyCredential !== "undefined" && typeof globalThis.navigator?.credentials?.create === "function";
}

/**
 * 登録（navigator.credentials.create）。
 * @param {object} options #25 のレスポンス
 * @param {CredentialsContainer} [credentials] テスト用に差し替える
 * @returns {Promise<object>} #26 の credential
 */
export async function createCredential(options, credentials = globalThis.navigator?.credentials) {
  const publicKey = {
    ...options,
    challenge: base64UrlToBuffer(options.challenge),
    user: { ...options.user, id: base64UrlToBuffer(options.user.id) },
    excludeCredentials: (options.excludeCredentials ?? []).map((c) => ({ ...c, id: base64UrlToBuffer(c.id) })),
  };
  const credential = await credentials.create({ publicKey });
  if (!credential) throw new DOMException("パスキーを作成できませんでした", "NotAllowedError");
  const response = credential.response;
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      attestationObject: bufferToBase64Url(response.attestationObject),
      transports: typeof response.getTransports === "function" ? response.getTransports() : [],
    },
  };
}

/**
 * 確認（navigator.credentials.get）。
 * @param {object} options #23 のレスポンス
 * @param {CredentialsContainer} [credentials] テスト用に差し替える
 * @returns {Promise<object>} #15 の passkey
 */
export async function getCredential(options, credentials = globalThis.navigator?.credentials) {
  const publicKey = {
    ...options,
    challenge: base64UrlToBuffer(options.challenge),
    allowCredentials: (options.allowCredentials ?? []).map((c) => ({ ...c, id: base64UrlToBuffer(c.id) })),
  };
  const credential = await credentials.get({ publicKey });
  if (!credential) throw new DOMException("パスキーを確認できませんでした", "NotAllowedError");
  const response = credential.response;
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      signature: bufferToBase64Url(response.signature),
      userHandle: bufferToBase64Url(response.userHandle),
    },
  };
}
