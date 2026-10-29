// 機能的音感測定の、セッション・試行記録の組み立てとブラウザ保存(仕様20章)。
// 相対音感の session-store.js と同じ考え方: 参加者IDごとに、他のテストとは別のlocalStorageキーへ、
// その参加者の機能的音感の全セッションをまとめて保存する。1セッション=1つのKeyの測定1回。
// 1試行ごとに保存するので、途中でページを閉じても、次に測定を始めたときに interrupted として確定できる。
// 送信はしない(送信処理は absolute-pitch: / relative-pitch: のキーしか見ないため、このキーは送られない)。
//
// 測定部品(key-measurement.js など)の通知は snake_case の名前で届く。保存はcamelCase、CSVはsnake_case
// (既存の絶対音感・相対音感と同じ)なので、ここでcamelCaseへ写す。
import { loadJson, saveJson } from "../shared/storage.js";
import { toLocalIso } from "../shared/iso-time.js";

const SCHEMA_VERSION = 1;
const TEST_TYPE = "functional_pitch";

function storageKeyFor(participantId) {
  return `functional-pitch:${participantId}`;
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

const toTrialEntry = (entry) => ({
  trialNumber: entry.trial_number,
  firstStimulusId: entry.first_stimulus_id,
  secondStimulusId: entry.second_stimulus_id,
  changeCondition: entry.change_condition,
});

// 回答前に終わった試行(進行中のまま残った試行)を、回答欄が空の1行として確定する。
function closeCurrentTrial(session) {
  if (!session.currentTrial) return;
  session.responses.push({
    ...session.currentTrial,
    melodyChangeRating: "",
    harmonyChangeRating: "",
    overallChangeRating: "",
    responseEnabledAt: "",
    responseConfirmedAt: "",
    responseTimeMs: "",
    outcome: "interrupted",
  });
  session.currentTrial = null;
}

// 前回、終了しないまま残っていたセッション(ページを閉じた等)を interrupted として確定する。
function reconcileDanglingSessions(data, now) {
  data.sessions.forEach((session) => {
    if (session.sessionStatus) return; // すでに completed / audio_error で終了済み
    closeCurrentTrial(session);
    session.sessionStatus = "interrupted";
    session.endedAt = now();
  });
}

// 音源の読み込みに成功し、試行を始める時点で呼ぶ。
// info: { measurement_key_code, generated_trial_order, total_trial_count, practice_results }
export function startSession(participantId, info, {
  storage,
  now = () => toLocalIso(),
  generateId = () => crypto.randomUUID(),
}) {
  const data = loadParticipantData(participantId, storage);
  reconcileDanglingSessions(data, now);

  const session = {
    sessionId: generateId(),
    testType: TEST_TYPE,
    measurementKeyCode: info.measurement_key_code,
    startedAt: now(),
    endedAt: "",
    sessionStatus: null, // completed / audio_error / interrupted が決まるまでは null
    totalTrialCount: info.total_trial_count,
    generatedTrialOrder: (info.generated_trial_order ?? []).map(toTrialEntry), // 90試行の出題順(短縮時も90件)
    practiceResults: (info.practice_results ?? []).map((r) => ({ ...r })), // 練習の結果(そのままの形で残す)
    currentTrial: null,
    responses: [],
  };
  data.sessions.push(session);
  persistParticipantData(participantId, data, storage);

  return { data, session };
}

// 試行を始めた時点で「進行中の試行」として記録する。
export function beginTrial(session, entry, now = () => toLocalIso()) {
  session.currentTrial = { ...toTrialEntry(entry), trialStartedAt: now() };
}

// 回答を確定した時点で、進行中の試行を正式な1行として記録する。
export function finalizeTrial(session, confirmed) {
  session.responses.push({
    ...session.currentTrial,
    melodyChangeRating: confirmed.melody_change_rating,
    harmonyChangeRating: confirmed.harmony_change_rating,
    overallChangeRating: confirmed.overall_change_rating,
    responseEnabledAt: confirmed.response_enabled_at,
    responseConfirmedAt: confirmed.response_confirmed_at,
    responseTimeMs: confirmed.response_time_ms,
    outcome: "answered",
  });
  session.currentTrial = null;
}

// セッションの終了(completed / audio_error)。音声エラーで終わった試行は、回答欄が空の1行になる。
export function finalizeSession(session, sessionStatus, now = () => toLocalIso()) {
  closeCurrentTrial(session);
  session.sessionStatus = sessionStatus;
  session.endedAt = now();
}

// 測定部品の通知を受けて、1試行ごとに保存する記録係(app.js から使う)。
// 戻り値の各関数は、runFunctionalPitchSession の onSessionStarted / onTrialStarted /
// onTrialConfirmed / onKeyMeasured にそのまま渡せる。
export function createSessionRecorder(participantId, { storage, now, generateId } = {}) {
  let data = null;
  let session = null;
  const persist = () => persistParticipantData(participantId, data, storage);
  const clock = now ? { now } : {};

  return {
    onSessionStarted(info) {
      ({ data, session } = startSession(participantId, info, { storage, generateId, ...clock }));
    },
    onTrialStarted(entry) {
      if (!session) return;
      beginTrial(session, entry, now);
      persist();
    },
    onTrialConfirmed(confirmed) {
      if (!session?.currentTrial) return;
      finalizeTrial(session, confirmed);
      persist();
    },
    onKeyMeasured(result) {
      if (!session) return;
      finalizeSession(session, result.measurement_status, now);
      persist();
      session = null;
    },
  };
}
