import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateOrderedPairs,
  classifyChange,
  generateTrialOrder,
  validateTrialOrder,
} from "../../src/functional-pitch/trial-generator.js";
import { STIMULI, PRACTICE_TRIALS, findStimulus } from "../../src/functional-pitch/stimuli.js";

// 固定の疑似乱数(mulberry32)。同じ種なら必ず同じ数列になる。
function seededRandom(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("generateOrderedPairs: 10×9=90ペアで、自己ペアがなく、重複しない", () => {
  const pairs = generateOrderedPairs();
  assert.equal(pairs.length, 90);
  assert.ok(pairs.every((p) => p.firstStimulusId !== p.secondStimulusId));
  assert.equal(new Set(pairs.map((p) => `${p.firstStimulusId}>${p.secondStimulusId}`)).size, 90);
});

test("generateOrderedPairs: A→BとB→Aの両方を含む", () => {
  const keys = new Set(generateOrderedPairs().map((p) => `${p.firstStimulusId}>${p.secondStimulusId}`));
  assert.ok(keys.has("ch-n1-maj-mel-n1>ch-n1-maj-mel-n3"));
  assert.ok(keys.has("ch-n1-maj-mel-n3>ch-n1-maj-mel-n1"));
});

test("classifyChange: 3つの条件に分類する(属性の比較で決まる)", () => {
  const get = findStimulus;
  assert.equal(classifyChange(get("ch-n1-maj-mel-n1"), get("ch-n1-maj-mel-n3")), "melody-change");
  assert.equal(classifyChange(get("ch-n1-maj-mel-n1"), get("ch-n4-maj-mel-n1")), "chord-change");
  assert.equal(classifyChange(get("ch-n1-maj-mel-n3"), get("ch-n5-dom7-mel-n7")), "both-change");
});

test("classifyChange: 刺激IDの文字列ではなく属性項目で判定する", () => {
  // 刺激IDを無関係な値にしても、属性が同じ和音・違う旋律なら melody-change になる
  const a = { stimulusId: "x", chordRootDegree: "n1", chordQuality: "maj", melodyDegree: "n1" };
  const b = { stimulusId: "y", chordRootDegree: "n1", chordQuality: "maj", melodyDegree: "n3" };
  assert.equal(classifyChange(a, b), "melody-change");
});

test("classifyChange: 和音品質だけ違う場合も和音は異なる扱いになる", () => {
  const a = { stimulusId: "x", chordRootDegree: "n5", chordQuality: "maj", melodyDegree: "n5" };
  const b = { stimulusId: "y", chordRootDegree: "n5", chordQuality: "dom7", melodyDegree: "n5" };
  assert.equal(classifyChange(a, b), "chord-change");
});

test("classifyChange: 旋律も和音も同じ場合はエラー", () => {
  const a = STIMULI[0];
  assert.throws(() => classifyChange(a, { ...a, stimulusId: "copy" }), /分類できません/);
});

test("練習の固定条件が、属性比較による分類と一致する", () => {
  for (const trial of PRACTICE_TRIALS) {
    const condition = classifyChange(findStimulus(trial.firstStimulusId), findStimulus(trial.secondStimulusId));
    assert.equal(condition, trial.changeCondition);
  }
});

test("generateTrialOrder: 90試行で、検査(6項目)にすべて合格する", () => {
  for (const seed of [1, 2, 3, 12345, 987654321]) {
    const trials = generateTrialOrder(seededRandom(seed));
    assert.equal(trials.length, 90);
    const result = validateTrialOrder(trials);
    assert.deepEqual(result, { valid: true, errors: [] }, `seed=${seed}`);
  }
});

test("generateTrialOrder: Math.randomでも検査に合格する", () => {
  assert.equal(validateTrialOrder(generateTrialOrder()).valid, true);
});

test("generateTrialOrder: 試行番号は1〜90の連番", () => {
  const trials = generateTrialOrder(seededRandom(7));
  assert.deepEqual(trials.map((t) => t.trialNumber), Array.from({ length: 90 }, (_, i) => i + 1));
});

test("generateTrialOrder: 固定した乱数を渡すと同じ順序を再現できる", () => {
  assert.deepEqual(generateTrialOrder(seededRandom(42)), generateTrialOrder(seededRandom(42)));
});

test("generateTrialOrder: 乱数が違えば順序も変わる", () => {
  assert.notDeepEqual(generateTrialOrder(seededRandom(1)), generateTrialOrder(seededRandom(2)));
});

test("generateTrialOrder: 完全シャッフル(生成順のままではない)", () => {
  const ordered = generateOrderedPairs().map((p) => `${p.firstStimulusId}>${p.secondStimulusId}`);
  const shuffled = generateTrialOrder(seededRandom(99)).map((t) => `${t.firstStimulusId}>${t.secondStimulusId}`);
  assert.notDeepEqual(shuffled, ordered);
  assert.deepEqual([...shuffled].sort(), [...ordered].sort());
});

test("generateTrialOrder: 変化条件の内訳は 旋律24・和音6・両方60(刺激の組み合わせから決まる)", () => {
  const trials = generateTrialOrder(seededRandom(5));
  const count = (condition) => trials.filter((t) => t.changeCondition === condition).length;
  assert.equal(count("melody-change"), 24);
  assert.equal(count("chord-change"), 6);
  assert.equal(count("both-change"), 60);
});

test("generateTrialOrder: 連続制限をかけない(同じ変化条件・同じ刺激の連続が起こりうる)", () => {
  // 制限が入っていないことの確認: 多数の種で、同じ変化条件の連続が1つでも現れる
  const seen = [1, 2, 3, 4, 5].some((seed) => {
    const trials = generateTrialOrder(seededRandom(seed));
    return trials.some((t, i) => i > 0 && t.changeCondition === trials[i - 1].changeCondition);
  });
  assert.ok(seen);
});

test("validateTrialOrder: 試行数の不足を検出する", () => {
  const trials = generateTrialOrder(seededRandom(1)).slice(0, 89);
  const result = validateTrialOrder(trials);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("試行数")));
});

test("validateTrialOrder: 自己ペアを検出する", () => {
  const trials = generateTrialOrder(seededRandom(1));
  trials[0] = { ...trials[0], secondStimulusId: trials[0].firstStimulusId };
  const result = validateTrialOrder(trials);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("自己ペア")));
});

test("validateTrialOrder: ペアの重複・欠落・出現回数の偏りを検出する", () => {
  const trials = generateTrialOrder(seededRandom(1));
  trials[1] = { ...trials[0] }; // 先頭と同じペアに置き換える(試行数は90のまま)
  const result = validateTrialOrder(trials);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("重複")));
  assert.ok(result.errors.some((e) => e.includes("含まれていないペア")));
  assert.ok(result.errors.some((e) => e.includes("第1刺激回数") || e.includes("第2刺激回数")));
});
