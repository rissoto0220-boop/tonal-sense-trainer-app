import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STIMULI,
  PRACTICE_TRIALS,
  findStimulus,
  phraseFilenameFor,
  toneCheckFilenameFor,
} from "../../src/functional-pitch/stimuli.js";

test("本番の刺激は10種類で、刺激IDが重複しない", () => {
  assert.equal(STIMULI.length, 10);
  assert.equal(new Set(STIMULI.map((s) => s.stimulusId)).size, 10);
});

test("刺激IDは仕様の10種類と一致する", () => {
  assert.deepEqual(STIMULI.map((s) => s.stimulusId), [
    "ch-n1-maj-mel-n1", "ch-n1-maj-mel-n3", "ch-n1-maj-mel-n5",
    "ch-n4-maj-mel-n4", "ch-n4-maj-mel-n6", "ch-n4-maj-mel-n1",
    "ch-n5-dom7-mel-n5", "ch-n5-dom7-mel-n7", "ch-n5-dom7-mel-n2", "ch-n5-dom7-mel-n4",
  ]);
});

test("属性(和音根音度・和音品質・旋律音度)が刺激IDとは別の項目として持たれている", () => {
  for (const stimulus of STIMULI) {
    assert.equal(typeof stimulus.chordRootDegree, "string");
    assert.equal(typeof stimulus.chordQuality, "string");
    assert.equal(typeof stimulus.melodyDegree, "string");
  }
  assert.deepEqual(findStimulus("ch-n5-dom7-mel-n7"), {
    stimulusId: "ch-n5-dom7-mel-n7", chordRootDegree: "n5", chordQuality: "dom7", melodyDegree: "n7",
  });
});

test("findStimulus: 未定義の刺激IDはnull", () => {
  assert.equal(findStimulus("ch-n9-maj-mel-n9"), null);
});

test("phraseFilenameFor: 仕様のファイル名形式になる", () => {
  assert.equal(phraseFilenameFor("C", "ch-n1-maj-mel-n3"), "c-phr-ch-n1-maj-mel-n3-v01.wav");
  assert.equal(phraseFilenameFor("Fis", "ch-n4-maj-mel-n6"), "fis-phr-ch-n4-maj-mel-n6-v01.wav");
  assert.equal(phraseFilenameFor("Es", "ch-n1-maj-mel-n1"), "es-phr-ch-n1-maj-mel-n1-v01.wav");
});

test("phraseFilenameFor: 未対応のKey・未定義の刺激IDはエラー", () => {
  assert.throws(() => phraseFilenameFor("A", "ch-n1-maj-mel-n1"), /未対応のKey/);
  assert.throws(() => phraseFilenameFor("C", "ch-n9-maj-mel-n9"), /未定義の刺激ID/);
});

test("toneCheckFilenameFor: 音色確認用の候補ファイル名になる", () => {
  assert.equal(toneCheckFilenameFor("recorder"), "es-practice-recorder-only-v01.wav");
  assert.equal(toneCheckFilenameFor("piano"), "es-practice-piano-only-v01.wav");
  assert.throws(() => toneCheckFilenameFor("violin"), /未対応のパート/);
});

test("練習は固定3試行で、提示順・刺激・条件が仕様どおり", () => {
  assert.deepEqual(PRACTICE_TRIALS, [
    { practiceNumber: 1, firstStimulusId: "ch-n1-maj-mel-n1", secondStimulusId: "ch-n1-maj-mel-n3", changeCondition: "melody-change" },
    { practiceNumber: 2, firstStimulusId: "ch-n1-maj-mel-n1", secondStimulusId: "ch-n4-maj-mel-n1", changeCondition: "chord-change" },
    { practiceNumber: 3, firstStimulusId: "ch-n1-maj-mel-n3", secondStimulusId: "ch-n5-dom7-mel-n7", changeCondition: "both-change" },
  ]);
});

test("練習の刺激はすべて刺激定義に存在し、Es用のファイル名を作れる", () => {
  for (const trial of PRACTICE_TRIALS) {
    for (const id of [trial.firstStimulusId, trial.secondStimulusId]) {
      assert.ok(findStimulus(id), id);
      assert.doesNotThrow(() => phraseFilenameFor("Es", id));
    }
  }
});

test("測定本体はユーザー・保存・CSV・サーバーに依存しない(importしていない)", () => {
  for (const file of ["stimuli.js", "trial-generator.js"]) {
    const source = readFileSync(new URL(`../../src/functional-pitch/${file}`, import.meta.url), "utf8");
    const imports = [...source.matchAll(/^import .* from "(.*)";/gm)].map((m) => m[1]);
    for (const path of imports) {
      assert.match(path, /^\.\/(stimuli|trial-generator)\.js$/, `${file} が ${path} をimportしている`);
    }
  }
});
