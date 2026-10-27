import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeResponses, GIVE_UP_RESPONSE_CODE } from "../../src/training/judge.js";

const MELODY_TARGET = { targetId: "t1", partId: "melody", eventId: "m1", answerFeature: "degree", sequenceOrder: 1, optionSetRef: "melody-keyboard", correctAnswerCode: "n3" };
const CHORD_TARGET = { targetId: "t2", partId: "harmony", eventId: "h1", answerFeature: "chordRootDegree", sequenceOrder: 2, optionSetRef: "chord-root-degrees", correctAnswerCode: "n5" };

test("「わからない」の回答コードは giveup", () => {
  assert.equal(GIVE_UP_RESPONSE_CODE, "giveup");
});

test("正解", () => {
  assert.deepEqual(judgeResponses([MELODY_TARGET], { t1: "n3" }), {
    responses: [{ targetId: "t1", responseCode: "n3", correctAnswerCode: "n3", outcome: "correct" }],
    scoring: { targetCount: 1, correctTargetCount: 1, accuracy: 1, allCorrect: true },
  });
});

test("不正解", () => {
  const { responses, scoring } = judgeResponses([MELODY_TARGET], { t1: "n4" });
  assert.equal(responses[0].outcome, "incorrect");
  assert.deepEqual(scoring, { targetCount: 1, correctTargetCount: 0, accuracy: 0, allCorrect: false });
});

test("「わからない」(giveup)は不正解として扱う", () => {
  const { responses, scoring } = judgeResponses([MELODY_TARGET], { t1: GIVE_UP_RESPONSE_CODE });
  assert.deepEqual(responses[0], { targetId: "t1", responseCode: "giveup", correctAnswerCode: "n3", outcome: "incorrect" });
  assert.equal(scoring.correctTargetCount, 0);
});

test("複数の回答対象: 部分正解の集計(将来の複数回答用)", () => {
  const { responses, scoring } = judgeResponses([MELODY_TARGET, CHORD_TARGET], { t1: "n3", t2: "n1" });
  assert.deepEqual(responses.map((response) => response.outcome), ["correct", "incorrect"]);
  assert.deepEqual(scoring, { targetCount: 2, correctTargetCount: 1, accuracy: 0.5, allCorrect: false });
});

test("和音の回答は、和音の回答候補のコードで判定する", () => {
  assert.equal(judgeResponses([CHORD_TARGET], { t2: "n5" }).responses[0].outcome, "correct");
});

test("異常: 回答がない、回答候補にない回答コード", () => {
  assert.throws(() => judgeResponses([MELODY_TARGET], {}), /回答対象 t1 の回答がありません/);
  assert.throws(() => judgeResponses([MELODY_TARGET], { t1: "s1" }), /回答コード「s1」は回答候補にありません/);
  assert.throws(() => judgeResponses([CHORD_TARGET], { t2: "n7" }), /回答コード「n7」は回答候補にありません/);
});
