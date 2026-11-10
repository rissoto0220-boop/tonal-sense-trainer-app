import { test } from "node:test";
import assert from "node:assert/strict";
import { FamilyClient, OrgClient, ApiError } from "../../public/js/uectst-api/index.js";

function recorder(responses) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, method: init.method, accept: init.headers.Accept, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const next = responses.shift() ?? { status: 204 };
    if (next.status === 204) return new Response(null, { status: 204 });
    if (next.file) {
      return new Response(next.file, { status: 200, headers: { "Content-Type": next.type, "Content-Disposition": next.disposition } });
    }
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
  return { calls, fetchFn };
}

test("利用データの API（家族向け）が、仕様どおりのメソッド・パス・本文で呼ぶ", async () => {
  const session = { sessionId: "s1", testType: "training" };
  const cases = [
    [(a) => a.testData.submit("u/1", session), "POST", "/api/v1/users/u%2F1/test-sessions", session],
    [(a) => a.testData.list("u1"), "GET", "/api/v1/users/u1/test-sessions", undefined],
    [(a) => a.testData.list("u1", { testType: "training", includeInterrupted: true, limit: 10, cursor: null }), "GET", "/api/v1/users/u1/test-sessions?testType=training&includeInterrupted=true&limit=10", undefined],
    [(a) => a.testData.get("u1", "s1"), "GET", "/api/v1/users/u1/test-sessions/s1", undefined],
  ];
  for (const [fn, method, url, body] of cases) {
    const r = recorder([{ status: 200, body: {} }]);
    await fn(new FamilyClient({ fetchFn: r.fetchFn }));
    assert.equal(r.calls[0].method, method, url);
    assert.equal(r.calls[0].url, url);
    assert.deepEqual(r.calls[0].body, body, url);
  }
});

test("利用データの API（運用担当者・組織向け）が、ベースパス /api/v1/org で呼ぶ", async () => {
  const cases = [
    [(a) => a.testData.users({ limit: 20 }), "GET", "/api/v1/org/users?limit=20"],
    [(a) => a.testData.sessions("u1", { testType: "training" }), "GET", "/api/v1/org/users/u1/test-sessions?testType=training"],
    [(a) => a.testData.session("u1", "s1"), "GET", "/api/v1/org/users/u1/test-sessions/s1"],
    [(a) => a.testData.deleteSession("s/1"), "DELETE", "/api/v1/org/test-sessions/s%2F1"],
  ];
  for (const [fn, method, url] of cases) {
    const r = recorder([{ status: 200, body: {} }]);
    await fn(new OrgClient({ fetchFn: r.fetchFn }));
    assert.equal(r.calls[0].method, method, url);
    assert.equal(r.calls[0].url, url);
  }
});

test("CSV・ZIP のダウンロードは、blob とファイル名を返す。配列はカンマ区切りで送る", async () => {
  const r = recorder([{ file: "\uFEFFuser_id\r\n", type: "text/csv; charset=utf-8", disposition: 'attachment; filename="uec-tst_training_responses_20261105_153000.csv"' }]);
  const api = new FamilyClient({ fetchFn: r.fetchFn });
  const result = await api.testData.exportCsv("u1", { testType: "training", kind: "responses" });
  assert.equal(r.calls[0].url, "/api/v1/users/u1/test-exports?testType=training&kind=responses");
  assert.equal(r.calls[0].accept, "*/*");
  assert.equal(result.filename, "uec-tst_training_responses_20261105_153000.csv");
  assert.equal(result.contentType, "text/csv; charset=utf-8");
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]); // BOM 付き UTF-8 のまま渡す

  const z = recorder([{ file: "zip", type: "application/zip", disposition: 'attachment; filename="uec-tst_test-data_20261105_153000.zip"' }]);
  const org = new OrgClient({ fetchFn: z.fetchFn });
  const zip = await org.testData.export({ userId: ["a", "b"], testType: ["training", "relative_pitch"], kind: "sessions", includeInterrupted: false });
  assert.equal(z.calls[0].url, "/api/v1/org/test-exports?userId=a%2Cb&testType=training%2Crelative_pitch&kind=sessions&includeInterrupted=false");
  assert.equal(zip.filename, "uec-tst_test-data_20261105_153000.zip");
});

test("ダウンロードのエラーは ApiError になる（範囲が大きすぎる場合など）", async () => {
  const r = recorder([{ status: 422, body: { error: { code: "EXPORT_TOO_LARGE", message: "大きすぎます" } } }]);
  const org = new OrgClient({ fetchFn: r.fetchFn });
  await assert.rejects(() => org.testData.export({}), (e) => e instanceof ApiError && e.is("EXPORT_TOO_LARGE") && e.status === 422);
});
