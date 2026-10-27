import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRAINING_KEY_CODES,
  TRAINING_STIMULI,
  TRAINING_SOUNDS_BASE_PATH,
  findTrainingStimulus,
  questionAudioFilenameFor,
  feedbackAudioFilenameFor,
  keySetupAudioFilenameFor,
} from "../../src/training/stimuli.js";
import { CHORDS, TASK_TEMPLATES } from "../../src/training/definitions.js";
import { resolveAnswerTargets } from "../../src/training/resolve-answer-targets.js";

test("Keyは相対音感と同じ4つ(C/Es/Fis/A)", () => {
  assert.deepEqual(TRAINING_KEY_CODES, ["C", "Es", "Fis", "A"]);
});

test("ver.1 の刺激は10個。第1音/第1和音の組み合わせが資料ページ8どおり", () => {
  const pairs = TRAINING_STIMULI.map((stimulus) => [stimulus.parts.melody.events[0].degree, stimulus.parts.harmony.events[0].chordRef]);
  assert.deepEqual(pairs, [
    ["n7", "ch-n5-dom7"], ["n1", "ch-n1-maj"], ["n2", "ch-n5-dom7"], ["n6", "ch-n4-maj"], ["n3", "ch-n1-maj"],
    ["n5", "ch-n5-dom7"], ["n4", "ch-n5-dom7"], ["n5", "ch-n1-maj"], ["n1", "ch-n4-maj"], ["n4", "ch-n4-maj"],
  ]);
});

test("どの刺激も「第1音 → 主音ド」の2イベント。第2音はド、第2和音はⅠ", () => {
  for (const stimulus of TRAINING_STIMULI) {
    const { melody, harmony } = stimulus.parts;
    assert.deepEqual(melody.events.map((event) => event.eventId), ["m1", "m2"]);
    assert.deepEqual(harmony.events.map((event) => event.eventId), ["h1", "h2"]);
    assert.equal(melody.events[1].degree, "n1");
    assert.equal(harmony.events[1].chordRef, "ch-n1-maj");
    assert.ok(harmony.events.every((event) => CHORDS[event.chordRef]), "和音は辞書にある");
  }
});

test("刺激IDは st-<第1音の音度>-<第1和音> で、重複しない", () => {
  for (const stimulus of TRAINING_STIMULI) {
    const { degree } = stimulus.parts.melody.events[0];
    const { chordRef } = stimulus.parts.harmony.events[0];
    assert.equal(stimulus.stimulusId, `st-${degree}-${chordRef}`);
  }
  assert.equal(new Set(TRAINING_STIMULI.map((stimulus) => stimulus.stimulusId)).size, 10);
  assert.equal(findTrainingStimulus("st-n7-ch-n5-dom7").parts.melody.events[0].degree, "n7");
  assert.equal(findTrainingStimulus("no-such"), null);
});

test("刺激は回答対象も正解も持たない", () => {
  for (const stimulus of TRAINING_STIMULI) {
    assert.equal(/answer|correct/i.test(JSON.stringify(stimulus)), false);
  }
});

test("全刺激が、単音・和音どちらの課題テンプレートでも解決できる", () => {
  for (const stimulus of TRAINING_STIMULI) {
    const melody = resolveAnswerTargets(stimulus, TASK_TEMPLATES["tt-melody-first"]);
    const chord = resolveAnswerTargets(stimulus, TASK_TEMPLATES["tt-chord-first"]);
    assert.equal(melody[0].correctAnswerCode, stimulus.parts.melody.events[0].degree);
    assert.equal(chord[0].correctAnswerCode, CHORDS[stimulus.parts.harmony.events[0].chordRef].rootDegree);
  }
});

test("音源ファイル名: 問題とフィードバックが刺激ごとに1組で対応する", () => {
  assert.equal(TRAINING_SOUNDS_BASE_PATH, "public/sounds/training/");
  assert.equal(questionAudioFilenameFor("C", "st-n7-ch-n5-dom7"), "c-q-st-n7-ch-n5-dom7-v01.wav");
  assert.equal(feedbackAudioFilenameFor("C", "st-n7-ch-n5-dom7"), "c-fb-st-n7-ch-n5-dom7-v01.wav");
  assert.equal(questionAudioFilenameFor("Es", "st-n1-ch-n1-maj"), "es-q-st-n1-ch-n1-maj-v01.wav");
  assert.equal(questionAudioFilenameFor("Fis", "st-n1-ch-n1-maj"), "fis-q-st-n1-ch-n1-maj-v01.wav");
  assert.equal(feedbackAudioFilenameFor("A", "st-n1-ch-n1-maj"), "a-fb-st-n1-ch-n1-maj-v01.wav");
  const names = TRAINING_KEY_CODES.flatMap((key) => TRAINING_STIMULI.flatMap((s) => [questionAudioFilenameFor(key, s.stimulusId), feedbackAudioFilenameFor(key, s.stimulusId)]));
  const setups = TRAINING_KEY_CODES.map((key) => keySetupAudioFilenameFor(key));
  assert.equal(new Set([...names, ...setups]).size, 84, "調セットアップ4本+問題40本+フィードバック40本、重複なし");
});

test("音源ファイル名: 未対応のKey・未定義の刺激IDは例外", () => {
  assert.throws(() => questionAudioFilenameFor("D", "st-n1-ch-n1-maj"), /未対応のKeyです: D/);
  assert.throws(() => feedbackAudioFilenameFor("C", "st-n9-x"), /未定義の刺激IDです: st-n9-x/);
});

test("拍の暫定値: 第1音(第1和音)1拍 → ド(Ⅰ)1拍", () => {
  for (const stimulus of TRAINING_STIMULI) {
    for (const part of [stimulus.parts.melody, stimulus.parts.harmony]) {
      assert.deepEqual(part.events.map((event) => [event.onsetBeats, event.durationBeats]), [[0, 1], [1, 1]]);
    }
  }
});

test("調セットアップのファイル名: Keyごとに1本。未対応のKeyは例外", () => {
  assert.deepEqual(TRAINING_KEY_CODES.map((key) => keySetupAudioFilenameFor(key)), ["c-setup-v01.wav", "es-setup-v01.wav", "fis-setup-v01.wav", "a-setup-v01.wav"]);
  assert.throws(() => keySetupAudioFilenameFor("D"), /未対応のKeyです: D/);
});
