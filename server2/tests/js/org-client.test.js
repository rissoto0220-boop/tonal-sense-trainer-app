import { test } from "node:test";
import assert from "node:assert/strict";
import { FamilyClient, OrgClient, ApiError, bufferToBase64Url } from "../../public/js/uectst-api/index.js";

function recorder(responses) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const next = responses.shift() ?? { status: 204 };
    if (next.status === 204) return new Response(null, { status: 204 });
    const headers = { "Content-Type": "application/json", ...(next.headers ?? {}) };
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200, headers });
  };
  return { calls, fetchFn };
}

test("研究者・組織の API が、仕様どおりのメソッド・パス・本文で呼ぶ（ベースパスは /api/v1/org）", async () => {
  const cases = [
    [(a) => a.sessions.login("example-univ", "pw"), "POST", "/api/v1/org/sessions", { loginId: "example-univ", password: "pw" }],
    [(a) => a.sessions.passkeyOptions(), "POST", "/api/v1/org/sessions/passkey-options", {}],
    [(a) => a.sessions.completeWithPasskey({ id: "x" }), "POST", "/api/v1/org/sessions/passkey", { passkey: { id: "x" } }],
    [(a) => a.sessions.current(), "GET", "/api/v1/org/sessions/current", undefined],
    [(a) => a.sessions.logout(), "DELETE", "/api/v1/org/sessions/current", undefined],
    [(a) => a.account.changePassword("old", "new"), "PUT", "/api/v1/org/password", { currentPassword: "old", newPassword: "new" }],
    [(a) => a.account.elevate("pw"), "POST", "/api/v1/org/elevation", { password: "pw" }],
    [(a) => a.passkeys.list(), "GET", "/api/v1/org/passkeys", undefined],
    [(a) => a.passkeys.registrationOptions(), "POST", "/api/v1/org/passkeys/registration-options", {}],
    [(a) => a.passkeys.register({ id: "x" }), "POST", "/api/v1/org/passkeys", { credential: { id: "x" } }],
    [(a) => a.passkeys.delete("p/1"), "DELETE", "/api/v1/org/passkeys/p%2F1", undefined],
    [(a) => a.invitations.send("a@example.com"), "POST", "/api/v1/org/invitations", { email: "a@example.com" }],
    [(a) => a.invitations.pendingCount(), "GET", "/api/v1/org/invitations", undefined],
    [(a) => a.invitations.revokeAll(), "DELETE", "/api/v1/org/invitations", undefined],
    [(a) => a.invitations.members(), "GET", "/api/v1/org/members", undefined],
    [(a) => a.invitations.removeMember("f1"), "DELETE", "/api/v1/org/members/f1", undefined],
    [(a) => a.admin.list(), "GET", "/api/v1/org/organizations", undefined],
    [(a) => a.admin.create("○○大学", "example-univ"), "POST", "/api/v1/org/organizations", { name: "○○大学", loginId: "example-univ" }],
    [(a) => a.admin.rename("o1", "新名称"), "PATCH", "/api/v1/org/organizations/o1", { name: "新名称" }],
    [(a) => a.admin.resetPassword("o1"), "POST", "/api/v1/org/organizations/o1/password-reset", {}],
    [(a) => a.admin.delete("o1"), "DELETE", "/api/v1/org/organizations/o1", undefined],
  ];
  for (const [fn, method, url, body] of cases) {
    const r = recorder([{ status: 200, body: {} }]);
    await fn(new OrgClient({ fetchFn: r.fetchFn }));
    assert.equal(r.calls[0].method, method, url);
    assert.equal(r.calls[0].url, url);
    assert.deepEqual(r.calls[0].body, body, url);
  }
});

test("家族の、組織への所属の API（#28〜#31）と、招待経由の本登録", async () => {
  const cases = [
    [(a) => a.membership.verifyInvitation("t"), "POST", "/api/v1/invitations/verify", { token: "t" }],
    [(a) => a.membership.get(), "GET", "/api/v1/organization-membership", undefined],
    [(a) => a.membership.join("t"), "POST", "/api/v1/organization-membership", { invitationToken: "t" }],
    [(a) => a.membership.leave(), "DELETE", "/api/v1/organization-membership", undefined],
    [(a) => a.registration.completeWithInvitation("t", ["おとうさん", "はなこ"]), "POST", "/api/v1/registrations/complete",
      { invitationToken: "t", users: [{ name: "おとうさん" }, { name: "はなこ" }] }],
  ];
  for (const [fn, method, url, body] of cases) {
    const r = recorder([{ status: 200, body: {} }]);
    await fn(new FamilyClient({ fetchFn: r.fetchFn }));
    assert.equal(r.calls[0].method, method, url);
    assert.equal(r.calls[0].url, url);
    assert.deepEqual(r.calls[0].body, body, url);
  }
});

test("ログインの失敗は ApiError になり、ロックの解除までの秒数を持つ", async () => {
  const r = recorder([
    { status: 401, body: { error: { code: "INVALID_CREDENTIALS", message: "x" } } },
    { status: 429, body: { error: { code: "ORGANIZATION_PASSWORD_LOCKED", message: "x" } }, headers: { "Retry-After": "600" } },
  ]);
  const api = new OrgClient({ fetchFn: r.fetchFn });
  await assert.rejects(() => api.sessions.login("a", "b"), (e) => e instanceof ApiError && e.is("INVALID_CREDENTIALS"));
  await assert.rejects(() => api.sessions.login("a", "b"), (e) => e.is("ORGANIZATION_PASSWORD_LOCKED") && e.retryAfter === 600);
});

test("破壊的な操作で確認が必要なとき、確認の後に、同じ操作を1回だけやり直す", async () => {
  const r = recorder([
    { status: 403, body: { error: { code: "ELEVATION_REQUIRED", message: "x" } } },
    { status: 200, body: { releasedFamilyCount: 3 } },
  ]);
  let asked = 0;
  const api = new OrgClient({ fetchFn: r.fetchFn, onElevationRequired: async () => { asked++; return true; } });
  const result = await api.admin.delete("o1");
  assert.equal(asked, 1);
  assert.equal(r.calls.length, 2);
  assert.equal(result.releasedFamilyCount, 3);
});

test("パスキーの登録: O9 → 端末 → O10", async () => {
  const options = {
    challenge: bufferToBase64Url(new Uint8Array([1, 2, 3]).buffer),
    rp: { id: "example.com", name: "n" },
    user: { id: bufferToBase64Url(new Uint8Array([9]).buffer), name: "researcher", displayName: "研究者" },
    excludeCredentials: [],
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
  const r = recorder([{ status: 200, body: options }, { status: 201, body: { passkey: { id: "p" }, authStage: 1 } }]);
  const api = new OrgClient({ fetchFn: r.fetchFn, credentials });
  const result = await api.passkeys.registerNew();

  assert.equal(r.calls[0].url, "/api/v1/org/passkeys/registration-options");
  assert.deepEqual(new Uint8Array(received.user.id), new Uint8Array([9]));
  assert.equal(r.calls[1].url, "/api/v1/org/passkeys");
  assert.equal(r.calls[1].body.credential.response.attestationObject, "BQ");
  assert.equal(result.authStage, 1);
});

test("パスキーでのログインの完了: O2 → 端末 → O3", async () => {
  const options = {
    challenge: bufferToBase64Url(new Uint8Array([1]).buffer),
    rpId: "example.com",
    allowCredentials: [{ type: "public-key", id: bufferToBase64Url(new Uint8Array([2]).buffer) }],
  };
  const credentials = {
    get: async () => ({
      id: "Ag", rawId: new Uint8Array([2]).buffer, type: "public-key",
      response: { clientDataJSON: new Uint8Array([3]).buffer, authenticatorData: new Uint8Array([4]).buffer, signature: new Uint8Array([5]).buffer, userHandle: null },
    }),
  };
  const r = recorder([{ status: 200, body: options }, { status: 200, body: { organization: { id: "o" }, authStage: 1 } }]);
  const result = await new OrgClient({ fetchFn: r.fetchFn, credentials }).sessions.loginWithPasskey();

  assert.equal(r.calls[0].url, "/api/v1/org/sessions/passkey-options");
  assert.equal(r.calls[1].url, "/api/v1/org/sessions/passkey");
  assert.deepEqual(r.calls[1].body.passkey.response, { clientDataJSON: "Aw", authenticatorData: "BA", signature: "BQ", userHandle: null });
  assert.equal(result.authStage, 1);
});

test("端末でキャンセルされたら、例外がそのまま伝わり、サーバには送らない", async () => {
  const credentials = { get: async () => { throw new DOMException("cancel", "NotAllowedError"); } };
  const r = recorder([{ status: 200, body: { challenge: "AQ", allowCredentials: [] } }]);
  const api = new OrgClient({ fetchFn: r.fetchFn, credentials });
  await assert.rejects(() => api.sessions.loginWithPasskey(), { name: "NotAllowedError" });
  assert.equal(r.calls.length, 1);
});
