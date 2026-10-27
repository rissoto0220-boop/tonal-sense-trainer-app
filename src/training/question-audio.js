// 音感訓練の1問ぶんの音声(調セットアップ・出題音・フィードバック)の読み込みと再生予約。DOMに依存しない。
//
// 流れ(研究者の決定、2026-10-27): 調セットアップ → 1秒の無音 → 出題音。回答後にフィードバックのフレーズ。
// 音は完成済みのWAVを、AudioContext の時計で予約して鳴らす(相対音感・機能的音感と同じ方式)。
// 時刻の待ち合わせは、機能的音感の音声時計タイマー(audio-clock.js)を使う。
import {
  loadAudioBuffer,
  scheduleAudioBuffer,
  audioContextTime,
  COLD_START_LEAD_SECONDS,
} from "../shared/audio-buffer-player.js";
import { createClockScheduler } from "../functional-pitch/audio-clock.js";
import {
  TRAINING_SOUNDS_BASE_PATH,
  keySetupAudioFilenameFor,
  questionAudioFilenameFor,
  feedbackAudioFilenameFor,
} from "./stimuli.js";

// 調セットアップの音が終わってから、出題音の音が始まるまでの無音(研究者の決定)。
export const SETUP_TO_QUESTION_GAP_SECONDS = 1.0;
// 音源(WAV)の前後に入っている無音の長さ(仮音源の作り: 前後に1拍=0.5秒ずつ)。
// 正式音源で変わったら、ここを合わせる(間隔1秒はこの値を差し引いて保つ)。
// 音源を差し替えたら scripts/check-training-wavs.py で前後の無音を確かめる。
export const AUDIO_EDGE_SILENCE_SECONDS = 0.5;
// 正解のとき、フィードバックのフレーズが終わってから次の問題へ進むまでの時間(研究者の決定)。
export const AUTO_NEXT_DELAY_SECONDS = 0.5;
// 2回目以降の再生(リプレイ・フィードバック)の予約の先送り。音声の出力は既に動いているので短くてよい
// (どのWAVも先頭に無音があるため、冒頭が欠けても音は欠けない)。
const REPLAY_LEAD_SECONDS = 0.05;

// question: buildQuestions の1問({ stimulusId, keyCode, ... })。
// 戻り値の操作:
//   load(): 3つのWAVを読み込む(Promise)。
//   playQuestion({ withSetup, first, onQuestionOnset(audioTime), onEnd() }):
//     withSetup が真なら調セットアップから鳴らす。onQuestionOnset は出題音の音が鳴り始める時刻に呼ぶ。
//   playFeedback({ onOnset(audioTime), onEnd(), onAutoNext() }):
//     onOnset はフレーズの音が鳴り始める時刻、onAutoNext はフレーズが終わって0.5秒後に呼ぶ。
//   stop(): 鳴っている音と予約を止める(次の再生はできる)。destroy(): 以後何もしない。
export function createQuestionAudio(question, {
  soundsBasePath = TRAINING_SOUNDS_BASE_PATH,
  loadAudioBufferFn = loadAudioBuffer,
  scheduleAudioBufferFn = scheduleAudioBuffer,
  audioContextTimeFn = audioContextTime,
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutFn = (id) => clearTimeout(id),
} = {}) {
  const srcs = {
    setup: soundsBasePath + keySetupAudioFilenameFor(question.keyCode),
    question: soundsBasePath + questionAudioFilenameFor(question.keyCode, question.stimulusId),
    feedback: soundsBasePath + feedbackAudioFilenameFor(question.keyCode, question.stimulusId),
  };
  let buffers = null;
  let sources = [];
  let clock = null;
  let destroyed = false;

  function stop() {
    clock?.cancelAll();
    clock = null;
    for (const source of sources) {
      try { source.stop(); } catch { /* 既に終わった音源は無視する */ }
    }
    sources = [];
  }

  // 鳴らし始める前に、前の音と予約を止めて、新しい予約の入れ物を用意する。
  function begin() {
    if (destroyed) return null;
    if (!buffers) throw new Error("音声がまだ読み込まれていません");
    stop();
    clock = createClockScheduler({ setTimeoutFn, clearTimeoutFn, audioContextTimeFn });
    return clock;
  }

  function schedule(buffer, when) {
    sources.push(scheduleAudioBufferFn(buffer, when).source);
  }

  return {
    srcs,
    load() {
      return Promise.all([srcs.setup, srcs.question, srcs.feedback].map((src) => loadAudioBufferFn(src)))
        .then(([setup, questionBuffer, feedback]) => {
          buffers = { setup, question: questionBuffer, feedback };
        });
    },

    playQuestion({ withSetup, first = false, onQuestionOnset = () => {}, onEnd = () => {} }) {
      const scheduler = begin();
      if (!scheduler) return;
      const base = audioContextTimeFn() + (first ? COLD_START_LEAD_SECONDS : REPLAY_LEAD_SECONDS);
      let questionStart = base;
      if (withSetup) {
        schedule(buffers.setup, base);
        // 調セットアップの音の終わり(WAVの終わり − 後ろの無音)から1秒後に、出題音の音(WAVの始まり + 前の無音)が鳴るように置く。
        questionStart = base + buffers.setup.duration - AUDIO_EDGE_SILENCE_SECONDS + SETUP_TO_QUESTION_GAP_SECONDS - AUDIO_EDGE_SILENCE_SECONDS;
      }
      schedule(buffers.question, questionStart);
      const onsetAt = questionStart + AUDIO_EDGE_SILENCE_SECONDS;
      scheduler.runAt(onsetAt, () => onQuestionOnset(onsetAt));
      scheduler.runAt(questionStart + buffers.question.duration, onEnd);
    },

    playFeedback({ onOnset = () => {}, onEnd = () => {}, onAutoNext = null }) {
      const scheduler = begin();
      if (!scheduler) return;
      const start = audioContextTimeFn() + REPLAY_LEAD_SECONDS;
      schedule(buffers.feedback, start);
      const onsetAt = start + AUDIO_EDGE_SILENCE_SECONDS;
      const soundEndsAt = start + buffers.feedback.duration - AUDIO_EDGE_SILENCE_SECONDS;
      scheduler.runAt(onsetAt, () => onOnset(onsetAt));
      scheduler.runAt(start + buffers.feedback.duration, onEnd);
      if (onAutoNext) scheduler.runAt(soundEndsAt + AUTO_NEXT_DELAY_SECONDS, onAutoNext);
    },

    stop,
    destroy() {
      destroyed = true;
      stop();
    },
  };
}
