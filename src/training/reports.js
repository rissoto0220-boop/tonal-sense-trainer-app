// 保存済みの訓練セッション・試行データから、履歴一覧とCSV出力用の行を組み立てる。
// 機能的音感の reports.js と同じ考え方: CSVは出力のたびに保存データから組み立てるので、
// 列を増やしても過去のデータから作り直せる(列を増やすときは、〜_HEADERS と行を作る関数の2か所を直す)。
// 列は暫定(履歴画面とCSVの最終列は未決定。training_pending_to_decisions.md「引き続き未確定の事項」5)。
//
// 保存はcamelCase、CSVはsnake_case(研究者の決定、第15節)。変換は toSnakeCaseRow の1か所だけで行う。
import { toFilenameTimestamp } from "../shared/iso-time.js";

// 「中断」の扱いにする状態(「訓練を終了する」・ページを閉じた等の interrupted と、音声エラーの audio_error)。
const isInterrupted = (session) => session.sessionStatus !== "completed";

function byStartedAt(a, b) {
  return a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0;
}

// 終了が確定したセッションを古い順に並べる。第n回(attemptNumber)は開始時に保存した値を使う。
function finishedSessions(sessions, includeInterrupted) {
  return [...sessions]
    .filter((session) => session.sessionStatus)
    .filter((session) => includeInterrupted || !isInterrupted(session))
    .sort(byStartedAt);
}

// "responseTimeMs" → "response_time_ms"
export function toSnakeCase(name) {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function toSnakeCaseRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [toSnakeCase(key), value]));
}

// 履歴一覧の表示用。
export function buildHistorySummary(sessions, includeInterrupted) {
  return finishedSessions(sessions, includeInterrupted).map((session) => ({
    attemptNumber: session.attemptNumber,
    menuId: session.menuId,
    sessionKeyCode: session.sessionKeyCode,
    startedAt: session.startedAt,
    sessionStatus: session.sessionStatus,
    trialsCompleted: session.trialsCompleted,
    correctCount: session.correctCount,
    trialsPlanned: session.trialsPlanned,
  }));
}

// 推奨ファイル名。例: P00001_training_responses_20261028_153525.csv
export function buildCsvFilename(participantId, kind, date = new Date()) {
  return `${participantId}_training_${kind}_${toFilenameTimestamp(date)}.csv`;
}

const sessionColumns = (participantId, session) => ({
  participantId,
  trainingSessionId: session.trainingSessionId,
  menuId: session.menuId,
  attemptNumber: session.attemptNumber,
  sessionStatus: session.sessionStatus,
  sessionKeyCode: session.sessionKeyCode,
  keyAssignmentMethod: session.keyAssignmentMethod,
});

// 回答詳細CSV(1行=1試行)。回答対象は今は1つなので、responses[0] を平らにして列にする。
export const RESPONSE_DETAIL_HEADERS = [
  "participant_id", "training_session_id", "menu_id", "attempt_number", "session_status",
  "session_key_code", "key_assignment_method",
  "trial_number", "stimulus_id", "stimulus_version", "task_template_id", "key_code",
  "correct_answer_code", "response_code", "outcome",
  "question_replay_count", "feedback_replay_count",
  "audio_started_at", "audio_ended_at", "response_enabled_at", "response_submitted_at", "response_time_ms",
];

export function buildResponseDetailRows(participantId, sessions, includeInterrupted) {
  return finishedSessions(sessions, includeInterrupted).flatMap((session) => session.trials.map((trial) => {
    const response = trial.responses[0] ?? {};
    return toSnakeCaseRow({
      ...sessionColumns(participantId, session),
      trialNumber: trial.trialNumber,
      stimulusId: trial.stimulusId,
      stimulusVersion: trial.stimulusVersion,
      taskTemplateId: trial.taskTemplateId,
      keyCode: trial.keyCode,
      correctAnswerCode: response.correctAnswerCode,
      responseCode: response.responseCode, // 「わからない」は null(CSVでは空欄)
      outcome: response.outcome,
      questionReplayCount: trial.questionReplayCount,
      feedbackReplayCount: trial.feedbackReplayCount,
      audioStartedAt: trial.audioStartedAt,
      audioEndedAt: trial.audioEndedAt,
      responseEnabledAt: trial.responseEnabledAt,
      responseSubmittedAt: trial.responseSubmittedAt,
      responseTimeMs: trial.responseTimeMs,
    });
  }));
}

// 訓練履歴CSV(1行=1セッション)。
export const SESSION_HISTORY_HEADERS = [
  "participant_id", "training_session_id", "menu_id", "attempt_number", "session_status",
  "session_key_code", "key_assignment_method", "started_at", "ended_at",
  "trials_planned", "trials_completed", "correct_count", "giveup_count",
];

export function buildSessionHistoryRows(participantId, sessions, includeInterrupted) {
  return finishedSessions(sessions, includeInterrupted).map((session) => toSnakeCaseRow({
    ...sessionColumns(participantId, session),
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    trialsPlanned: session.trialsPlanned,
    trialsCompleted: session.trialsCompleted,
    correctCount: session.correctCount,
    giveupCount: session.giveupCount,
  }));
}
