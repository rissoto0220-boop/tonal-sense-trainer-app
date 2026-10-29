import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAnswerTargets } from "../../src/training/resolve-answer-targets.js";
import { TASK_TEMPLATES } from "../../src/training/definitions.js";

const note = (eventId, onsetBeats, durationBeats, degree) => ({ eventId, type: "note", onsetBeats, durationBeats, degree });
const chord = (eventId, onsetBeats, durationBeats, chordRef) => ({ eventId, type: "chord", onsetBeats, durationBeats, chordRef });
const target = (targetId, partId, eventId, answerFeature, sequenceOrder, optionSetRef) => ({ targetId, partId, eventId, answerFeature, sequenceOrder, optionSetRef });
const template = (taskTemplateId, ...answerTargets) => ({ taskTemplateId, schemaVersion: 1, answerTargets });

// 例1・2: メロディ2イベント+和音2イベント
const STIMULUS_1 = {
  stimulusId: "st-0001",
  schemaVersion: 1,
  parts: {
    melody: { events: [note("m1", 0, 2, "n3"), note("m2", 2, 2, "n1")] },
    harmony: { events: [chord("h1", 0, 2, "ch-n1-maj"), chord("h2", 2, 2, "ch-n5-dom7")] },
  },
};

// 例3: メロディは8分音符8イベント、和音は4分音符4イベント(イベント数もリズムも違う)
const STIMULUS_3 = {
  stimulusId: "st-0003",
  schemaVersion: 1,
  parts: {
    melody: {
      events: [
        note("m1", 0, 0.5, "n3"), note("m2", 0.5, 0.5, "n5"), note("m3", 1, 0.5, "n4"), note("m4", 1.5, 0.5, "n6"),
        note("m5", 2, 0.5, "n7"), note("m6", 2.5, 0.5, "n2"), note("m7", 3, 0.5, "n3"), note("m8", 3.5, 0.5, "n1"),
      ],
    },
    harmony: {
      events: [chord("h1", 0, 1, "ch-n1-maj"), chord("h2", 1, 1, "ch-n4-maj"), chord("h3", 2, 1, "ch-n5-dom7"), chord("h4", 3, 1, "ch-n1-maj")],
    },
  },
};

// 例4: 4音メロディ+和音1イベント
const STIMULUS_4 = {
  stimulusId: "st-0004",
  schemaVersion: 1,
  parts: {
    melody: { events: [note("m1", 0, 1, "n1"), note("m2", 1, 1, "n3"), note("m3", 2, 1, "n5"), note("m4", 3, 1, "n3")] },
    harmony: { events: [chord("h1", 0, 4, "ch-n1-maj")] },
  },
};

test("例1: 2イベント刺激+メロディ第1イベント → 正解は n3", () => {
  const resolved = resolveAnswerTargets(STIMULUS_1, TASK_TEMPLATES["tt-melody-first"]);
  assert.deepEqual(resolved, [
    { targetId: "t1", partId: "melody", eventId: "m1", answerFeature: "degree", sequenceOrder: 1, optionSetRef: "melody-keyboard", correctAnswerCode: "n3" },
  ]);
});

test("例2: 同じ刺激+和音第1イベント → 正解は n1(刺激は変えず、課題だけ差し替える)", () => {
  const resolved = resolveAnswerTargets(STIMULUS_1, TASK_TEMPLATES["tt-chord-first"]);
  assert.deepEqual(resolved, [
    { targetId: "t1", partId: "harmony", eventId: "h1", answerFeature: "chordRootDegree", sequenceOrder: 1, optionSetRef: "chord-root-degrees", correctAnswerCode: "n1" },
  ]);
});

test("同じ刺激でも、第1和音が属七(ch-n5-dom7)なら和音の正解は n5", () => {
  const stimulus = { ...STIMULUS_1, parts: { ...STIMULUS_1.parts, harmony: { events: [chord("h1", 0, 2, "ch-n5-dom7"), chord("h2", 2, 2, "ch-n1-maj")] } } };
  assert.equal(resolveAnswerTargets(stimulus, TASK_TEMPLATES["tt-chord-first"])[0].correctAnswerCode, "n5");
});

test("例3: メロディ8イベント・和音4イベントの刺激で、メロディm1と和音h2を答える → n3 と n4", () => {
  const task = template(
    "tt-test-m1-and-h2",
    target("t1", "melody", "m1", "degree", 1, "melody-keyboard"),
    target("t2", "harmony", "h2", "chordRootDegree", 2, "chord-root-degrees"),
  );
  const resolved = resolveAnswerTargets(STIMULUS_3, task);
  assert.deepEqual(resolved.map((r) => [r.targetId, r.correctAnswerCode]), [["t1", "n3"], ["t2", "n4"]]);
});

test("例3: 8イベントのうち途中のイベント(m6)も eventId で指せる", () => {
  const task = template("tt-test-m6", target("t1", "melody", "m6", "degree", 1, "melody-keyboard"));
  assert.equal(resolveAnswerTargets(STIMULUS_3, task)[0].correctAnswerCode, "n2");
});

test("例4: 4音メロディの第2・第3イベントを順番に答える → n3、n5(正解は刺激に1回だけ書かれている)", () => {
  const task = template(
    "tt-test-m2-m3",
    target("t1", "melody", "m2", "degree", 1, "melody-keyboard"),
    target("t2", "melody", "m3", "degree", 2, "melody-keyboard"),
  );
  const resolved = resolveAnswerTargets(STIMULUS_4, task);
  assert.deepEqual(resolved.map((r) => [r.targetId, r.sequenceOrder, r.correctAnswerCode]), [["t1", 1, "n3"], ["t2", 2, "n5"]]);
});

test("戻り値は answerTargets と同じ順序", () => {
  const task = template(
    "tt-test-reverse",
    target("t2", "melody", "m3", "degree", 2, "melody-keyboard"),
    target("t1", "melody", "m2", "degree", 1, "melody-keyboard"),
  );
  assert.deepEqual(resolveAnswerTargets(STIMULUS_4, task).map((r) => r.targetId), ["t2", "t1"]);
});

test("刺激も課題テンプレートも書き換えない", () => {
  const stimulusBefore = JSON.stringify(STIMULUS_1);
  const templateBefore = JSON.stringify(TASK_TEMPLATES["tt-melody-first"]);
  resolveAnswerTargets(STIMULUS_1, TASK_TEMPLATES["tt-melody-first"]);
  resolveAnswerTargets(STIMULUS_1, TASK_TEMPLATES["tt-chord-first"]);
  assert.equal(JSON.stringify(STIMULUS_1), stimulusBefore);
  assert.equal(JSON.stringify(TASK_TEMPLATES["tt-melody-first"]), templateBefore);
});

test("異常: 存在しない partId", () => {
  const task = template("tt-test", target("t1", "bass", "m1", "degree", 1, "melody-keyboard"));
  assert.throws(() => resolveAnswerTargets(STIMULUS_1, task), /パート「bass」がありません/);
});

test("異常: 存在しない eventId", () => {
  const task = template("tt-test", target("t1", "melody", "m9", "degree", 1, "melody-keyboard"));
  assert.throws(() => resolveAnswerTargets(STIMULUS_1, task), /イベント「m9」がありません/);
});

test("異常: eventId が重複している刺激", () => {
  const stimulus = { ...STIMULUS_1, parts: { ...STIMULUS_1.parts, melody: { events: [note("m1", 0, 1, "n1"), note("m1", 1, 1, "n2")] } } };
  assert.throws(() => resolveAnswerTargets(stimulus, TASK_TEMPLATES["tt-melody-first"]), /重複/);
});

test("異常: 未対応の answerFeature", () => {
  const task = template("tt-test", target("t1", "melody", "m1", "pitchClass", 1, "melody-keyboard"));
  assert.throws(() => resolveAnswerTargets(STIMULUS_1, task), /未対応の answerFeature「pitchClass」/);
});

test("異常: 辞書にない回答候補(optionSetRef)", () => {
  const task = template("tt-test", target("t1", "melody", "m1", "degree", 1, "no-such-set"));
  assert.throws(() => resolveAnswerTargets(STIMULUS_1, task), /回答候補「no-such-set」が辞書にありません/);
});

test("異常: 課題と回答候補の answerFeature が食い違う", () => {
  const task = template("tt-test", target("t1", "melody", "m1", "degree", 1, "chord-root-degrees"));
  assert.throws(() => resolveAnswerTargets(STIMULUS_1, task), /answerFeature が食い違っています/);
});

test("異常: 和音が辞書にない(chordRef)", () => {
  const stimulus = { ...STIMULUS_1, parts: { ...STIMULUS_1.parts, harmony: { events: [chord("h1", 0, 4, "ch-n2-min")] } } };
  assert.throws(() => resolveAnswerTargets(stimulus, TASK_TEMPLATES["tt-chord-first"]), /和音「ch-n2-min」が辞書にありません/);
});

test("異常: メロディのイベントに degree がない", () => {
  const stimulus = { ...STIMULUS_1, parts: { ...STIMULUS_1.parts, melody: { events: [{ eventId: "m1", type: "note", onsetBeats: 0, durationBeats: 1 }] } } };
  assert.throws(() => resolveAnswerTargets(stimulus, TASK_TEMPLATES["tt-melody-first"]), /degree がありません/);
});

test("異常: 正解コードが回答候補に含まれない(例: 半音上の音度 s1 は階名鍵盤にない)", () => {
  const stimulus = { ...STIMULUS_1, parts: { ...STIMULUS_1.parts, melody: { events: [note("m1", 0, 1, "s1")] } } };
  assert.throws(() => resolveAnswerTargets(stimulus, TASK_TEMPLATES["tt-melody-first"]), /正解コード「s1」が回答候補「melody-keyboard」に含まれません/);
});

test("辞書を引数で差し替えられる(テスト用の和音辞書)", () => {
  const stimulus = { ...STIMULUS_1, parts: { ...STIMULUS_1.parts, harmony: { events: [chord("h1", 0, 4, "ch-test")] } } };
  const chords = { "ch-test": { rootDegree: "n6", quality: "maj" } };
  assert.equal(resolveAnswerTargets(stimulus, TASK_TEMPLATES["tt-chord-first"], { chords })[0].correctAnswerCode, "n6");
});
