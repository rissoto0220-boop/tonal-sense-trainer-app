// 機能的音感測定の音色確認(仕様13章)の動き。DOMに依存しない。
//
// リコーダー単独・ピアノ単独の2音源を、それぞれ最後まで1回以上聴くと、練習へ進める。
// - 「聴いた」と数えるのは、再生を始めたときではなく、最後まで再生し終えたとき
// - 2音源を同時に再生しない。どちらかの再生中は、他の再生を受け付けない(画面でも全ボタンを無効にする)
// - 再生回数に上限はない。両方聴いた後も、何度でも聴き直せる
//
// view が持つ関数:
//   setPartState(part, state) : state は "idle"(未再生)/ "playing"(再生中)/ "played"(再生済み)
//   setPlayEnabled(enabled)   : 「聴く」ボタン(全部)の有効・無効
//   setProceedEnabled(enabled): 「練習へ進む」の有効・無効
//   showError(kind)           : 音声エラーの表示
import {
  loadAudioBuffer,
  scheduleAudioBuffer,
  audioContextTime,
  resumeAudioContext,
  COLD_START_LEAD_SECONDS,
} from "../shared/audio-buffer-player.js";
import { createClockScheduler } from "./audio-clock.js";
import { TONE_CHECK_PARTS, toneCheckFilenameFor } from "./stimuli.js";
import { FUNCTIONAL_SOUNDS_BASE_PATH } from "./phrase-audio.js";

// onError({ kind, error }): 読み込み・再生の失敗時に1回だけ呼ぶ。以後このcontrollerは何も受け付けない。
// 時計・タイマー・音声は外から差し替えられる(既存と同じ作り)。
export function createToneCheckController({
  view,
  onError = () => {},
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  resumeAudioContextFn = resumeAudioContext,
  loadAudioBufferFn = loadAudioBuffer,
  scheduleAudioBufferFn = scheduleAudioBuffer,
  audioContextTimeFn = audioContextTime,
  soundsBasePath = FUNCTIONAL_SOUNDS_BASE_PATH,
}) {
  const clock = createClockScheduler({ setTimeoutFn, clearTimeoutFn, audioContextTimeFn });
  const heard = new Set();
  let playing = null; // 再生中(読み込み中を含む)のパート
  let source = null;
  let stopped = false;

  function stopSource() {
    try { source?.stop(); } catch { /* 既に終了している音源は無視する */ }
    source = null;
  }

  function fail(part, error) {
    if (stopped) return;
    stopped = true;
    clock.cancelAll();
    stopSource();
    playing = null;
    view.setPartState(part, heard.has(part) ? "played" : "idle");
    view.setPlayEnabled(false);
    view.setProceedEnabled(false);
    view.showError("load");
    onError({ kind: "load", error });
  }

  function onLoaded(part, buffer) {
    if (stopped) return;
    const startAt = audioContextTimeFn() + COLD_START_LEAD_SECONDS;
    try {
      source = scheduleAudioBufferFn(buffer, startAt).source;
    } catch (error) {
      fail(part, error);
      return;
    }
    // 最後まで再生し終えた時刻に「聴いた」と数える(音声の時計で判定)。
    clock.runAt(startAt + buffer.duration, () => {
      source = null;
      playing = null;
      heard.add(part);
      view.setPartState(part, "played");
      view.setPlayEnabled(true);
      view.setProceedEnabled(heard.size === TONE_CHECK_PARTS.length);
    });
  }

  return {
    // part: "recorder" または "piano"。再生中・中止後・未知のパートは受け付けない。
    play(part) {
      if (stopped || playing || !TONE_CHECK_PARTS.includes(part)) return;
      playing = part;
      view.setPlayEnabled(false);
      view.setPartState(part, "playing");
      const src = `${soundsBasePath}${toneCheckFilenameFor(part)}`;
      Promise.resolve()
        .then(() => resumeAudioContextFn())
        .then(() => loadAudioBufferFn(src))
        .then((buffer) => onLoaded(part, buffer), (error) => fail(part, error));
    },
    hasHeardBoth: () => heard.size === TONE_CHECK_PARTS.length,
    isPlaying: () => playing !== null,
    // 画面を離れるときに呼ぶ。鳴っている音を止め、タイマーを消す。以後の通知は起きない。
    destroy() {
      stopped = true;
      clock.cancelAll();
      stopSource();
      playing = null;
    },
  };
}
