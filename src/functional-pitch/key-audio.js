// 選んだKeyの10個のフレーズ音源を、測定の開始前に読み込んで確認する(仕様15章)。DOM・保存に依存しない。
import { loadAudioBuffer } from "../shared/audio-buffer-player.js";
import { STIMULI } from "./stimuli.js";
import { FUNCTIONAL_SOUNDS_BASE_PATH, phraseSrcFor, checkPhraseDuration } from "./phrase-audio.js";

// 10刺激のWAVを並行して読み込み(デコードまで行う)、長さが 4.8秒±許容誤差に収まっているか確認する。
// 戻り値: { ok, failures }。failures の各要素は
//   { src, reason: "load", error } または { src, reason: "duration", durationSeconds }
// ビット深度・サンプリング周波数などの形式は、ブラウザ上では確認できない
// (読み込み時に内部形式へ変換されるため)。scripts/check-functional-pitch-wavs.py で確認する。
export async function loadKeyPhrases(keyCode, {
  loadAudioBufferFn = loadAudioBuffer,
  soundsBasePath = FUNCTIONAL_SOUNDS_BASE_PATH,
  stimuli = STIMULI,
} = {}) {
  const results = await Promise.all(stimuli.map(async (stimulus) => {
    const src = phraseSrcFor(keyCode, stimulus.stimulusId, soundsBasePath);
    try {
      const buffer = await loadAudioBufferFn(src);
      const { ok, durationSeconds } = checkPhraseDuration(buffer);
      return ok ? null : { src, reason: "duration", durationSeconds };
    } catch (error) {
      return { src, reason: "load", error };
    }
  }));
  const failures = results.filter(Boolean);
  return { ok: failures.length === 0, failures };
}
