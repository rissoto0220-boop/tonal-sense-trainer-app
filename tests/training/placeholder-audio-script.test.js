import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TRAINING_STIMULI, TRAINING_SOUNDS_BASE_PATH, TRAINING_KEY_CODES } from "../../src/training/stimuli.js";

// 仮音源の生成スクリプト(Python)は JS を読めないため、刺激の組み合わせを自前で持っている。
// 二重に書いた情報が食い違わないことを、スクリプトの文字列を読んで確認する。
const script = readFileSync(new URL("../../scripts/generate-training-placeholder-audio.py", import.meta.url), "utf8");

function section(name) {
  const start = script.indexOf(`${name} = `);
  assert.ok(start >= 0, `${name} がスクリプトにない`);
  return script.slice(start, script.indexOf("\n]\n", start));
}

test("スクリプトの10刺激(第1音/第1和音)が、TRAINING_STIMULI と同じ内容・同じ順", () => {
  const pairs = [...section("STIMULI").matchAll(/\("(n\d)", "(ch-[a-z0-9-]+)"\)/g)].map((match) => [match[1], match[2]]);
  const expected = TRAINING_STIMULI.map((stimulus) => [stimulus.parts.melody.events[0].degree, stimulus.parts.harmony.events[0].chordRef]);
  assert.deepEqual(pairs, expected);
});

test("スクリプトの出力先が TRAINING_SOUNDS_BASE_PATH と同じ", () => {
  assert.equal(TRAINING_SOUNDS_BASE_PATH, "public/sounds/training/");
  assert.match(script, /OUTPUT_DIR = Path\(__file__\)\.resolve\(\)\.parent\.parent \/ "public" \/ "sounds" \/ "training"/);
});

test("スクリプトのKeyが TRAINING_KEY_CODES と同じ", () => {
  const keys = [...script.match(/KEY_TONIC_SEMITONES = \{([^}]*)\}/)[1].matchAll(/"([A-Za-z]+)":/g)].map((match) => match[1]);
  assert.deepEqual(keys, TRAINING_KEY_CODES);
});

test("フィードバックのフレーズは、出題される第1音(7つ)すべてにある", () => {
  const firstDegrees = new Set(TRAINING_STIMULI.map((stimulus) => stimulus.parts.melody.events[0].degree));
  const phraseBlock = script.slice(script.indexOf("FEEDBACK_PHRASES = {"), script.indexOf("\n}\n", script.indexOf("FEEDBACK_PHRASES = {")));
  const phraseKeys = new Set([...phraseBlock.matchAll(/^\s+"(n\d)": \[/gm)].map((match) => match[1]));
  assert.deepEqual(phraseKeys, firstDegrees);
});

test("スクリプトのテンポは ♩=120(研究者の決定)", () => {
  assert.match(script, /^BPM = 120$/m);
});
