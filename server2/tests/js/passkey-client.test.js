import { test } from "node:test";
import assert from "node:assert/strict";
import { FamilyClient, base64UrlToBuffer, bufferToBase64Url } from "../../public/js/uectst-api/index.js";

function recorder(responses) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const next = responses.shift() ?? { status: 204 };
    if (next.status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
  return { calls, fetchFn };
}

test("スーパーユーザ・パスワード・パスキーの API が、仕様どおりのメソッド・パス・本文で呼ぶ", async () => {
  const cases = [
    [(a) => a.superuser.get(), "GET", "/api/v1/superuser", undefined],
    [(a) => a.superuser.setPassword("4821"), "PUT", "/api/v1/superuser/password", { newPassword: "4821" }],
    [(a) => a.superuser.deletePassword(), "DELETE", "/api/v1/superuser/password", undefined],
    [(a) => a.superuser.transfer("u1"), "PUT", "/api/v1/superuser", { userId: "u1" }],
    [(a) => a.superuser.resetPassword("CODE", "7390"), "POST", "/api/v1/superuser/password/reset", { recoveryCode: "CODE", newPassword: "7390" }],
    [(a) => a.account.elevateWithPassword("4821"), "POST", "/api/v1/elevation", { superuserPassword: "4821" }],
    [(a) => a.passkeys.list(), "GET", "/api/v1/superuser/passkeys", undefined],
    [(a) => a.passkeys.registrationOptions(), "POST", "/api/v1/superuser/passkeys/registration-options", {}],
    [(a) => a.passkeys.register({ id: "x" }), "POST", "/api/v1/superuser/passkeys", { credential: { id: "x" } }],
    [(a) => a.passkeys.delete("p/1"), "DELETE", "/api/v1/superuser/passkeys/p%2F1", undefined],
    [(a) => a.passkeys.elevationOptions(), "POST", "/api/v1/elevation/passkey-options", {}],
  ];
  for (const [fn, method, url, body] of cases) {
    const r = recorder([{ status: 200, body: {} }]);
    await fn(new FamilyClient({ fetchFn: r.fetchFn }));
    assert.equal(r.calls[0].method, method, url);
    assert.equal(r.calls[0].url, url);
    assert.deepEqual(r.calls[0].body, body, url);
  }
});

test("base64url の変換", () => {
  const bytes = new Uint8Array([0, 250, 251, 252, 253, 254, 255]);
  const text = bufferToBase64Url(bytes.buffer);
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(new Uint8Array(base64UrlToBuffer(text)), bytes);
});

test("パスキーの登録: options を変換して端末に渡し、結果を #26 に送る", async () => {
  const challenge = bufferToBase64Url(new Uint8Array([1, 2, 3]).buffer);
  const options = {
    challenge,
    rp: { id: "example.com", name: "n" },
    user: { id: bufferToBase64Url(new Uint8Array([9]).buffer), name: "家族の管理用", displayName: "家族の管理用" },
    excludeCredentials: [{ type: "public-key", id: bufferToBase64Url(new Uint8Array([7]).buffer) }],
  };
  let received;
  const credentials = {
    create: async ({ publicKey }) => {
      received = publicKey;
      return {
        id: "AQID", rawId: new Uint8Array([1, 2, 3]).buffer, type: "public-key",
        response: { clientDataJSON: new Uint8Array([4]).buffer, attestationObject: new Uint8Array([5]).buffer, getTransports: () => ["internal"] },
      };
    },
  };
  const r = recorder([{ status: 200, body: options }, { status: 201, body: { passkey: { id: "p" } } }]);
  const api = new FamilyClient({ fetchFn: r.fetchFn, credentials });
  const result = await api.passkeys.registerNew();

  assert.deepEqual(new Uint8Array(received.challenge), new Uint8Array([1, 2, 3]));
  assert.deepEqual(new Uint8Array(received.user.id), new Uint8Array([9]));
  assert.deepEqual(new Uint8Array(received.excludeCredentials[0].id), new Uint8Array([7]));
  assert.equal(r.calls[1].url, "/api/v1/superuser/passkeys");
  assert.deepEqual(r.calls[1].body.credential, {
    id: "AQID", rawId: "AQID", type: "public-key",
    response: { clientDataJSON: "BA", attestationObject: "BQ", transports: ["internal"] },
  });
  assert.equal(result.passkey.id, "p");
});

test("パスキーでの確認: #23 → 端末 → #15", async () => {
  const options = {
    challenge: bufferToBase64Url(new Uint8Array([1]).buffer),
    rpId: "example.com",
    allowCredentials: [{ type: "public-key", id: bufferToBase64Url(new Uint8Array([2]).buffer) }],
  };
  let received;
  const credentials = {
    get: async ({ publicKey }) => {
      received = publicKey;
      return {
        id: "Ag", rawId: new Uint8Array([2]).buffer, type: "public-key",
        response: { clientDataJSON: new Uint8Array([3]).buffer, authenticatorData: new Uint8Array([4]).buffer, signature: new Uint8Array([5]).buffer, userHandle: null },
      };
    },
  };
  const r = recorder([{ status: 200, body: options }, { status: 200, body: { elevatedUntil: "2026-11-04T09:35:00.000Z" } }]);
  const api = new FamilyClient({ fetchFn: r.fetchFn, credentials });
  const result = await api.passkeys.elevate();

  assert.deepEqual(new Uint8Array(received.allowCredentials[0].id), new Uint8Array([2]));
  assert.equal(r.calls[1].url, "/api/v1/elevation");
  assert.deepEqual(r.calls[1].body.passkey.response, { clientDataJSON: "Aw", authenticatorData: "BA", signature: "BQ", userHandle: null });
  assert.equal(result.elevatedUntil, "2026-11-04T09:35:00.000Z");
});

test("端末で利用者がキャンセルしたら、例外がそのまま伝わり、サーバには送らない", async () => {
  const credentials = { get: async () => { throw new DOMException("cancel", "NotAllowedError"); } };
  const r = recorder([{ status: 200, body: { challenge: "AQ", allowCredentials: [] } }]);
  const api = new FamilyClient({ fetchFn: r.fetchFn, credentials });
  await assert.rejects(() => api.passkeys.elevate(), { name: "NotAllowedError" });
  assert.equal(r.calls.length, 1);
});
