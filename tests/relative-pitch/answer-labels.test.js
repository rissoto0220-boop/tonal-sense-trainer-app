import { test } from "node:test";
import assert from "node:assert/strict";
import { ANSWER_LABELS, FULL_ANSWER_LABELS } from "../../src/relative-pitch/answer-labels.js";

test("ANSWER_LABELSは、仕様11.1の12種類に「ド」「高いド」を加えた14種類(2026-09-18更新)", () => {
  assert.deepEqual(ANSWER_LABELS.map((l) => l.text), [
    "ド", "ド♯", "レ", "レ♯", "ミ", "ファ", "ファ♯",
    "ソ", "ソ♯", "ラ", "ラ♯", "シ", "ド↑", "ド♯↑",
  ]);
});

test("ANSWER_LABELS: 「#」を含むラベルには♭側の異名同音表記が付く", () => {
  assert.deepEqual(ANSWER_LABELS.map((l) => l.enharmonic), [
    null, "レ♭", null, "ミ♭", null, null, "ソ♭",
    null, "ラ♭", null, "シ♭", null, null, "レ♭↑",
  ]);
});

test("ANSWER_LABELS: 末尾2つ(高いド・高いド#)だけextraがtrue(2026-09-18更新)", () => {
  assert.deepEqual(ANSWER_LABELS.map((l) => l.extra), [
    false, false, false, false, false, false, false,
    false, false, false, false, false, true, true,
  ]);
});

test("FULL_ANSWER_LABELSは、完全版の半音差0〜11に対応する12種類(仕様6.2、2026-09-18追加)", () => {
  assert.deepEqual(FULL_ANSWER_LABELS.map((l) => l.text), [
    "ド", "ド♯", "レ", "レ♯", "ミ", "ファ", "ファ♯", "ソ", "ソ♯", "ラ", "ラ♯", "シ",
  ]);
});

test("FULL_ANSWER_LABELS: オクターブ重複ボタンが無いため、extraは全てfalse(2026-09-18追加)", () => {
  assert.deepEqual(FULL_ANSWER_LABELS.map((l) => l.extra), FULL_ANSWER_LABELS.map(() => false));
});
