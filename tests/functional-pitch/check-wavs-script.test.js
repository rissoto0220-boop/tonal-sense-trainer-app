import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  STIMULI,
  MEASUREMENT_KEYS,
  PRACTICE_KEY,
  PRACTICE_TRIALS,
  TONE_CHECK_PARTS,
  AUDIO_VERSION,
  phraseFilenameFor,
  toneCheckFilenameFor,
} from "../../src/functional-pitch/stimuli.js";

// 音源の検査スクリプト(Python)は JS を読めないため、刺激・Key・版数を自前で持っている。
// 二重に書いた情報が食い違わないことを、スクリプトを読んで確認する。
const scriptUrl = new URL("../../scripts/check-functional-pitch-wavs.py", import.meta.url);
const script = readFileSync(scriptUrl, "utf8");

function stringList(name) {
  const body = script.match(new RegExp(`^${name} = \\[([^\\]]*)\\]`, "m"))[1];
  return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

test("検査スクリプトの10刺激が、STIMULI と同じ内容・同じ順", () => {
  assert.deepEqual(stringList("STIMULUS_IDS"), STIMULI.map((stimulus) => stimulus.stimulusId));
});

test("検査スクリプトの練習4刺激が、PRACTICE_TRIALS に出る刺激(重複なし)と同じ", () => {
  const ids = [...new Set(PRACTICE_TRIALS.flatMap((trial) => [trial.firstStimulusId, trial.secondStimulusId]))];
  assert.deepEqual(new Set(stringList("PRACTICE_STIMULUS_IDS")), new Set(ids));
});

test("検査スクリプトの本番Key・練習Key・音色確認パート・版数が、アプリと同じ", () => {
  assert.deepEqual(stringList("MEASUREMENT_KEYS"), MEASUREMENT_KEYS);
  assert.equal(script.match(/^PRACTICE_KEY = "([^"]+)"/m)[1], PRACTICE_KEY);
  assert.deepEqual(stringList("TONE_CHECK_PARTS"), TONE_CHECK_PARTS);
  assert.equal(script.match(/^AUDIO_VERSION = "([^"]+)"/m)[1], AUDIO_VERSION);
});

test("検査スクリプトが期待するファイル名26本が、アプリが要求するファイル名と同じ", () => {
  const fromScript = execFileSync("python3", ["-I", scriptUrl.pathname, "--list"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const practiceIds = [...new Set(PRACTICE_TRIALS.flatMap((trial) => [trial.firstStimulusId, trial.secondStimulusId]))];
  const fromApp = [
    ...MEASUREMENT_KEYS.flatMap((key) => STIMULI.map((stimulus) => phraseFilenameFor(key, stimulus.stimulusId))),
    ...practiceIds.map((id) => phraseFilenameFor(PRACTICE_KEY, id)),
    ...TONE_CHECK_PARTS.map((part) => toneCheckFilenameFor(part)),
  ];
  assert.equal(fromScript.length, 26);
  assert.deepEqual([...fromScript].sort(), [...fromApp].sort());
});
