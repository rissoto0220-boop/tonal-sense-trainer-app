// 機能的音感測定1試行分の音声タイムライン(仕様8章)。画面・保存・サーバーには依存しない。
//
// 2つのフレーズを、読み込み・デコードしたうえで AudioContext(音声専用の正確な時計)を基準に
// まとめて予約する。
//   base         : 第1フレーズの開始(読み込み完了時点の時刻+COLD_START_LEAD_SECONDS)
//   base + 4.8   : 第1フレーズ終了
//   base + 5.8   : 第2フレーズ開始(第1フレーズ終了から1秒後)
//   base + 10.6  : 第2フレーズ終了=回答操作の有効化
// 段階の切り替え(onPhase・onAnswerable)はsetTimeoutで行うが、発火時にAudioContextの時計を
// 読み直し、予定より早ければ残り時間で予約し直す(音声の時計を正とする)。
// 既存の相対音感(question-timeline.js)と同じく、時計・タイマー・音声は外から差し替えられる。
import {
  loadAudioBuffer,
  scheduleAudioBuffer,
  audioContextTime,
  COLD_START_LEAD_SECONDS,
} from "../shared/audio-buffer-player.js";
import { createAnswerLock } from "../shared/answer-lock.js";
import { toLocalIso } from "../shared/iso-time.js";
import { createClockScheduler } from "./audio-clock.js";
import {
  PHRASE_GAP_SECONDS,
  FUNCTIONAL_SOUNDS_BASE_PATH,
  phraseSrcFor,
  checkPhraseDuration,
} from "./phrase-audio.js";

// trial: { keyCode, firstStimulusId, secondStimulusId }
//
// options:
//   onPhase(phase): "preparing"(読み込み中)→"phrase1"→"gap"→"phrase2" の各段階の開始時に呼ぶ。
//   onAnswerable({ responseEnabledAt }): 第2フレーズの終了時(回答有効化)に1回呼ぶ。
//   onError({ kind, error }): 失敗時に1回だけ呼ぶ。kind は "load"/"duration"/"schedule"。
//     onError を呼んだ後は、onPhase・onAnswerable は呼ばない。
//
// 戻り値:
//   confirm(): 回答確定。回答有効化の前・確定済み・中止後・エラー後は null。それ以外は最初の1回だけ
//     { responseEnabledAt, responseConfirmedAt, responseTimeMs } を返す。
//   cancel(): 予約したタイマーを消し、鳴っている音源を止める。以後どのコールバックも呼ばれない。
export function runTrialTimeline(trial, {
  onPhase = () => {},
  onAnswerable = () => {},
  onError = () => {},
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  loadAudioBufferFn = loadAudioBuffer,
  scheduleAudioBufferFn = scheduleAudioBuffer,
  audioContextTimeFn = audioContextTime,
  nowIsoFn = () => toLocalIso(),
  soundsBasePath = FUNCTIONAL_SOUNDS_BASE_PATH,
} = {}) {
  let stopped = false; // 中止またはエラーで、以後コールバックを呼ばない状態
  const clock = createClockScheduler({ setTimeoutFn, clearTimeoutFn, audioContextTimeFn });
  const sources = [];
  let enabled = null; // 回答有効化の実時刻 { audioTime, iso }
  const confirmLock = createAnswerLock();

  function stopAll() {
    stopped = true;
    clock.cancelAll();
    sources.forEach((source) => {
      try { source.stop(); } catch { /* 既に終了している音源は無視する */ }
    });
  }

  function fail(kind, error) {
    if (stopped) return;
    stopAll();
    onError({ kind, error });
  }

  function onLoaded([firstBuffer, secondBuffer]) {
    if (stopped) return;
    for (const buffer of [firstBuffer, secondBuffer]) {
      const { ok, durationSeconds } = checkPhraseDuration(buffer);
      if (!ok) {
        fail("duration", new Error(`フレーズの長さが想定と異なります: ${durationSeconds}秒`));
        return;
      }
    }

    const base = audioContextTimeFn() + COLD_START_LEAD_SECONDS;
    const firstEndsAt = base + firstBuffer.duration;
    const secondStartsAt = firstEndsAt + PHRASE_GAP_SECONDS;
    const answerableAt = secondStartsAt + secondBuffer.duration;

    try {
      sources.push(scheduleAudioBufferFn(firstBuffer, base).source);
      sources.push(scheduleAudioBufferFn(secondBuffer, secondStartsAt).source);
    } catch (error) {
      fail("schedule", error);
      return;
    }

    clock.runAt(base, () => onPhase("phrase1"));
    clock.runAt(firstEndsAt, () => onPhase("gap"));
    clock.runAt(secondStartsAt, () => onPhase("phrase2"));
    clock.runAt(answerableAt, () => {
      // 予定時刻ではなく、実際に有効化できた時点を記録する(反応時間の起点)。
      enabled = { audioTime: audioContextTimeFn(), iso: nowIsoFn() };
      onAnswerable({ responseEnabledAt: enabled.iso });
    });
  }

  onPhase("preparing");
  Promise.all([
    loadAudioBufferFn(phraseSrcFor(trial.keyCode, trial.firstStimulusId, soundsBasePath)),
    loadAudioBufferFn(phraseSrcFor(trial.keyCode, trial.secondStimulusId, soundsBasePath)),
  ]).then(onLoaded, (error) => fail("load", error));

  return {
    confirm() {
      if (stopped || !enabled) return null;
      if (!confirmLock.tryLock()) return null;
      const confirmedAudioTime = audioContextTimeFn();
      return {
        responseEnabledAt: enabled.iso,
        responseConfirmedAt: nowIsoFn(),
        responseTimeMs: Math.round((confirmedAudioTime - enabled.audioTime) * 1000),
      };
    },
    cancel() {
      if (stopped) return;
      stopAll();
    },
  };
}
