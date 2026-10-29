import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFunctionalPitchOptions } from "../../src/functional-pitch/dev-flag.js";

const resolve = (search) => resolveFunctionalPitchOptions({ search });

test("旗がなければ無効(本番では機能的音感を選べない)", () => {
  assert.equal(resolve("").enabled, false);
  assert.equal(resolve("?").enabled, false);
  assert.equal(resolve("?upload=1").enabled, false);
  assert.equal(resolve("?upload=local").enabled, false);
});

test("?functional=dev 以外の値では無効", () => {
  for (const search of ["?functional=1", "?functional=true", "?functional=DEV", "?functional=", "?functional", "?functional=dev2"]) {
    assert.equal(resolve(search).enabled, false, search);
  }
});

test("旗がなければ、practice や trials があっても無効のまま(既定値に戻る)", () => {
  assert.deepEqual(resolve("?practice=skip&trials=3"), { enabled: false, practiceRequired: true, trialLimit: null });
});

test("?functional=dev で有効。既定は練習あり・全試行", () => {
  assert.deepEqual(resolve("?functional=dev"), { enabled: true, practiceRequired: true, trialLimit: null });
});

test("&practice=skip で練習を省略する。それ以外の値は省略しない", () => {
  assert.equal(resolve("?functional=dev&practice=skip").practiceRequired, false);
  assert.equal(resolve("?functional=dev&practice=yes").practiceRequired, true);
  assert.equal(resolve("?functional=dev&practice=").practiceRequired, true);
});

test("&trials=N で試行数を1〜90に短縮できる。不正な値は無視する", () => {
  assert.equal(resolve("?functional=dev&trials=3").trialLimit, 3);
  assert.equal(resolve("?functional=dev&trials=1").trialLimit, 1);
  assert.equal(resolve("?functional=dev&trials=90").trialLimit, 90);
  for (const bad of ["0", "91", "-1", "2.5", "abc", "", "1e2"]) {
    assert.equal(resolve(`?functional=dev&trials=${bad}`).trialLimit, null, bad);
  }
});

test("パラメーターの順序や他のパラメーターに影響されない", () => {
  assert.deepEqual(resolve("?upload=local&trials=5&functional=dev&practice=skip"), {
    enabled: true, practiceRequired: false, trialLimit: 5,
  });
});

test("location が無くても例外にならず、無効", () => {
  assert.equal(resolveFunctionalPitchOptions(undefined).enabled, false);
  assert.equal(resolveFunctionalPitchOptions({}).enabled, false);
});
