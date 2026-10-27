import { test } from "node:test";
import assert from "node:assert/strict";
import { TRAINING_MENUS, findTrainingMenu } from "../../src/training/menus.js";
import { TRAINING_KEY_CODES, findTrainingStimulus } from "../../src/training/stimuli.js";
import { TASK_TEMPLATES, OPTION_SETS, DEFAULT_QUESTION_COUNT } from "../../src/training/definitions.js";
import { resolveAnswerTargets } from "../../src/training/resolve-answer-targets.js";

const FIRST_EIGHT = TRAINING_MENUS.slice(0, 8);
const LAST_EIGHT = TRAINING_MENUS.slice(8);

// 刺激を「第1音/和音の度数」の表記にする(資料ページ8の書き方に合わせて確認するため)。
const MELODY_NAMES = { n1: "ド", n2: "レ", n3: "ミ", n4: "ファ", n5: "ソ", n6: "ラ", n7: "シ" };
const CHORD_NAMES = { "ch-n1-maj": "Ⅰ", "ch-n4-maj": "Ⅳ", "ch-n5-dom7": "Ⅴ" };
const describe = (stimulusId) => {
  const { parts } = findTrainingStimulus(stimulusId);
  return `${MELODY_NAMES[parts.melody.events[0].degree]}(${CHORD_NAMES[parts.harmony.events[0].chordRef]})`;
};

test("メニューは16個。menu-01〜menu-16、番号は1〜16", () => {
  assert.equal(TRAINING_MENUS.length, 16);
  TRAINING_MENUS.forEach((menu, i) => {
    assert.equal(menu.number, i + 1);
    assert.equal(menu.menuId, `menu-${String(i + 1).padStart(2, "0")}`);
    assert.equal(findTrainingMenu(menu.menuId), menu);
  });
  assert.equal(findTrainingMenu("menu-99"), null);
});

test("①〜⑧はKey C固定、⑨〜⑯はKeyランダム(4つ)", () => {
  for (const menu of FIRST_EIGHT) assert.deepEqual(menu.keyPolicy, { mode: "fixed", keyCode: "C" });
  for (const menu of LAST_EIGHT) assert.deepEqual(menu.keyPolicy, { mode: "random", keyCodes: TRAINING_KEY_CODES });
  assert.match(TRAINING_MENUS[0].name, /^① 単音 シドレの判別\(Key C\)$/);
  assert.match(TRAINING_MENUS[8].name, /^⑨ 単音 シドレの判別\(Key ランダム\)$/);
});

test("⑨〜⑯の刺激構成・課題・回答候補は、①〜⑧と同じ", () => {
  LAST_EIGHT.forEach((menu, i) => {
    const base = FIRST_EIGHT[i];
    assert.deepEqual(menu.stimulusIds, base.stimulusIds);
    assert.equal(menu.taskTemplateRef, base.taskTemplateRef);
    assert.deepEqual(menu.activeOptionCodes, base.activeOptionCodes);
  });
});

test("出題数の既定は15", () => {
  for (const menu of TRAINING_MENUS) assert.equal(menu.generation.questionCount, DEFAULT_QUESTION_COUNT);
});

test("使う刺激が資料ページ8の記述どおり(①〜⑧)", () => {
  const expected = [
    ["シ(Ⅴ)", "ド(Ⅰ)", "レ(Ⅴ)"],
    ["シ(Ⅴ)", "ド(Ⅰ)", "レ(Ⅴ)"],
    ["ラ(Ⅳ)", "シ(Ⅴ)", "ド(Ⅰ)", "レ(Ⅴ)", "ミ(Ⅰ)"],
    ["ラ(Ⅳ)", "シ(Ⅴ)", "ド(Ⅰ)", "レ(Ⅴ)", "ミ(Ⅰ)"],
    ["ソ(Ⅴ)", "ラ(Ⅳ)", "シ(Ⅴ)", "ド(Ⅰ)", "レ(Ⅴ)", "ミ(Ⅰ)", "ファ(Ⅴ)"],
    ["ソ(Ⅴ)", "ラ(Ⅳ)", "シ(Ⅴ)", "ド(Ⅰ)", "レ(Ⅴ)", "ミ(Ⅰ)", "ファ(Ⅴ)"],
  ];
  expected.forEach((labels, i) => assert.deepEqual(FIRST_EIGHT[i].stimulusIds.map(describe), labels));
  // ⑦⑧: ソ(Ⅴ,Ⅰ)、ラ(Ⅳ)、シ(Ⅴ)、ド(Ⅰ,Ⅳ)、レ(Ⅴ)、ミ(Ⅰ)、ファ(Ⅴ,Ⅳ)
  const seventh = new Set(FIRST_EIGHT[6].stimulusIds.map(describe));
  assert.deepEqual(seventh, new Set(["ソ(Ⅴ)", "ソ(Ⅰ)", "ラ(Ⅳ)", "シ(Ⅴ)", "ド(Ⅰ)", "ド(Ⅳ)", "レ(Ⅴ)", "ミ(Ⅰ)", "ファ(Ⅴ)", "ファ(Ⅳ)"]));
  assert.deepEqual(FIRST_EIGHT[7].stimulusIds, FIRST_EIGHT[6].stimulusIds);
});

test("単音回答→和音回答の順に、同じ刺激の集合を使う(①②、③④、⑤⑥、⑦⑧)", () => {
  for (let i = 0; i < 8; i += 2) {
    assert.equal(FIRST_EIGHT[i].taskTemplateRef, "tt-melody-first");
    assert.equal(FIRST_EIGHT[i + 1].taskTemplateRef, "tt-chord-first");
    assert.deepEqual(FIRST_EIGHT[i + 1].stimulusIds, FIRST_EIGHT[i].stimulusIds);
  }
});

test("押せる音(activeOptionCodes)は回答候補の一部で、出題される正解はすべて押せる", () => {
  for (const menu of TRAINING_MENUS) {
    const template = TASK_TEMPLATES[menu.taskTemplateRef];
    const optionCodes = OPTION_SETS[template.answerTargets[0].optionSetRef].options.map((option) => option.code);
    assert.ok(menu.activeOptionCodes.every((code) => optionCodes.includes(code)), `${menu.menuId}: 回答候補にない音がある`);
    const corrects = new Set(menu.stimulusIds.map((id) => resolveAnswerTargets(findTrainingStimulus(id), template)[0].correctAnswerCode));
    assert.deepEqual(new Set(menu.activeOptionCodes), corrects, `${menu.menuId}: 押せる音と正解の集合が一致しない`);
  }
});
