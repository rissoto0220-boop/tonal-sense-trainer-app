import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildHistorySummary,
  buildResponseDetailRows,
  buildSessionHistoryRows,
  buildCsvFilename,
  RESPONSE_DETAIL_HEADERS,
  SESSION_HISTORY_HEADERS,
} from "../../src/functional-pitch/reports.js";

const answered = (n) => ({
  trialNumber: n, firstStimulusId: `C-0${n}`, secondStimulusId: "C-09", changeCondition: "melody", trialStartedAt: `TS${n}`,
  melodyChangeRating: 1, harmonyChangeRating: 2, overallChangeRating: 3,
  responseEnabledAt: `E${n}`, responseConfirmedAt: `C${n}`, responseTimeMs: 100 * n, outcome: "answered",
});
const unanswered = (n) => ({
  ...answered(n), melodyChangeRating: "", harmonyChangeRating: "", overallChangeRating: "",
  responseEnabledAt: "", responseConfirmedAt: "", responseTimeMs: "", outcome: "interrupted",
});

function session(id, key, startedAt, status, responses, extra = {}) {
  return {
    sessionId: id, testType: "functional_pitch", measurementKeyCode: key, startedAt, endedAt: `${startedAt}-end`,
    sessionStatus: status, totalTrialCount: 2, generatedTrialOrder: [], practiceResults: [],
    currentTrial: null, responses, ...extra,
  };
}

// 保存順と開始時刻の順をわざとずらしてある
const SESSIONS = [
  session("c2", "C", "2026-10-27T11:00:00+09:00", "completed", [answered(1), answered(2)]),
  session("c1", "C", "2026-10-27T10:00:00+09:00", "interrupted", [answered(1), unanswered(2)], { practiceResults: [{}, {}, {}] }),
  session("f1", "Fis", "2026-10-27T10:30:00+09:00", "audio_error", [unanswered(1)]),
  session("c3", "C", "2026-10-27T12:00:00+09:00", null, [answered(1)]), // 測定中(未確定)
];

test("履歴: 開始時刻の古い順に、Keyごとに第n回を振る。未確定は出さず、既定では中断も出さない", () => {
  assert.deepEqual(buildHistorySummary(SESSIONS, true).map((r) => [r.measurementKeyCode, r.attemptNumber, r.sessionStatus]), [
    ["C", 1, "interrupted"],
    ["Fis", 1, "audio_error"],
    ["C", 2, "completed"],
  ]);
  const visible = buildHistorySummary(SESSIONS, false);
  assert.deepEqual(visible.map((r) => [r.measurementKeyCode, r.attemptNumber]), [["C", 2]]); // 番号は詰め直さない
  assert.equal(visible[0].answeredCount, 2);
  assert.equal(visible[0].totalTrialCount, 2);
});

test("回答詳細CSV: 1行=1試行で、列の並びどおりの値が入る", () => {
  assert.deepEqual(RESPONSE_DETAIL_HEADERS, [
    "participant_id", "session_id", "test_type", "session_status", "session_started_at",
    "measurement_key_code", "attempt_number",
    "trial_number", "first_stimulus_id", "second_stimulus_id", "change_condition", "trial_started_at",
    "melody_change_rating", "harmony_change_rating", "overall_change_rating",
    "response_enabled_at", "response_confirmed_at", "response_time_ms", "outcome",
  ]);
  const rows = buildResponseDetailRows("P00001", SESSIONS, false);
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]), RESPONSE_DETAIL_HEADERS);
  assert.deepEqual(rows[1], {
    participant_id: "P00001", session_id: "c2", test_type: "functional_pitch", session_status: "completed",
    session_started_at: "2026-10-27T11:00:00+09:00", measurement_key_code: "C", attempt_number: 2,
    trial_number: 2, first_stimulus_id: "C-02", second_stimulus_id: "C-09", change_condition: "melody", trial_started_at: "TS2",
    melody_change_rating: 1, harmony_change_rating: 2, overall_change_rating: 3,
    response_enabled_at: "E2", response_confirmed_at: "C2", response_time_ms: 200, outcome: "answered",
  });
});

test("回答詳細CSV: 「中断した履歴を含める」で、中断・音声エラーの回の行(回答前の試行を含む)も出る", () => {
  const rows = buildResponseDetailRows("P00001", SESSIONS, true);
  assert.deepEqual(rows.map((r) => [r.session_id, r.trial_number, r.outcome]), [
    ["c1", 1, "answered"], ["c1", 2, "interrupted"],
    ["f1", 1, "interrupted"],
    ["c2", 1, "answered"], ["c2", 2, "answered"],
  ]);
  assert.equal(rows[1].melody_change_rating, "");
});

test("テスト履歴CSV: 1行=1セッションで、練習の試行数・回答済み試行数・総試行数を出す", () => {
  assert.deepEqual(SESSION_HISTORY_HEADERS, [
    "participant_id", "session_id", "test_type", "measurement_key_code", "attempt_number",
    "session_status", "started_at", "ended_at",
    "practice_trial_count", "answered_trial_count", "total_trial_count",
  ]);
  const rows = buildSessionHistoryRows("P00001", SESSIONS, true);
  assert.deepEqual(rows.map((r) => Object.keys(r)), rows.map(() => SESSION_HISTORY_HEADERS));
  assert.deepEqual(rows[0], {
    participant_id: "P00001", session_id: "c1", test_type: "functional_pitch", measurement_key_code: "C", attempt_number: 1,
    session_status: "interrupted", started_at: "2026-10-27T10:00:00+09:00", ended_at: "2026-10-27T10:00:00+09:00-end",
    practice_trial_count: 3, answered_trial_count: 1, total_trial_count: 2,
  });
  assert.deepEqual(buildSessionHistoryRows("P00001", SESSIONS, false).map((r) => r.session_id), ["c2"]);
});

test("CSVのファイル名: <ID>_functional_pitch_<種類>_<日時>.csv", () => {
  const date = new Date(2026, 9, 27, 15, 35, 25);
  assert.equal(buildCsvFilename("P00001", "responses", date), "P00001_functional_pitch_responses_20261027_153525.csv");
  assert.equal(buildCsvFilename("P00001", "sessions", date), "P00001_functional_pitch_sessions_20261027_153525.csv");
});
