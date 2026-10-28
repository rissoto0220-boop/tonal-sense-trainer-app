import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toSnakeCase,
  toSnakeCaseRow,
  buildHistorySummary,
  buildResponseDetailRows,
  buildSessionHistoryRows,
  buildCsvFilename,
  RESPONSE_DETAIL_HEADERS,
  SESSION_HISTORY_HEADERS,
} from "../../src/training/reports.js";
import { toCsv } from "../../src/shared/csv.js";

const trial = (sessionId, n, outcome = "correct") => ({
  trainingSessionId: sessionId,
  trialNumber: n,
  menuId: "menu-01",
  stimulusId: "st-n7-ch-n5-dom7",
  stimulusVersion: "01",
  taskTemplateId: "tt-melody-first",
  keyCode: "C",
  questionReplayCount: n,
  feedbackReplayCount: 0,
  audioStartedAt: `A${n}`,
  audioEndedAt: `B${n}`,
  responseEnabledAt: `B${n}`,
  responseSubmittedAt: `C${n}`,
  responseTimeMs: 100 * n,
  responses: [{ targetId: "t1", responseCode: outcome === "giveup" ? null : "n7", correctAnswerCode: "n7", outcome }],
  scoring: { targetCount: 1, correctTargetCount: outcome === "correct" ? 1 : 0, accuracy: 0, allCorrect: outcome === "correct" },
});

function session(id, menuId, attemptNumber, startedAt, status, trials, extra = {}) {
  return {
    trainingSessionId: id, menuId, attemptNumber, sessionStatus: status,
    sessionKeyCode: "C", keyAssignmentMethod: "fixed", startedAt, endedAt: `${startedAt}-end`,
    trialsPlanned: 15, trialsCompleted: trials.length,
    correctCount: trials.filter((t) => t.scoring.allCorrect).length,
    giveupCount: trials.filter((t) => t.responses[0].outcome === "giveup").length,
    trials, ...extra,
  };
}

// 保存順と開始時刻の順をわざとずらしてある
const SESSIONS = [
  session("a2", "menu-01", 2, "2026-10-28T11:00:00+09:00", "completed", [trial("a2", 1), trial("a2", 2, "giveup")]),
  session("a1", "menu-01", 1, "2026-10-28T10:00:00+09:00", "interrupted", [trial("a1", 1, "incorrect")]),
  session("b1", "menu-09", 1, "2026-10-28T10:30:00+09:00", "audio_error", [], { sessionKeyCode: "Es", keyAssignmentMethod: "randomAtSessionStart" }),
  session("a3", "menu-01", 3, "2026-10-28T12:00:00+09:00", null, [trial("a3", 1)]), // 訓練中(未確定)
];

test("camelCase → snake_case の変換", () => {
  assert.equal(toSnakeCase("responseTimeMs"), "response_time_ms");
  assert.equal(toSnakeCase("menuId"), "menu_id");
  assert.equal(toSnakeCase("outcome"), "outcome");
  assert.deepEqual(toSnakeCaseRow({ trainingSessionId: "x", trialNumber: 1 }), { training_session_id: "x", trial_number: 1 });
});

test("履歴: 開始時刻の古い順。第n回は保存した attemptNumber。未確定は出さず、既定では中断も出さない", () => {
  assert.deepEqual(buildHistorySummary(SESSIONS, true).map((r) => [r.menuId, r.attemptNumber, r.sessionStatus]), [
    ["menu-01", 1, "interrupted"],
    ["menu-09", 1, "audio_error"],
    ["menu-01", 2, "completed"],
  ]);
  assert.deepEqual(buildHistorySummary(SESSIONS, false), [{
    attemptNumber: 2, menuId: "menu-01", sessionKeyCode: "C", startedAt: "2026-10-28T11:00:00+09:00",
    sessionStatus: "completed", trialsCompleted: 2, correctCount: 1, trialsPlanned: 15,
  }]);
});

test("回答詳細CSV: 1行=1試行。列は見出しと同じ並びで、すべて snake_case", () => {
  const rows = buildResponseDetailRows("P00001", SESSIONS, true);
  assert.deepEqual(rows.map((r) => [r.training_session_id, r.trial_number]), [["a1", 1], ["a2", 1], ["a2", 2]]);
  for (const row of rows) assert.deepEqual(Object.keys(row), RESPONSE_DETAIL_HEADERS);
  assert.deepEqual(rows[1], {
    participant_id: "P00001", training_session_id: "a2", menu_id: "menu-01", attempt_number: 2, session_status: "completed",
    session_key_code: "C", key_assignment_method: "fixed",
    trial_number: 1, stimulus_id: "st-n7-ch-n5-dom7", stimulus_version: "01", task_template_id: "tt-melody-first", key_code: "C",
    correct_answer_code: "n7", response_code: "n7", outcome: "correct",
    question_replay_count: 1, feedback_replay_count: 0,
    audio_started_at: "A1", audio_ended_at: "B1", response_enabled_at: "B1", response_submitted_at: "C1", response_time_ms: 100,
  });
  assert.deepEqual(buildResponseDetailRows("P00001", SESSIONS, false).map((r) => r.training_session_id), ["a2", "a2"]);
});

test("回答詳細CSV: 「わからない」は response_code が空欄、outcome が giveup", () => {
  const csv = toCsv(RESPONSE_DETAIL_HEADERS, buildResponseDetailRows("P00001", SESSIONS, false));
  const line = csv.split("\r\n")[2].split(",");
  assert.equal(line[RESPONSE_DETAIL_HEADERS.indexOf("response_code")], "");
  assert.equal(line[RESPONSE_DETAIL_HEADERS.indexOf("outcome")], "giveup");
});

test("訓練履歴CSV: 1行=1セッション。列は見出しと同じ並び", () => {
  const rows = buildSessionHistoryRows("P00001", SESSIONS, true);
  assert.deepEqual(rows.map((r) => r.training_session_id), ["a1", "b1", "a2"]);
  for (const row of rows) assert.deepEqual(Object.keys(row), SESSION_HISTORY_HEADERS);
  assert.deepEqual(rows[1], {
    participant_id: "P00001", training_session_id: "b1", menu_id: "menu-09", attempt_number: 1, session_status: "audio_error",
    session_key_code: "Es", key_assignment_method: "randomAtSessionStart",
    started_at: "2026-10-28T10:30:00+09:00", ended_at: "2026-10-28T10:30:00+09:00-end",
    trials_planned: 15, trials_completed: 0, correct_count: 0, giveup_count: 0,
  });
  assert.deepEqual(buildSessionHistoryRows("P00001", SESSIONS, false).map((r) => r.training_session_id), ["a2"]);
});

test("CSVのファイル名", () => {
  assert.match(buildCsvFilename("P00001", "responses", new Date(2026, 9, 28, 15, 35, 25)), /^P00001_training_responses_20261028_153525\.csv$/);
});
