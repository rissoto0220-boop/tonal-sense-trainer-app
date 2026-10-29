import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TRAINING_STIMULI, TRAINING_KEY_CODES } from "../../src/training/stimuli.js";
import { AUDIO_EDGE_SILENCE_SECONDS } from "../../src/training/question-audio.js";

// 音源の検査スクリプト(Python)は JS を読めないため、刺激・Key・無音の基準を自前で持っている。
// 二重に書いた情報が食い違わないことを、スクリプトの文字列を読んで確認する。
const script = readFileSync(new URL("../../scripts/check-training-wavs.py", import.meta.url), "utf8");

test("検査スクリプトの10刺激(第1音/第1和音)が、TRAINING_STIMULI と同じ内容・同じ順", () => {
  const block = script.slice(script.indexOf("STIMULI = ["), script.indexOf("\n]\n", script.indexOf("STIMULI = [")));
  const pairs = [...block.matchAll(/\("(n\d)", "(ch-[a-z0-9-]+)"\)/g)].map((match) => [match[1], match[2]]);
  const expected = TRAINING_STIMULI.map((stimulus) => [stimulus.parts.melody.events[0].degree, stimulus.parts.harmony.events[0].chordRef]);
  assert.deepEqual(pairs, expected);
});

test("検査スクリプトのKeyが TRAINING_KEY_CODES と同じ", () => {
  const keys = [...script.match(/KEY_PREFIXES = \{([^}]*)\}/)[1].matchAll(/"([A-Za-z]+)":/g)].map((match) => match[1]);
  assert.deepEqual(keys, TRAINING_KEY_CODES);
});

test("検査スクリプトの前後の無音の基準が、アプリの AUDIO_EDGE_SILENCE_SECONDS と同じ", () => {
  const value = Number(script.match(/^EXPECTED_EDGE_SILENCE = ([\d.]+)$/m)[1]);
  assert.equal(value, AUDIO_EDGE_SILENCE_SECONDS);
});
