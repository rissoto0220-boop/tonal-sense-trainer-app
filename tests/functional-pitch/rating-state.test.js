import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RATING_ITEMS,
  RATING_LOW_LABEL,
  RATING_HIGH_LABEL,
  isValidRating,
  createRatingState,
} from "../../src/functional-pitch/rating-state.js";

function answerableState() {
  const state = createRatingState();
  state.setAnswerable(true);
  return state;
}

test("評定項目は旋律・和音・全体の順で、質問文は仕様どおり", () => {
  assert.deepEqual(RATING_ITEMS.map((i) => i.key), ["melody", "harmony", "overall"]);
  assert.deepEqual(RATING_ITEMS.map((i) => i.outputKey), [
    "melody_change_rating", "harmony_change_rating", "overall_change_rating",
  ]);
  assert.deepEqual(RATING_ITEMS.map((i) => i.question), [
    "フレーズ1とフレーズ2では、リコーダー音の印象が変化したように感じた。",
    "フレーズ1とフレーズ2では、ピアノ音の印象が変化したように感じた。",
    "フレーズ1とフレーズ2では、フレーズ全体の印象が変化したように感じた。",
  ]);
});

test("両端のラベルは仕様どおり", () => {
  assert.equal(RATING_LOW_LABEL, "全くそう思わない");
  assert.equal(RATING_HIGH_LABEL, "とてもそう思う");
});

test("isValidRating: 1〜7の整数だけが有効", () => {
  for (const v of [1, 2, 3, 4, 5, 6, 7]) assert.equal(isValidRating(v), true, String(v));
  for (const v of [0, 8, -1, 3.5, "3", null, undefined, NaN]) assert.equal(isValidRating(v), false, String(v));
});

test("回答可能になる前は選択を受け付けない", () => {
  const state = createRatingState();
  assert.equal(state.select("melody", 4), false);
  assert.equal(state.getValue("melody"), null);
});

test("回答可能になれば3項目を選べて、選び直せる", () => {
  const state = answerableState();
  assert.equal(state.select("melody", 2), true);
  assert.equal(state.select("melody", 6), true);
  assert.equal(state.getValue("melody"), 6);
});

test("未知の項目・範囲外の値は受け付けず、既存の選択を変えない", () => {
  const state = answerableState();
  state.select("melody", 3);
  assert.equal(state.select("unknown", 3), false);
  assert.equal(state.select("melody", 0), false);
  assert.equal(state.select("melody", 8), false);
  assert.equal(state.select("melody", 3.5), false);
  assert.equal(state.getValue("melody"), 3);
});

test("3項目すべて選ぶまで進めない", () => {
  const state = answerableState();
  assert.equal(state.canProceed(), false);
  state.select("melody", 1);
  state.select("harmony", 2);
  assert.equal(state.allSelected(), false);
  assert.equal(state.canProceed(), false);
  state.select("overall", 3);
  assert.equal(state.allSelected(), true);
  assert.equal(state.canProceed(), true);
});

test("3項目選んでいても、回答可能でなければ進めない", () => {
  const state = answerableState();
  RATING_ITEMS.forEach((item) => state.select(item.key, 4));
  state.setAnswerable(false);
  assert.equal(state.canProceed(), false);
  assert.equal(state.confirm(), null);
});

test("confirm: 出力名つきの3つの値を返し、確定後は変更も再確定もできない", () => {
  const state = answerableState();
  state.select("melody", 1);
  state.select("harmony", 4);
  state.select("overall", 7);
  assert.deepEqual(state.confirm(), {
    melody_change_rating: 1,
    harmony_change_rating: 4,
    overall_change_rating: 7,
  });
  assert.equal(state.isConfirmed(), true);
  assert.equal(state.confirm(), null);
  assert.equal(state.select("melody", 2), false);
  assert.equal(state.getValue("melody"), 1);
  assert.equal(state.canProceed(), false);
});

test("確定前の選び直しが最終値になる", () => {
  const state = answerableState();
  state.select("melody", 1);
  state.select("harmony", 1);
  state.select("overall", 1);
  state.select("harmony", 5);
  assert.equal(state.confirm().harmony_change_rating, 5);
});
