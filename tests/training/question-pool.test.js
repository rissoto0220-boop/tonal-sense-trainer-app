import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuestionPool, buildQuestions } from "../../src/training/question-pool.js";
import { TRAINING_MENUS } from "../../src/training/menus.js";
import { TRAINING_KEY_CODES } from "../../src/training/stimuli.js";

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const menu = (number) => TRAINING_MENUS[number - 1];

test("出題候補の数: ①=3、⑦=10(C固定)、⑨=12、⑮=40(4Key)", () => {
  assert.equal(buildQuestionPool(menu(1)).length, 3);
  assert.equal(buildQuestionPool(menu(7)).length, 10);
  assert.equal(buildQuestionPool(menu(9)).length, 12);
  assert.equal(buildQuestionPool(menu(15)).length, 40);
});

test("Key固定のメニューの候補はすべてKey C、ランダムのメニューは刺激×4Key", () => {
  assert.ok(buildQuestionPool(menu(1)).every((item) => item.keyCode === "C"));
  const pool = buildQuestionPool(menu(9));
  for (const stimulusId of menu(9).stimulusIds) {
    assert.deepEqual(pool.filter((item) => item.stimulusId === stimulusId).map((item) => item.keyCode), TRAINING_KEY_CODES);
  }
});

test("15問を作る。各問に番号・ID・メニュー・刺激・Key・課題・正解が付く", () => {
  const questions = buildQuestions(menu(1), { randomFn: seededRandom(1) });
  assert.equal(questions.length, 15);
  questions.forEach((question, i) => {
    assert.equal(question.questionNumber, i + 1);
    assert.equal(question.questionId, `menu-01-q${String(i + 1).padStart(2, "0")}`);
    assert.equal(question.menuId, "menu-01");
    assert.equal(question.keyCode, "C");
    assert.equal(question.taskTemplateId, "tt-melody-first");
    assert.equal(question.resolvedAnswerTargets.length, 1);
    assert.ok(menu(1).activeOptionCodes.includes(question.resolvedAnswerTargets[0].correctAnswerCode));
  });
});

test("①(3候補)は各刺激がちょうど5回、⑨(12候補)は12+3", () => {
  const first = buildQuestions(menu(1), { randomFn: seededRandom(2) });
  for (const stimulusId of menu(1).stimulusIds) {
    assert.equal(first.filter((question) => question.stimulusId === stimulusId).length, 5);
  }
  const ninth = buildQuestions(menu(9), { randomFn: seededRandom(3) });
  const firstCycle = ninth.slice(0, 12).map((question) => `${question.stimulusId}/${question.keyCode}`);
  assert.equal(new Set(firstCycle).size, 12, "最初の1周は12候補を1回ずつ");
  assert.ok(ninth.every((question) => TRAINING_KEY_CODES.includes(question.keyCode)));
});

test("和音のメニュー(②)では、和音の根音度が正解になる", () => {
  const questions = buildQuestions(menu(2), { randomFn: seededRandom(4) });
  for (const question of questions) {
    assert.equal(question.resolvedAnswerTargets[0].answerFeature, "chordRootDegree");
    assert.ok(["n1", "n5"].includes(question.resolvedAnswerTargets[0].correctAnswerCode));
  }
});

test("固定の乱数なら同じ問題の列になる。出題数は調整できる", () => {
  assert.deepEqual(buildQuestions(menu(15), { randomFn: seededRandom(42) }), buildQuestions(menu(15), { randomFn: seededRandom(42) }));
  assert.equal(buildQuestions(menu(1), { randomFn: seededRandom(5), questionCount: 6 }).length, 6);
});

test("全16メニューで問題を作れる", () => {
  for (const item of TRAINING_MENUS) {
    assert.equal(buildQuestions(item, { randomFn: seededRandom(item.number) }).length, 15);
  }
});

test("異常: 未対応のKeyの設定、辞書にない課題テンプレート", () => {
  assert.throws(() => buildQuestionPool({ ...menu(1), keyPolicy: { mode: "weekly" } }), /未対応のKeyの設定です: weekly/);
  assert.throws(() => buildQuestions({ ...menu(1), taskTemplateRef: "tt-none" }), /課題テンプレート「tt-none」が辞書にありません/);
});
