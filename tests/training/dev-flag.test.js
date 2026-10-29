import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTrainingOptions, MAX_DEV_QUESTION_COUNT } from "../../src/training/dev-flag.js";

const at = (search) => resolveTrainingOptions({ search });
const DISABLED = { enabled: false, replayMode: "question-only", questionCount: null };

test("旗(?training=dev)がなければ無効。他のパラメーターは無視", () => {
  assert.deepEqual(at(""), DISABLED);
  assert.deepEqual(at("?replay=setup&questions=3"), DISABLED);
  for (const value of ["DEV", "dev2", "1", "true", ""]) assert.deepEqual(at(`?training=${value}`), DISABLED, value);
  assert.deepEqual(resolveTrainingOptions(undefined), DISABLED);
  assert.deepEqual(resolveTrainingOptions({}), DISABLED);
});

test("旗があれば有効。既定はリプレイ「出題音だけ」、出題数は指定なし(メニューの15問)", () => {
  assert.deepEqual(at("?training=dev"), { enabled: true, replayMode: "question-only", questionCount: null });
});

test("&replay=setup でリプレイを「調セットアップから」にする。それ以外の値は既定のまま", () => {
  assert.equal(at("?training=dev&replay=setup").replayMode, "with-setup");
  assert.equal(at("?training=dev&replay=question").replayMode, "question-only");
});

test("&questions=N は 1〜60 の整数だけ有効。それ以外は無視", () => {
  assert.equal(MAX_DEV_QUESTION_COUNT, 60);
  assert.equal(at("?training=dev&questions=3").questionCount, 3);
  assert.equal(at("?training=dev&questions=60").questionCount, 60);
  for (const value of ["0", "61", "-1", "2.5", "abc", "", "1e1"]) {
    assert.equal(at(`?training=dev&questions=${value}`).questionCount, value === "1e1" ? 10 : null, value);
  }
});
