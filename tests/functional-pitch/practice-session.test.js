import { test } from "node:test";
import assert from "node:assert/strict";
import { createPracticeSession } from "../../src/functional-pitch/practice-session.js";

const CONFIRMED = (n) => ({
  melody_change_rating: n,
  harmony_change_rating: n + 1,
  overall_change_rating: n + 2,
  response_enabled_at: `E${n}`,
  response_confirmed_at: `C${n}`,
  response_time_ms: n * 1000,
});

function finishRound(session, base = 1) {
  for (let i = 0; i < 3; i += 1) session.record(CONFIRMED(base + i));
}

test("練習は Key Es の固定3試行で、仕様の順・刺激どおり", () => {
  const session = createPracticeSession();
  assert.equal(session.totalTrials(), 3);
  const trials = [];
  for (let i = 0; i < 3; i += 1) {
    trials.push(session.currentTrial());
    session.record(CONFIRMED(1));
  }
  assert.deepEqual(trials, [
    { keyCode: "Es", firstStimulusId: "ch-n1-maj-mel-n1", secondStimulusId: "ch-n1-maj-mel-n3" },
    { keyCode: "Es", firstStimulusId: "ch-n1-maj-mel-n1", secondStimulusId: "ch-n4-maj-mel-n1" },
    { keyCode: "Es", firstStimulusId: "ch-n1-maj-mel-n3", secondStimulusId: "ch-n5-dom7-mel-n7" },
  ]);
});

test("画面へ渡す試行に、条件名(変化条件)は含まれない", () => {
  const session = createPracticeSession();
  assert.equal("changeCondition" in session.currentTrial(), false);
  assert.equal(JSON.stringify(session.currentTrial()).includes("change"), false);
});

test("進捗ラベルは 練習 1 / 3 〜 練習 3 / 3", () => {
  const session = createPracticeSession();
  const labels = [];
  for (let i = 0; i < 3; i += 1) {
    labels.push(session.progressLabel());
    session.record(CONFIRMED(1));
  }
  assert.deepEqual(labels, ["練習 1 / 3", "練習 2 / 3", "練習 3 / 3"]);
});

test("3試行を記録すると終了し、以後 currentTrial は null で record は受け付けない", () => {
  const session = createPracticeSession();
  assert.equal(session.isFinished(), false);
  finishRound(session);
  assert.equal(session.isFinished(), true);
  assert.equal(session.currentTrial(), null);
  assert.equal(session.record(CONFIRMED(9)), false);
  assert.equal(session.results().length, 3);
});

test("結果には、練習の回・番号・刺激・条件・評定3つ・時刻と反応時間が入る", () => {
  const session = createPracticeSession();
  session.record(CONFIRMED(1));
  assert.deepEqual(session.results()[0], {
    practice_round: 1,
    practice_number: 1,
    first_stimulus_id: "ch-n1-maj-mel-n1",
    second_stimulus_id: "ch-n1-maj-mel-n3",
    change_condition: "melody-change",
    melody_change_rating: 1,
    harmony_change_rating: 2,
    overall_change_rating: 3,
    response_enabled_at: "E1",
    response_confirmed_at: "C1",
    response_time_ms: 1000,
  });
});

test("3試行の条件は melody-change / chord-change / both-change の順", () => {
  const session = createPracticeSession();
  finishRound(session);
  assert.deepEqual(session.results().map((r) => r.change_condition), ["melody-change", "chord-change", "both-change"]);
});

test("restart: 終了後だけ受け付け、practice_round が増えて練習1に戻る。前回の結果は残る", () => {
  const session = createPracticeSession();
  assert.equal(session.restart(), false); // 途中では再開できない
  assert.equal(session.round(), 1);
  finishRound(session, 1);
  assert.equal(session.restart(), true);
  assert.equal(session.round(), 2);
  assert.equal(session.isFinished(), false);
  assert.equal(session.progressLabel(), "練習 1 / 3");
  assert.equal(session.results().length, 3);
  finishRound(session, 4);
  const results = session.results();
  assert.equal(results.length, 6);
  assert.deepEqual(results.map((r) => [r.practice_round, r.practice_number]), [[1, 1], [1, 2], [1, 3], [2, 1], [2, 2], [2, 3]]);
  assert.equal(results[0].melody_change_rating, 1); // 1回目の回答が残っている
  assert.equal(results[3].melody_change_rating, 4);
});

test("再練習の回数に上限はなく、何度でも同じ固定順で行える", () => {
  const session = createPracticeSession();
  const orders = [];
  for (let round = 1; round <= 5; round += 1) {
    const order = [];
    while (!session.isFinished()) {
      order.push(session.currentTrial().secondStimulusId);
      session.record(CONFIRMED(1));
    }
    orders.push(order);
    session.restart();
  }
  assert.equal(session.round(), 6);
  for (const order of orders) assert.deepEqual(order, orders[0]);
});

test("results は複製を返し、外から書き換えても内部の記録は変わらない", () => {
  const session = createPracticeSession();
  session.record(CONFIRMED(1));
  session.results()[0].melody_change_rating = 99;
  assert.equal(session.results()[0].melody_change_rating, 1);
});

test("確定値に含まれない余計な項目は記録しない", () => {
  const session = createPracticeSession();
  session.record({ ...CONFIRMED(1), secret: "x" });
  assert.equal("secret" in session.results()[0], false);
});
