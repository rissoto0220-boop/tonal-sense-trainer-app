import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadParticipantData,
  persistParticipantData,
  startSession,
  beginTrial,
  finalizeTrial,
  finalizeSession,
  createSessionRecorder,
} from "../../src/functional-pitch/session-store.js";
import { runKeyMeasurement } from "../../src/functional-pitch/key-measurement.js";
import { syncPendingSessions } from "../../src/shared/session-uploader.js";
import { createFakeScreen } from "./helpers/fake-screen.js";

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

const INFO = {
  measurement_key_code: "C",
  generated_trial_order: [
    { trial_number: 1, first_stimulus_id: "C-01", second_stimulus_id: "C-02", change_condition: "melody" },
    { trial_number: 2, first_stimulus_id: "C-03", second_stimulus_id: "C-03", change_condition: "none" },
  ],
  total_trial_count: 2,
  practice_results: [{ practice_round: 1, practice_number: 1, melody_change_rating: 3 }],
};

const CONFIRMED = (n) => ({
  melody_change_rating: n,
  harmony_change_rating: n + 1,
  overall_change_rating: n + 2,
  response_enabled_at: `E${n}`,
  response_confirmed_at: `C${n}`,
  response_time_ms: 100 * n,
});

test("保存先は参加者IDごとの functional-pitch:<ID> で、空なら schemaVersion 1 の空データ", () => {
  const storage = makeFakeStorage();
  assert.deepEqual(loadParticipantData("P00001", storage), { schemaVersion: 1, sessions: [] });
  startSession("P00001", INFO, { storage, now: makeClock(), generateId: () => "s1" });
  assert.deepEqual(storage.keys(), ["functional-pitch:P00001"]);
});

test("startSession: Key・出題順・練習結果を持つセッションを作り、すぐ保存する", () => {
  const storage = makeFakeStorage();
  const { session } = startSession("P00001", INFO, { storage, now: makeClock(), generateId: () => "s1" });
  assert.deepEqual(session, {
    sessionId: "s1",
    testType: "functional_pitch",
    measurementKeyCode: "C",
    startedAt: "T000",
    endedAt: "",
    sessionStatus: null,
    totalTrialCount: 2,
    generatedTrialOrder: [
      { trialNumber: 1, firstStimulusId: "C-01", secondStimulusId: "C-02", changeCondition: "melody" },
      { trialNumber: 2, firstStimulusId: "C-03", secondStimulusId: "C-03", changeCondition: "none" },
    ],
    practiceResults: INFO.practice_results,
    currentTrial: null,
    responses: [],
  });
  assert.deepEqual(loadParticipantData("P00001", storage).sessions, [session]);
});

test("beginTrial → finalizeTrial で、回答済みの1行(camelCase)になる", () => {
  const storage = makeFakeStorage();
  const { session } = startSession("P00001", INFO, { storage, now: makeClock(), generateId: () => "s1" });
  beginTrial(session, INFO.generated_trial_order[0], () => "TS");
  assert.equal(session.currentTrial.trialNumber, 1);
  finalizeTrial(session, CONFIRMED(1));
  assert.equal(session.currentTrial, null);
  assert.deepEqual(session.responses, [{
    trialNumber: 1, firstStimulusId: "C-01", secondStimulusId: "C-02", changeCondition: "melody", trialStartedAt: "TS",
    melodyChangeRating: 1, harmonyChangeRating: 2, overallChangeRating: 3,
    responseEnabledAt: "E1", responseConfirmedAt: "C1", responseTimeMs: 100, outcome: "answered",
  }]);
});

test("finalizeSession(audio_error): 回答前だった試行は、回答欄が空の interrupted の1行になる", () => {
  const storage = makeFakeStorage();
  const { session } = startSession("P00001", INFO, { storage, now: makeClock(), generateId: () => "s1" });
  beginTrial(session, INFO.generated_trial_order[0], () => "TS");
  finalizeSession(session, "audio_error", () => "END");
  assert.equal(session.sessionStatus, "audio_error");
  assert.equal(session.endedAt, "END");
  assert.equal(session.currentTrial, null);
  assert.equal(session.responses.length, 1);
  assert.equal(session.responses[0].outcome, "interrupted");
  assert.equal(session.responses[0].melodyChangeRating, "");
});

test("次に始めたとき、前回終わらなかったセッションを interrupted として確定する", () => {
  const storage = makeFakeStorage();
  const now = makeClock();
  const recorder = createSessionRecorder("P00001", { storage, now, generateId: () => "s1" });
  recorder.onSessionStarted(INFO);
  recorder.onTrialStarted(INFO.generated_trial_order[0]);
  recorder.onTrialConfirmed(CONFIRMED(1));
  recorder.onTrialStarted(INFO.generated_trial_order[1]);
  // ここでページを閉じた(onKeyMeasured は来ない)。保存済みのデータは残っている
  assert.equal(loadParticipantData("P00001", storage).sessions[0].currentTrial.trialNumber, 2);

  const { data } = startSession("P00001", INFO, { storage, now, generateId: () => "s2" });
  const [first, second] = data.sessions;
  assert.equal(first.sessionStatus, "interrupted");
  assert.notEqual(first.endedAt, "");
  assert.deepEqual(first.responses.map((r) => r.outcome), ["answered", "interrupted"]);
  assert.equal(second.sessionId, "s2");
  assert.equal(second.sessionStatus, null);
  // 確定した結果は保存される
  assert.equal(loadParticipantData("P00001", storage).sessions[0].sessionStatus, "interrupted");
});

test("同じKeyを何度測っても、セッションはすべて残る(上書きしない)", () => {
  const storage = makeFakeStorage();
  let id = 0;
  for (let i = 0; i < 3; i += 1) {
    const recorder = createSessionRecorder("P00001", { storage, now: makeClock(), generateId: () => `s${id++}` });
    recorder.onSessionStarted(INFO);
    recorder.onKeyMeasured({ measurement_status: "completed" });
  }
  const sessions = loadParticipantData("P00001", storage).sessions;
  assert.deepEqual(sessions.map((s) => s.sessionId), ["s0", "s1", "s2"]);
  assert.ok(sessions.every((s) => s.sessionStatus === "completed"));
});

test("参加者IDが違えば、別のキーに保存される", () => {
  const storage = makeFakeStorage();
  startSession("P00001", INFO, { storage, generateId: () => "a" });
  startSession("P00002", INFO, { storage, generateId: () => "b" });
  assert.deepEqual(storage.keys(), ["functional-pitch:P00001", "functional-pitch:P00002"]);
  assert.equal(loadParticipantData("P00002", storage).sessions[0].sessionId, "b");
});

test("壊れた保存データは空として扱い、保存に失敗しても例外にならない", () => {
  const storage = makeFakeStorage();
  storage.setItem("functional-pitch:P00001", "{壊れた");
  assert.deepEqual(loadParticipantData("P00001", storage), { schemaVersion: 1, sessions: [] });
  const failing = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  assert.equal(persistParticipantData("P00001", { sessions: [] }, failing), false);
  const recorder = createSessionRecorder("P00001", { storage: failing });
  assert.doesNotThrow(() => {
    recorder.onSessionStarted(INFO);
    recorder.onTrialStarted(INFO.generated_trial_order[0]);
    recorder.onTrialConfirmed(CONFIRMED(1));
    recorder.onKeyMeasured({ measurement_status: "completed" });
  });
});

test("記録係: セッションの開始前・終了後に届いた通知は無視する", () => {
  const storage = makeFakeStorage();
  const recorder = createSessionRecorder("P00001", { storage, generateId: () => "s1" });
  recorder.onTrialStarted(INFO.generated_trial_order[0]);
  recorder.onTrialConfirmed(CONFIRMED(1));
  recorder.onKeyMeasured({ measurement_status: "completed" });
  assert.deepEqual(storage.keys(), []);
  recorder.onSessionStarted(INFO);
  recorder.onKeyMeasured({ measurement_status: "completed" });
  recorder.onTrialStarted(INFO.generated_trial_order[0]);
  assert.equal(loadParticipantData("P00001", storage).sessions[0].currentTrial, null);
});

test("結合: 本物の runKeyMeasurement の通知で、1試行ごとに保存され、最後に completed になる", async () => {
  const storage = makeFakeStorage();
  const recorder = createSessionRecorder("P00001", { storage, generateId: () => "s1" });
  const starts = [];
  runKeyMeasurement({
    screenEl: createFakeScreen(),
    keyCode: "Fis",
    trialLimit: 3,
    ...recorder,
    onMeasured: recorder.onKeyMeasured,
    resumeAudioContextFn: () => Promise.resolve(),
    loadKeyPhrasesFn: () => Promise.resolve({ ok: true, failures: [] }),
    enableUnloadGuardFn: () => () => {},
    mountTrialScreenFn: () => ({ start: (args) => starts.push(args), destroy() {} }),
  });
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  const saved = () => loadParticipantData("P00001", storage).sessions[0];
  assert.equal(saved().measurementKeyCode, "Fis");
  assert.equal(saved().totalTrialCount, 3);
  assert.equal(saved().generatedTrialOrder.length, 90);
  assert.equal(saved().currentTrial.trialNumber, 1);

  starts.at(-1).onConfirmed(CONFIRMED(1));
  assert.equal(saved().responses.length, 1);
  assert.equal(saved().currentTrial.trialNumber, 2);
  starts.at(-1).onConfirmed(CONFIRMED(2));
  starts.at(-1).onConfirmed(CONFIRMED(3));
  assert.equal(saved().sessionStatus, "completed");
  assert.deepEqual(saved().responses.map((r) => r.trialNumber), [1, 2, 3]);
  assert.equal(saved().currentTrial, null);
});

test("送信処理は functional-pitch: のキーを送らない(送信はまだ作らない)", async () => {
  const storage = makeFakeStorage();
  const recorder = createSessionRecorder("P00001", { storage, generateId: () => "s1" });
  recorder.onSessionStarted(INFO);
  recorder.onKeyMeasured({ measurement_status: "completed" });
  const calls = [];
  const summary = await syncPendingSessions({
    storage,
    fetchFn: async (...args) => { calls.push(args); return { status: 201 }; },
    endpoint: "https://example.test/api/session_create.php",
  });
  assert.equal(calls.length, 0);
  assert.equal(summary.sent, 0);
});
