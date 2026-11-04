// メールのリンク（例: https://example.com/register#token=...）から、トークンを取り出す。
// トークンは URL のフラグメント（#以降）に置かれ、サーバのアクセスログやリファラには残らない。

/**
 * @param {string} [hash] 既定は location.hash
 * @param {string} [name] 既定は "token"（招待など、画面ごとに指定する）
 * @returns {string|null}
 */
export function readFragmentToken(hash = globalThis.location?.hash ?? "", name = "token") {
  const params = new URLSearchParams(String(hash).replace(/^#/, ""));
  const value = params.get(name);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

/** 読み取った後、アドレスバーからトークンを消す（履歴・画面共有に残さない）。 */
export function clearFragment() {
  const loc = globalThis.location;
  const hist = globalThis.history;
  if (loc && hist?.replaceState) hist.replaceState(null, "", loc.pathname + loc.search);
}
