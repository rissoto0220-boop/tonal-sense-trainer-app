import { test } from "node:test";
import assert from "node:assert/strict";
import { FamilyClient, RecoveryCode, readFragmentToken } from "../../public/js/uectst-api/index.js";

function recorder(status = 200, body = {}) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return { calls, fetchFn };
}

function call(fn) {
  return async () => {
    const r = recorder();
    const api = new FamilyClient({ fetchFn: r.fetchFn });
    await fn(api);
    return r.calls[0];
  };
}

test("各 API が、仕様どおりのメソッド・パス・本文で呼ぶ", async () => {
  const cases = [
    [(a) => a.registration.start("a@example.com", "tok"), "POST", "/api/v1/registrations", { email: "a@example.com", captchaToken: "tok" }],
    [(a) => a.registration.verify("T"), "POST", "/api/v1/registrations/verify", { token: "T" }],
    [(a) => a.registration.complete("T", ["a", "b"]), "POST", "/api/v1/registrations/complete", { token: "T", users: [{ name: "a" }, { name: "b" }] }],
    [(a) => a.sessions.login("CODE"), "POST", "/api/v1/sessions", { recoveryCode: "CODE" }],
    [(a) => a.sessions.current(), "GET", "/api/v1/sessions/current", undefined],
    [(a) => a.sessions.logout(), "DELETE", "/api/v1/sessions/current", undefined],
    [(a) => a.sessions.selectUser("u1"), "PUT", "/api/v1/sessions/current/selected-user", { userId: "u1" }],
    [(a) => a.sessions.list(), "GET", "/api/v1/sessions", undefined],
    [(a) => a.sessions.revoke("s/1"), "DELETE", "/api/v1/sessions/s%2F1", undefined],
    [(a) => a.users.list(), "GET", "/api/v1/users", undefined],
    [(a) => a.users.add("x"), "POST", "/api/v1/users", { name: "x" }],
    [(a) => a.users.rename("u1", "y"), "PATCH", "/api/v1/users/u1", { name: "y" }],
    [(a) => a.users.reorder(["b", "a"]), "PUT", "/api/v1/users/order", { userIds: ["b", "a"] }],
    [(a) => a.users.delete("u1"), "DELETE", "/api/v1/users/u1", undefined],
    [(a) => a.account.elevateWithRecoveryCode("C"), "POST", "/api/v1/elevation", { recoveryCode: "C" }],
    [(a) => a.account.reissueRecoveryCode(), "POST", "/api/v1/recovery-code", {}],
    [(a) => a.account.withdraw(), "DELETE", "/api/v1/family", undefined],
  ];
  for (const [fn, method, url, body] of cases) {
    const c = await call(fn)();
    assert.equal(c.init.method, method, url);
    assert.equal(c.url, url);
    assert.deepEqual(c.init.body === undefined ? undefined : JSON.parse(c.init.body), body, url);
  }
});

test("確認が必要なとき、確認の後に一度だけやり直す", async () => {
  let n = 0;
  const fetchFn = async () => {
    n++;
    if (n === 1) return new Response(JSON.stringify({ error: { code: "ELEVATION_REQUIRED", message: "m" } }), { status: 403 });
    return new Response(null, { status: 204 });
  };
  const api = new FamilyClient({ fetchFn, onElevationRequired: async () => true });
  assert.equal(await api.users.delete("u1"), null);
  assert.equal(n, 2);
});

test("復旧コード: 正規化・検査・整形", () => {
  assert.equal(RecoveryCode.normalize(" ａｂｃ-ｏｉｌ ー "), "ABC011");
  assert.equal(RecoveryCode.validate("short"), "INVALID_FORMAT");
  // チェック文字の求め方はサーバと同じ。末尾を変えた不正なコードは検出される。
  const payload = "7K3QMX9TPAH2W8RDF6NB4CJZ";
  let sum = 0;
  let factor = 2;
  for (let i = payload.length - 1; i >= 0; i--) {
    const v = factor * RecoveryCode.ALPHABET.indexOf(payload[i]);
    sum += Math.floor(v / 32) + (v % 32);
    factor = factor === 2 ? 1 : 2;
  }
  const check = RecoveryCode.ALPHABET[(32 - (sum % 32)) % 32];
  assert.equal(RecoveryCode.validate(payload + check), null);
  const wrong = RecoveryCode.ALPHABET[(RecoveryCode.ALPHABET.indexOf(check) + 1) % 32];
  assert.equal(RecoveryCode.validate(payload + wrong), "CHECK_CHARACTER_MISMATCH");
  assert.equal(RecoveryCode.format(payload + check), "7K3QM-X9TPA-H2W8R-DF6NB-4CJZ" + check);
  assert.equal(RecoveryCode.format("abcdefg"), "ABCDE-FG");
});

test("メールのリンクのトークンの取り出し", () => {
  const t = "A".repeat(43);
  assert.equal(readFragmentToken("#token=" + t), t);
  assert.equal(readFragmentToken("#token=short"), null);
  assert.equal(readFragmentToken("", "token"), null);
});
