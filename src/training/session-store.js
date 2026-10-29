// 音感訓練の、セッション・試行記録のブラウザ保存(tonal-sense-docs/training_pending_to_decisions.md 第7〜10・16節)。
// 機能的音感の session-store.js と同じ考え方: 参加者IDごとに、他のテストとは別のlocalStorageキーへ、
// その参加者の訓練の全セッションをまとめて保存する。1セッション=1つのメニューの訓練1回。
// 回答を確定するたびに保存するので、途中でページを閉じても、次に訓練を始めたときに interrupted として確定できる。
// 送信はしない(送信処理は absolute-pitch: / relative-pitch: のキーしか見ないため、このキーは送られない。
// サーバーでの種別(testType / activityType)は未決定)。
//
// 訓練の進行(training-session.js)の通知は、保存と同じcamelCaseで届く。CSVでsnake_caseにする(reports.js)。
import { loadJson, saveJson } from "../shared/storage.js";
import { toLocalIso } from "../shared/iso-time.js";

const SCHEMA_VERSION = 1;

function storageKeyFor(participantId) {
  return `training:${participantId}`;
}

function emptyParticipantData() {
  return { schemaVersion: SCHEMA_VERSION, sessions: [] };
}

export function loadParticipantData(participantId, storage) {
  return loadJson(storage, storageKeyFor(participantId), emptyParticipantData());
}

export function persistParticipantData(participantId, data, storage) {
  return saveJson(storage, storageKeyFor(participantId), data);
}

// 件数は試行の記録から数え直す(試行を足す・直すたびに呼ぶ)。
function refreshCounts(session) {
  session.trialsCompleted = session.trials.length;
  session.correctCount = session.trials.filter((trial) => trial.scoring.allCorrect).length;
  session.giveupCount = session.trials.filter((trial) => trial.responses.some((response) => response.outcome === "giveup")).length;
}

// 前回、終了しないまま残っていたセッション(ページを閉じた等)を interrupted として確定する。
function reconcileDanglingSessions(data, now) {
  data.sessions.forEach((session) => {
    if (session.sessionStatus) return; // すでに completed / interrupted / audio_error で終了済み
    session.sessionStatus = "interrupted";
    session.endedAt = now();
  });
}

// 訓練を始めた時点で呼ぶ。info: training-session.js の onSessionStarted の内容
//   { menuId, sessionKeyCode, keyAssignmentMethod, trialsPlanned }
// attemptNumber は、同じメニューを始めた回数(中断・音声エラーも数える。研究者の決定、第10節)。
export function startSession(participantId, info, {
  storage,
  now = () => toLocalIso(),
  generateId = () => crypto.randomUUID(),
}) {
  const data = loadParticipantData(participantId, storage);
  reconcileDanglingSessions(data, now);

  const session = {
    trainingSessionId: generateId(),
    menuId: info.menuId,
    attemptNumber: data.sessions.filter((item) => item.menuId === info.menuId).length + 1,
    sessionStatus: null, // completed / interrupted / audio_error が決まるまでは null
    sessionKeyCode: info.sessionKeyCode,
    keyAssignmentMethod: info.keyAssignmentMethod,
    startedAt: now(),
    endedAt: "",
    trialsPlanned: info.trialsPlanned,
    trialsCompleted: 0,
    correctCount: 0,
    giveupCount: 0,
    trials: [],
  };
  data.sessions.push(session);
  persistParticipantData(participantId, data, storage);

  return { data, session };
}

// 回答を確定した試行を記録する。試行は trainingSessionId + trialNumber で区別する(第14節)。
export function addTrial(session, trial) {
  session.trials.push({ trainingSessionId: session.trainingSessionId, ...structuredClone(trial) });
  refreshCounts(session);
}

// 回答後に変わった試行(フィードバックを聞き直した回数)を書き換える。
export function updateTrial(session, trial) {
  const index = session.trials.findIndex((item) => item.trialNumber === trial.trialNumber);
  if (index < 0) return;
  session.trials[index] = { trainingSessionId: session.trainingSessionId, ...structuredClone(trial) };
  refreshCounts(session);
}

// セッションの終了(completed / interrupted / audio_error)。一度決まった状態は変えない。
export function finalizeSession(session, sessionStatus, now = () => toLocalIso()) {
  if (session.sessionStatus) return;
  session.sessionStatus = sessionStatus;
  session.endedAt = now();
}

// 訓練の進行の通知を受けて、そのたびに保存する記録係(app.js から使う)。
// 戻り値の各関数は、runTrainingSession の同じ名前の引数にそのまま渡せる。
// 完了(onFinished)の後も、最終問のフィードバックを聞き直した回数(onTrialUpdated)は書き換える。
export function createSessionRecorder(participantId, { storage, now, generateId } = {}) {
  let data = null;
  let session = null;
  const persist = () => persistParticipantData(participantId, data, storage);
  const clock = now ? { now } : {};
  const finish = (status) => {
    if (!session) return;
    finalizeSession(session, status, now);
    persist();
  };

  return {
    onSessionStarted(info) {
      ({ data, session } = startSession(participantId, info, { storage, generateId, ...clock }));
    },
    onTrialConfirmed(trial) {
      if (!session || session.sessionStatus) return;
      addTrial(session, trial);
      persist();
    },
    onTrialUpdated(trial) {
      if (!session) return;
      updateTrial(session, trial);
      persist();
    },
    onFinished() {
      finish("completed");
    },
    onInterrupted() {
      finish("interrupted");
      session = null;
    },
    onAudioError() {
      finish("audio_error");
      session = null;
    },
  };
}
