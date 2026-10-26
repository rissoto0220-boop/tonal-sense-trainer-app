import { test } from "node:test";
import assert from "node:assert/strict";
import { generateQuestionSequence } from "../../src/training/question-sequence.js";
import { DEFAULT_QUESTION_COUNT } from "../../src/training/definitions.js";

// 固定の乱数(線形合同法)。同じ種なら同じ数列になる。
function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const makePool = (size) => Array.from({ length: size }, (_, i) => ({ id: `q${i + 1}` }));
const counts = (sequence) => {
  const result = new Map();
  for (const item of sequence) result.set(item, (result.get(item) ?? 0) + 1);
  return result;
};
const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

test("既定の出題数は15", () => {
  assert.equal(DEFAULT_QUESTION_COUNT, 15);
  assert.equal(generateQuestionSequence(makePool(20), { randomFn: seededRandom(1) }).length, 15);
});

test("5種類・15問: 各候補がちょうど3回。5件ずつの周は、それぞれ全候補を1回ずつ含む", () => {
  const pool = makePool(5);
  const sequence = generateQuestionSequence(pool, { randomFn: seededRandom(7) });
  assert.equal(sequence.length, 15);
  assert.ok(pool.every((item) => counts(sequence).get(item) === 3));
  for (const cycle of chunk(sequence, 5)) {
    assert.equal(new Set(cycle).size, 5, "1周の中で重複しない");
  }
});

test("7種類・15問: 7+7+1。最初の2周は全候補を1回ずつ、各候補の出現は2回または3回", () => {
  const pool = makePool(7);
  const sequence = generateQuestionSequence(pool, { randomFn: seededRandom(11) });
  const [first, second, last] = chunk(sequence, 7);
  assert.equal(new Set(first).size, 7);
  assert.equal(new Set(second).size, 7);
  assert.equal(last.length, 1);
  assert.ok(pool.includes(last[0]));
  const timesList = pool.map((item) => counts(sequence).get(item));
  assert.ok(timesList.every((times) => times === 2 || times === 3));
  assert.equal(timesList.filter((times) => times === 3).length, 1, "端数の1件だけが3回目");
});

test("種類が出題数以上(20種類・15問): 重複なし", () => {
  const sequence = generateQuestionSequence(makePool(20), { randomFn: seededRandom(3) });
  assert.equal(sequence.length, 15);
  assert.equal(new Set(sequence).size, 15);
});

test("種類と出題数が同じ(15種類・15問): 全候補が1回ずつ", () => {
  const pool = makePool(15);
  const sequence = generateQuestionSequence(pool, { randomFn: seededRandom(5) });
  assert.equal(new Set(sequence).size, 15);
  assert.ok(pool.every((item) => sequence.includes(item)));
});

test("出題数は調整できる(例: 10問、1問、30問)", () => {
  const pool = makePool(5);
  assert.equal(generateQuestionSequence(pool, { questionCount: 10, randomFn: seededRandom(2) }).length, 10);
  assert.equal(generateQuestionSequence(pool, { questionCount: 1, randomFn: seededRandom(2) }).length, 1);
  const thirty = generateQuestionSequence(pool, { questionCount: 30, randomFn: seededRandom(2) });
  assert.ok(pool.every((item) => counts(thirty).get(item) === 6));
});

test("固定の乱数なら同じ順序になる(再現できる)。乱数が違えば順序は変わる", () => {
  const pool = makePool(5);
  const a = generateQuestionSequence(pool, { randomFn: seededRandom(42) });
  const b = generateQuestionSequence(pool, { randomFn: seededRandom(42) });
  assert.deepEqual(a, b);
  const others = [1, 2, 3, 4, 5, 6].map((seed) => generateQuestionSequence(pool, { randomFn: seededRandom(seed) }));
  assert.ok(others.some((sequence) => sequence.some((item, i) => item !== a[i])), "乱数を変えれば順序が変わる");
});

test("周ごとに別々にシャッフルされる(全周が同じ並びのままにならない)", () => {
  const pool = makePool(10);
  const sameAcrossCycles = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
    const [first, second] = chunk(generateQuestionSequence(pool, { questionCount: 20, randomFn: seededRandom(seed) }), 10);
    return first.every((item, i) => item === second[i]);
  });
  assert.ok(sameAcrossCycles.some((same) => !same));
});

test("pool を書き換えない。戻り値の要素は pool の要素そのもの", () => {
  const pool = makePool(5);
  const before = pool.map((item) => item.id);
  const sequence = generateQuestionSequence(pool, { randomFn: seededRandom(9) });
  assert.deepEqual(pool.map((item) => item.id), before);
  assert.ok(sequence.every((item) => pool.includes(item)));
});

test("異常: 出題候補が空、または配列でない", () => {
  assert.throws(() => generateQuestionSequence([]), /出題候補が空です/);
  assert.throws(() => generateQuestionSequence(undefined), /出題候補が空です/);
});

test("異常: 出題数が1以上の整数でない", () => {
  for (const questionCount of [0, -1, 2.5, "15", NaN, null]) {
    assert.throws(() => generateQuestionSequence(makePool(5), { questionCount }), /出題数は1以上の整数/);
  }
});
