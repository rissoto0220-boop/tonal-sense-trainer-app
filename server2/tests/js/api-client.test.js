import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClient } from "../../public/js/uectst-api/ApiClient.js";
import { ApiError } from "../../public/js/uectst-api/ApiError.js";

// fetch の代わりに使う、記録つきの偽物。responses を、呼ばれた順に返す。
function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  fn.calls = calls;
  return fn;
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

const errorBody = (code, message = "メッセージ", details) => ({ error: { code, message, ...(details ? { details } : {}) } });

test("GET: ベースパスとクエリを付け、本文なし・Content-Type なしで送る", async () => {
  const f = fakeFetch(json(200, { users: [] }));
  const client = new ApiClient({ fetchFn: f });
  const result = await client.get("/users", { query: { limit: 5, q: null, flag: false } });
  assert.deepEqual(result, { users: [] });
  assert.equal(f.calls[0].url, "/api/v1/users?limit=5&flag=false");
  assert.equal(f.calls[0].init.method, "GET");
  assert.equal(f.calls[0].init.credentials, "same-origin");
  assert.equal(f.calls[0].init.body, undefined);
  assert.equal(f.calls[0].init.headers["Content-Type"], undefined);
});

test("POST/PUT/PATCH: JSON 本文と Content-Type: application/json を付ける", async () => {
  for (const method of ["post", "put", "patch"]) {
    const f = fakeFetch(json(200, { ok: true }));
    const client = new ApiClient({ fetchFn: f });
    await client[method]("/x", { name: "はなこ" });
    assert.equal(f.calls[0].init.method, method.toUpperCase());
    assert.equal(f.calls[0].init.headers["Content-Type"], "application/json");
    assert.equal(f.calls[0].init.body, JSON.stringify({ name: "はなこ" }));
  }
});

test("POST: 本文を省略すると {} を送る（サーバの CSRF 対策が Content-Type を求めるため）", async () => {
  const f = fakeFetch(json(200, {}));
  await new ApiClient({ fetchFn: f }).post("/elevation/passkey-options");
  assert.equal(f.calls[0].init.body, "{}");
  assert.equal(f.calls[0].init.headers["Content-Type"], "application/json");
});

test("DELETE: 本文を付けない", async () => {
  const f = fakeFetch(new Response(null, { status: 204 }));
  const result = await new ApiClient({ fetchFn: f }).delete("/users/abc");
  assert.equal(result, null);
  assert.equal(f.calls[0].init.body, undefined);
  assert.equal(f.calls[0].init.headers["Content-Type"], undefined);
});

test("basePath を差し替えられる（運用担当者・所属用）", async () => {
  const f = fakeFetch(json(200, {}));
  await new ApiClient({ basePath: "/api/v1/blg", fetchFn: f }).get("/sessions/current");
  assert.equal(f.calls[0].url, "/api/v1/blg/sessions/current");
});

test("エラー: 仕様のエラー形式を ApiError にする（details・Retry-After を含む）", async () => {
  const f = fakeFetch(json(422, errorBody("VALIDATION_FAILED", "ユーザ名を入力してください。", [{ field: "users[1].name", code: "REQUIRED" }])), json(429, errorBody("RATE_LIMITED"), { "Retry-After": "120" }));
  const client = new ApiClient({ fetchFn: f });

  await assert.rejects(client.post("/users", {}), (e) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 422);
    assert.equal(e.code, "VALIDATION_FAILED");
    assert.equal(e.message, "ユーザ名を入力してください。");
    assert.deepEqual(e.details, [{ field: "users[1].name", code: "REQUIRED" }]);
    assert.equal(e.is("VALIDATION_FAILED"), true);
    return true;
  });
  await assert.rejects(client.post("/registrations", {}), (e) => {
    assert.equal(e.retryAfter, 120);
    return true;
  });
});

test("エラー: JSON でない応答（プロキシのエラーページなど）は HTTP_ERROR にする", async () => {
  const f = fakeFetch(new Response("<html>Bad Gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }));
  await assert.rejects(new ApiClient({ fetchFn: f }).get("/x"), (e) => {
    assert.equal(e.status, 502);
    assert.equal(e.code, "HTTP_ERROR");
    return true;
  });
});

test("エラー: 通信の失敗は NETWORK_ERROR（status 0）にする", async () => {
  const f = fakeFetch(new TypeError("Failed to fetch"));
  await assert.rejects(new ApiClient({ fetchFn: f }).get("/x"), (e) => {
    assert.equal(e.status, 0);
    assert.equal(e.isNetworkError, true);
    return true;
  });
});

test("成功の応答が JSON として読めなければ INVALID_RESPONSE", async () => {
  const f = fakeFetch(new Response("not json", { status: 200 }));
  await assert.rejects(new ApiClient({ fetchFn: f }).get("/x"), (e) => e.code === "INVALID_RESPONSE");
});

test("401 UNAUTHENTICATED: onUnauthenticated が呼ばれ、エラーも投げられる", async () => {
  let notified = null;
  const f = fakeFetch(json(401, errorBody("UNAUTHENTICATED")));
  const client = new ApiClient({ fetchFn: f, onUnauthenticated: (e) => { notified = e.code; } });
  await assert.rejects(client.get("/sessions/current"), (e) => e.code === "UNAUTHENTICATED");
  assert.equal(notified, "UNAUTHENTICATED");
});

test("403 ELEVATION_REQUIRED: 確認に成功したら、同じ操作を1回だけやり直す", async () => {
  const f = fakeFetch(json(403, errorBody("ELEVATION_REQUIRED")), new Response(null, { status: 204 }));
  let asked = 0;
  const client = new ApiClient({ fetchFn: f, onElevationRequired: async () => { asked++; return true; } });
  const result = await client.delete("/users/abc");
  assert.equal(result, null);
  assert.equal(asked, 1);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].url, f.calls[0].url);
  assert.equal(f.calls[1].init.method, "DELETE");
});

test("403 ELEVATION_REQUIRED: 確認をやめたら、やり直さず、エラーを投げる", async () => {
  const f = fakeFetch(json(403, errorBody("ELEVATION_REQUIRED")));
  const client = new ApiClient({ fetchFn: f, onElevationRequired: async () => false });
  await assert.rejects(client.delete("/users/abc"), (e) => e.code === "ELEVATION_REQUIRED");
  assert.equal(f.calls.length, 1);
});

test("403 ELEVATION_REQUIRED: やり直しても足りない場合は、無限に繰り返さない", async () => {
  const f = fakeFetch(json(403, errorBody("ELEVATION_REQUIRED")), json(403, errorBody("ELEVATION_REQUIRED")));
  let asked = 0;
  const client = new ApiClient({ fetchFn: f, onElevationRequired: async () => { asked++; return true; } });
  await assert.rejects(client.delete("/users/abc"), (e) => e.code === "ELEVATION_REQUIRED");
  assert.equal(asked, 1);
  assert.equal(f.calls.length, 2);
});

test("onElevationRequired が未設定なら、ELEVATION_REQUIRED はそのまま投げる", async () => {
  const f = fakeFetch(json(403, errorBody("ELEVATION_REQUIRED")));
  await assert.rejects(new ApiClient({ fetchFn: f }).delete("/x"), (e) => e.code === "ELEVATION_REQUIRED");
  assert.equal(f.calls.length, 1);
});

test("デバッグ状態: レスポンスの debug.mailViewUrl を onDebugMail に渡す", async () => {
  const urls = [];
  const f = fakeFetch(json(202, { sender: "no-reply@example.com", debug: { mailViewUrl: "/debug/mails?highlight=20261106010203-abcd1234" } }));
  const client = new ApiClient({ fetchFn: f, onDebugMail: (url) => urls.push(url) });
  const result = await client.post("/registrations", { email: "a@example.com" });
  assert.deepEqual(urls, ["/debug/mails?highlight=20261106010203-abcd1234"]);
  assert.equal(result.sender, "no-reply@example.com");
});

test("デバッグ状態: サーバをサブパスに置いている場合は、接頭辞つきの URL を、そのまま渡す", async () => {
  const urls = [];
  const url = "/uec-tst/server2/public/index.php/debug/mails?highlight=a";
  const f = fakeFetch(json(202, { debug: { mailViewUrl: url } }));
  await new ApiClient({ fetchFn: f, onDebugMail: (u) => urls.push(u) }).post("/registrations", {});
  assert.deepEqual(urls, [url]);
});

test("デバッグ状態: debug がない、または /debug/ 以外の URL のときは、開かない", async () => {
  const urls = [];
  const f = fakeFetch(
    json(200, { users: [] }),
    json(200, { debug: { mailViewUrl: "https://evil.example.com/" } }),
    json(200, { debug: { mailViewUrl: "//evil.example.com/debug/" } }),
    json(200, { debug: { mailViewUrl: 5 } }),
  );
  const client = new ApiClient({ fetchFn: f, onDebugMail: (url) => urls.push(url) });
  for (let i = 0; i < 4; i++) await client.get("/x");
  assert.deepEqual(urls, []);
});

test("デバッグ状態: 既定では、名前付きのタブ（uectst-debug-mail）で開く。開けなくても失敗しない", async () => {
  const opened = [];
  const original = globalThis.window;
  try {
    globalThis.window = { open: (url, name) => opened.push([url, name]) };
    const f = fakeFetch(json(202, { debug: { mailViewUrl: "/debug/mails?highlight=a" } }));
    await new ApiClient({ fetchFn: f }).post("/registrations", {});
    assert.deepEqual(opened, [["/debug/mails?highlight=a", "uectst-debug-mail"]]);

    globalThis.window = { open: () => { throw new Error("blocked"); } };
    const g = fakeFetch(json(202, { debug: { mailViewUrl: "/debug/mails?highlight=b" } }));
    const result = await new ApiClient({ fetchFn: g }).post("/registrations", {});
    assert.equal(result.debug.mailViewUrl, "/debug/mails?highlight=b");
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});

test("デバッグ状態: onDebugMail に null を渡すと、何もしない", async () => {
  const opened = [];
  const original = globalThis.window;
  try {
    globalThis.window = { open: (...args) => opened.push(args) };
    const f = fakeFetch(json(202, { debug: { mailViewUrl: "/debug/mails?highlight=a" } }));
    await new ApiClient({ fetchFn: f, onDebugMail: null }).post("/registrations", {});
    assert.deepEqual(opened, []);
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});
