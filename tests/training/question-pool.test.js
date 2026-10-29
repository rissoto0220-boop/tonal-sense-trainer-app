import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuestionPool, buildQuestions, drawSessionKey } from "../../src/training/question-pool.js";
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

test("セッションのKey: 固定のメニューは C・fixed。ランダムのメニューは4Keyから1つ・randomAtSessionStart", () => {
  assert.deepEqual(drawSessionKey(menu(1), () => 0.99), { sessionKeyCode: "C", keyAssignmentMethod: "fixed" });
  assert.deepEqual(drawSessionKey(menu(9), () => 0), { sessionKeyCode: TRAINING_KEY_CODES[0], keyAssignmentMethod: "randomAtSessionStart" });
  assert.equal(drawSessionKey(menu(9), () => 0.999999).sessionKeyCode, TRAINING_KEY_CODES.at(-1));
  const randomFn = seededRandom(1);
  const drawn = new Set(Array.from({ length: 40 }, () => drawSessionKey(menu(9), randomFn).sessionKeyCode));
  assert.deepEqual(new Set(TRAINING_KEY_CODES), drawn, "4Keyのどれも選ばれうる");
});

test("出題候補は刺激×セッションのKey(①=3、⑦=10、⑨=3、⑮=10)", () => {
  assert.equal(buildQuestionPool(menu(1), "C").length, 3);
  assert.equal(buildQuestionPool(menu(7), "C").length, 10);
  assert.equal(buildQuestionPool(menu(9), "Es").length, 3);
  assert.equal(buildQuestionPool(menu(15), "A").length, 10);
  assert.ok(buildQuestionPool(menu(9), "Fis").every((item) => item.keyCode === "Fis"));
});

test("ランダムのメニューでも、1回の訓練の全問が同じKey", () => {
  for (let seed = 1; seed <= 10; seed += 1) {
    const questions = buildQuestions(menu(15), { randomFn: seededRandom(seed) });
    assert.equal(new Set(questions.map((question) => question.keyCode)).size, 1);
  }
  assert.ok(buildQuestions(menu(9), { randomFn: seededRandom(1), keyCode: "A" }).every((question) => question.keyCode === "A"));
});

test("15問を作る。各問に番号・メニュー・刺激・Key・課題・正解が付く(問題のIDは作らない)", () => {
  const questions = buildQuestions(menu(1), { randomFn: seededRandom(1) });
  assert.equal(questions.length, 15);
  questions.forEach((question, i) => {
    assert.equal(question.questionNumber, i + 1);
    assert.equal("questionId" in question, false);
    assert.equal(question.menuId, "menu-01");
    assert.equal(question.keyCode, "C");
    assert.equal(question.taskTemplateId, "tt-melody-first");
    assert.equal(question.resolvedAnswerTargets.length, 1);
    assert.ok(menu(1).activeOptionCodes.includes(question.resolvedAnswerTargets[0].correctAnswerCode));
  });
});

test("①(3候補)は各刺激がちょうど5回、⑦(10候補)は10+5", () => {
  const first = buildQuestions(menu(1), { randomFn: seededRandom(2) });
  for (const stimulusId of menu(1).stimulusIds) {
    assert.equal(first.filter((question) => question.stimulusId === stimulusId).length, 5);
  }
  const seventh = buildQuestions(menu(7), { randomFn: seededRandom(3) });
  assert.equal(new Set(seventh.slice(0, 10).map((question) => question.stimulusId)).size, 10, "最初の1周は10候補を1回ずつ");
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

test("異常: 未対応のKeyの設定、メニューで使えないKey、辞書にない課題テンプレート", () => {
  assert.throws(() => buildQuestionPool({ ...menu(1), keyPolicy: { mode: "weekly" } }, "C"), /未対応のKeyの設定です: weekly/);
  assert.throws(() => drawSessionKey({ ...menu(1), keyPolicy: { mode: "weekly" } }), /未対応のKeyの設定です: weekly/);
  assert.throws(() => buildQuestions(menu(1), { keyCode: "Es" }), /メニュー menu-01 では Key Es を使えません/);
  assert.throws(() => buildQuestions({ ...menu(1), taskTemplateRef: "tt-none" }), /課題テンプレート「tt-none」が辞書にありません/);
});
