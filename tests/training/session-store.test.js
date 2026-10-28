import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadParticipantData,
  persistParticipantData,
  startSession,
  addTrial,
  updateTrial,
  finalizeSession,
  createSessionRecorder,
} from "../../src/training/session-store.js";
import { runTrainingSession } from "../../src/training/training-session.js";
import { TRAINING_MENUS } from "../../src/training/menus.js";
import { syncPendingSessions } from "../../src/shared/session-uploader.js";
import { createFakeDom } from "./helpers/fake-dom.js";
import { createFakeAudioEnv, flushMicrotasks } from "./helpers/fake-audio-env.js";

// localStorageと同じく、length・key(i)で全キーを列挙できる疑似ストレージ。
function makeFakeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
    keys: () => [...map.keys()],
  };
}

function makeClock() {
  let n = 0;
  return () => `T${String(n++).padStart(3, "0")}`;
}

const INFO = { menuId: "menu-09", sessionKeyCode: "Es", keyAssignmentMethod: "randomAtSessionStart", trialsPlanned: 15 };

const trial = (n, outcome = "correct", extra = {}) => ({
  trialNumber: n,
  menuId: "menu-09",
  stimulusId: "st-n1-ch-n1-maj",
  stimulusVersion: "01",
  taskTemplateId: "tt-melody-first",
  keyCode: "Es",
  questionReplayCount: 0,
  feedbackReplayCount: 0,
  audioStartedAt: `A${n}`,
  audioEndedAt: `B${n}`,
  responseEnabledAt: `B${n}`,
  responseSubmittedAt: `C${n}`,
  responseTimeMs: 100 * n,
  responses: [{ targetId: "t1", responseCode: outcome === "giveup" ? null : "n1", correctAnswerCode: "n1", outcome }],
  scoring: { targetCount: 1, correctTargetCount: outcome === "correct" ? 1 : 0, accuracy: outcome === "correct" ? 1 : 0, allCorrect: outcome === "correct" },
  ...extra,
});

test("保存先は参加者IDごとの training:<ID> で、空なら schemaVersion 1 の空データ", () => {
  const storage = makeFakeStorage();
  assert.deepEqual(loadParticipantData("P00001", storage), { schemaVersion: 1, sessions: [] });
  startSession("P00001", INFO, { storage, now: makeClock(), generateId: () => "s1" });
  assert.deepEqual(storage.keys(), ["training:P00001"]);
});

test("startSession: 決定事項のセッション項目を持つセッションを作り、すぐ保存する", () => {
  const storage = makeFakeStorage();
  const { session } = startSession("P00001", INFO, { storage, now: makeClock(), generateId: () => "s1" });
  assert.deepEqual(session, {
    trainingSessionId: "s1",
    menuId: "menu-09",
    attemptNumber: 1,
    sessionStatus: null,
    sessionKeyCode: "Es",
    keyAssignmentMethod: "randomAtSessionStart",
    startedAt: "T000",
    endedAt: "",
    trialsPlanned: 15,
    trialsCompleted: 0,
    correctCount: 0,
    giveupCount: 0,
    trials: [],
  });
  assert.deepEqual(loadParticipantData("P00001", storage).sessions, [session]);
});

test("attemptNumber: 同じメニューを始めた回数(中断も数える)。メニューごとに数える", () => {
  const storage = makeFakeStorage();
  let id = 0;
  const begin = (menuId) => startSession("P00001", { ...INFO, menuId }, { storage, generateId: () => `s${id++}` }).session;
  const first = begin("menu-01");
  finalizeSession(first, "interrupted");
  persistParticipantData("P00001", { schemaVersion: 1, sessions: [first] }, storage);
  assert.equal(begin("menu-01").attemptNumber, 2, "ページを閉じた回(未確定)も、確定させてから数える");
  assert.equal(begin("menu-02").attemptNumber, 1);
  assert.equal(begin("menu-01").attemptNumber, 3);
});

test("addTrial・updateTrial: trainingSessionId を付けて記録し、件数(回答・正解・わからない)を数え直す", () => {
  const storage = makeFakeStorage();
  const { session } = startSession("P00001", INFO, { storage, generateId: () => "s1" });
  addTrial(session, trial(1));
  addTrial(session, trial(2, "giveup"));
  addTrial(session, trial(3, "incorrect"));
  assert.deepEqual(session.trials.map((item) => [item.trainingSessionId, item.trialNumber]), [["s1", 1], ["s1", 2], ["s1", 3]]);
  assert.deepEqual([session.trialsCompleted, session.correctCount, session.giveupCount], [3, 1, 1]);
  updateTrial(session, trial(3, "incorrect", { feedbackReplayCount: 2 }));
  assert.equal(session.trials[2].feedbackReplayCount, 2);
  assert.equal(session.trials.length, 3);
  updateTrial(session, trial(9));
  assert.equal(session.trials.length, 3, "記録にない試行の書き換えは無視する");
});

test("finalizeSession: 状態と終了時刻を決める。一度決まった状態は変えない", () => {
  const storage = makeFakeStorage();
  const { session } = startSession("P00001", INFO, { storage, generateId: () => "s1" });
  finalizeSession(session, "completed", () => "END");
  finalizeSession(session, "interrupted", () => "LATER");
  assert.equal(session.sessionStatus, "completed");
  assert.equal(session.endedAt, "END");
});

test("記録係: 回答の確定ごとに保存し、完了後も聞き直しの回数は書き換える", () => {
  const storage = makeFakeStorage();
  const recorder = createSessionRecorder("P00001", { storage, now: makeClock(), generateId: () => "s1" });
  const saved = () => loadParticipantData("P00001", storage).sessions[0];
  recorder.onSessionStarted(INFO);
  recorder.onTrialConfirmed(trial(1, "incorrect"));
  assert.equal(saved().trials.length, 1);
  recorder.onTrialUpdated(trial(1, "incorrect", { feedbackReplayCount: 1 }));
  assert.equal(saved().trials[0].feedbackReplayCount, 1);
  recorder.onFinished();
  assert.equal(saved().sessionStatus, "completed");
  assert.notEqual(saved().endedAt, "");
  recorder.onTrialUpdated(trial(1, "incorrect", { feedbackReplayCount: 2 }));
  assert.equal(saved().trials[0].feedbackReplayCount, 2);
  recorder.onTrialConfirmed(trial(2));
  assert.equal(saved().trials.length, 1, "完了後の新しい試行は記録しない");
});

test("記録係: 「訓練を終了する」は interrupted、音声エラーは audio_error。回答済みの試行は残る", () => {
  const storage = makeFakeStorage();
  let id = 0;
  const run = (end) => {
    const recorder = createSessionRecorder("P00001", { storage, generateId: () => `s${id++}` });
    recorder.onSessionStarted(INFO);
    recorder.onTrialConfirmed(trial(1));
    recorder[end]();
    recorder.onTrialConfirmed(trial(2)); // 終了後の通知は無視する
  };
  run("onInterrupted");
  run("onAudioError");
  const sessions = loadParticipantData("P00001", storage).sessions;
  assert.deepEqual(sessions.map((s) => [s.sessionStatus, s.trialsCompleted]), [["interrupted", 1], ["audio_error", 1]]);
});

test("次に始めたとき、前回終わらなかったセッション(ページを閉じた等)を interrupted として確定する", () => {
  const storage = makeFakeStorage();
  const now = makeClock();
  const recorder = createSessionRecorder("P00001", { storage, now, generateId: () => "s1" });
  recorder.onSessionStarted(INFO);
  recorder.onTrialConfirmed(trial(1));
  // ここでページを閉じた(onFinished などは来ない)。保存済みのデータは残っている
  assert.equal(loadParticipantData("P00001", storage).sessions[0].sessionStatus, null);

  const { data } = startSession("P00001", INFO, { storage, now, generateId: () => "s2" });
  const [first, second] = data.sessions;
  assert.equal(first.sessionStatus, "interrupted");
  assert.notEqual(first.endedAt, "");
  assert.equal(first.trialsCompleted, 1);
  assert.equal(second.attemptNumber, 2);
  assert.equal(loadParticipantData("P00001", storage).sessions[0].sessionStatus, "interrupted");
});

test("参加者IDが違えば、別のキーに保存される", () => {
  const storage = makeFakeStorage();
  startSession("P00001", INFO, { storage, generateId: () => "a" });
  startSession("P00002", INFO, { storage, generateId: () => "b" });
  assert.deepEqual(storage.keys(), ["training:P00001", "training:P00002"]);
  assert.equal(loadParticipantData("P00002", storage).sessions[0].trainingSessionId, "b");
});

test("壊れた保存データは空として扱い、保存に失敗しても例外にならない", () => {
  const storage = makeFakeStorage();
  storage.setItem("training:P00001", "{壊れた");
  assert.deepEqual(loadParticipantData("P00001", storage), { schemaVersion: 1, sessions: [] });
  const failing = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  assert.equal(persistParticipantData("P00001", { sessions: [] }, failing), false);
  const recorder = createSessionRecorder("P00001", { storage: failing });
  assert.doesNotThrow(() => {
    recorder.onSessionStarted(INFO);
    recorder.onTrialConfirmed(trial(1));
    recorder.onTrialUpdated(trial(1));
    recorder.onFinished();
  });
});

test("記録係: セッションの開始前に届いた通知は無視する", () => {
  const storage = makeFakeStorage();
  const recorder = createSessionRecorder("P00001", { storage, generateId: () => "s1" });
  recorder.onTrialConfirmed(trial(1));
  recorder.onTrialUpdated(trial(1));
  recorder.onFinished();
  recorder.onInterrupted();
  recorder.onAudioError();
  assert.deepEqual(storage.keys(), []);
});

test("結合: 本物の runTrainingSession の通知で、回答ごとに保存され、最後に completed になる", async () => {
  const storage = makeFakeStorage();
  const recorder = createSessionRecorder("P00001", { storage, generateId: () => "s1" });
  const env = createFakeAudioEnv();
  const screenEl = createFakeDom();
  const menu = TRAINING_MENUS[8]; // ⑨ Keyランダム
  const session = runTrainingSession({
    screenEl,
    menu,
    questionCount: 2,
    ...recorder,
    audioOptions: env.audioOptions(),
    audioContextTimeFn: env.audioContextTimeFn,
  });
  await flushMicrotasks();
  const saved = () => loadParticipantData("P00001", storage).sessions[0];
  assert.equal(saved().sessionKeyCode, session.sessionKeyCode);
  assert.equal(saved().keyAssignmentMethod, "randomAtSessionStart");
  assert.equal(saved().trialsPlanned, 2);

  const correct = (i) => session.questions[i].resolvedAnswerTargets[0].correctAnswerCode;
  env.tick(8.1);
  screenEl.el('[data-role="giveup"]').click();
  assert.equal(saved().trials.length, 1, "フィードバックを待たずに保存する");
  assert.equal(saved().giveupCount, 1);
  env.tick(3.1);
  screenEl.el('[data-role="replay"]').click();
  assert.equal(saved().trials[0].feedbackReplayCount, 1);
  env.tick(3.1);
  screenEl.el('[data-role="next"]').click();
  await flushMicrotasks();
  env.tick(8.1);
  screenEl.el(`[data-code="${correct(1)}"]`).click();
  assert.equal(saved().sessionStatus, null);
  env.tick(3.1);
  assert.equal(saved().sessionStatus, "completed");
  assert.deepEqual([saved().trialsCompleted, saved().correctCount, saved().giveupCount], [2, 1, 1]);
  assert.ok(saved().trials.every((item) => item.keyCode === session.sessionKeyCode));
  session.destroy();
});

test("送信処理は training: のキーを送らない(送信はまだ作らない)", async () => {
  const storage = makeFakeStorage();
  const recorder = createSessionRecorder("P00001", { storage, generateId: () => "s1" });
  recorder.onSessionStarted(INFO);
  recorder.onTrialConfirmed(trial(1));
  recorder.onFinished();
  const calls = [];
  const summary = await syncPendingSessions({
    storage,
    fetchFn: async (...args) => { calls.push(args); return { status: 201 }; },
    endpoint: "https://example.test/api/session_create.php",
  });
  assert.equal(calls.length, 0);
  assert.equal(summary.sent, 0);
});
