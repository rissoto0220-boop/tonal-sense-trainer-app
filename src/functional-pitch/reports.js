// 保存済みのセッション・試行データから、履歴一覧とCSV出力用の行を組み立てる(仕様20章)。
// 相対音感の reports.js と同じ考え方: 件数などは保存時に別途持たず、responses から都度数え直す。
// CSVは出力のたびに保存データから組み立てるので、列を増やしても過去のデータから作り直せる
// (列を増やすときは、〜_HEADERS と行を作る関数の2か所を直す)。
import { toFilenameTimestamp } from "../shared/iso-time.js";

// 「中断」の扱いにする状態(ページを閉じた等の interrupted と、音声エラーの audio_error)。
const isInterrupted = (session) => session.sessionStatus !== "completed";

function byStartedAt(a, b) {
  return a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0;
}

// 終了が確定したセッションを古い順に並べ、Keyごとの実施回数(第n回)を付ける。
// 回数は中断も含めて数え、表示やCSVを絞り込んでも詰め直さない(相対音感と同じ)。
function numberedSessions(sessions) {
  const counts = {};
  return [...sessions]
    .filter((s) => s.sessionStatus)
    .sort(byStartedAt)
    .map((session) => {
      counts[session.measurementKeyCode] = (counts[session.measurementKeyCode] ?? 0) + 1;
      return { session, attemptNumber: counts[session.measurementKeyCode] };
    });
}

function filterNumbered(sessions, includeInterrupted) {
  return numberedSessions(sessions).filter(({ session }) => includeInterrupted || !isInterrupted(session));
}

const answeredCount = (session) => session.responses.filter((r) => r.outcome === "answered").length;

// 履歴一覧の表示用。
export function buildHistorySummary(sessions, includeInterrupted) {
  return filterNumbered(sessions, includeInterrupted).map(({ session, attemptNumber }) => ({
    attemptNumber,
    measurementKeyCode: session.measurementKeyCode,
    startedAt: session.startedAt,
    sessionStatus: session.sessionStatus,
    answeredCount: answeredCount(session),
    totalTrialCount: session.totalTrialCount,
  }));
}

// 推奨ファイル名。例: P00001_functional_pitch_responses_20261027_153525.csv
export function buildCsvFilename(participantId, kind, date = new Date()) {
  return `${participantId}_functional_pitch_${kind}_${toFilenameTimestamp(date)}.csv`;
}

// 回答詳細CSV(1行=1試行)。
export const RESPONSE_DETAIL_HEADERS = [
  "participant_id", "session_id", "test_type", "session_status", "session_started_at",
  "measurement_key_code", "attempt_number",
  "trial_number", "first_stimulus_id", "second_stimulus_id", "change_condition", "trial_started_at",
  "melody_change_rating", "harmony_change_rating", "overall_change_rating",
  "response_enabled_at", "response_confirmed_at", "response_time_ms", "outcome",
];

export function buildResponseDetailRows(participantId, sessions, includeInterrupted) {
  const rows = [];
  filterNumbered(sessions, includeInterrupted).forEach(({ session, attemptNumber }) => {
    session.responses.forEach((r) => {
      rows.push({
        participant_id: participantId,
        session_id: session.sessionId,
        test_type: session.testType,
        session_status: session.sessionStatus,
        session_started_at: session.startedAt,
        measurement_key_code: session.measurementKeyCode,
        attempt_number: attemptNumber,
        trial_number: r.trialNumber,
        first_stimulus_id: r.firstStimulusId,
        second_stimulus_id: r.secondStimulusId,
        change_condition: r.changeCondition,
        trial_started_at: r.trialStartedAt ?? "",
        melody_change_rating: r.melodyChangeRating,
        harmony_change_rating: r.harmonyChangeRating,
        overall_change_rating: r.overallChangeRating,
        response_enabled_at: r.responseEnabledAt,
        response_confirmed_at: r.responseConfirmedAt,
        response_time_ms: r.responseTimeMs,
        outcome: r.outcome,
      });
    });
  });
  return rows;
}

// テスト履歴CSV(1行=1セッション)。
export const SESSION_HISTORY_HEADERS = [
  "participant_id", "session_id", "test_type", "measurement_key_code", "attempt_number",
  "session_status", "started_at", "ended_at",
  "practice_trial_count", "answered_trial_count", "total_trial_count",
];

export function buildSessionHistoryRows(participantId, sessions, includeInterrupted) {
  return filterNumbered(sessions, includeInterrupted).map(({ session, attemptNumber }) => ({
    participant_id: participantId,
    session_id: session.sessionId,
    test_type: session.testType,
    measurement_key_code: session.measurementKeyCode,
    attempt_number: attemptNumber,
    session_status: session.sessionStatus,
    started_at: session.startedAt,
    ended_at: session.endedAt,
    practice_trial_count: session.practiceResults.length, // 0 なら、この回の前に練習をしていない
    answered_trial_count: answeredCount(session),
    total_trial_count: session.totalTrialCount,
  }));
}
