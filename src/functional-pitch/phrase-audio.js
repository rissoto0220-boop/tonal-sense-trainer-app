// 機能的音感測定のフレーズ音源に関する定数と補助関数(仕様7章)。DOM・保存・サーバーに依存しない。
import { phraseFilenameFor } from "./stimuli.js";

// 各WAVは前余白0.8秒+4拍(0.8秒×4)+後余白0.8秒=4.8秒(BPM 75、4/4拍子)。
export const PHRASE_DURATION_SECONDS = 4.8;
// デコード後の長さがこの範囲を外れたら、音源の不備としてエラーにする。
export const PHRASE_DURATION_TOLERANCE_SECONDS = 0.05;
// 第1フレーズの終了から第2フレーズの開始までの間隔(仕様8章)。
export const PHRASE_GAP_SECONDS = 1.0;

// 既存の音源(public/sounds/)と混ざらないよう、専用のフォルダーに置く。
export const FUNCTIONAL_SOUNDS_BASE_PATH = "public/sounds/functional-pitch/";

export function phraseSrcFor(keyCode, stimulusId, basePath = FUNCTIONAL_SOUNDS_BASE_PATH) {
  return `${basePath}${phraseFilenameFor(keyCode, stimulusId)}`;
}

// デコード済みのAudioBuffer(duration を持つもの)の長さが、4.8秒±許容誤差に収まっているか。
export function checkPhraseDuration(buffer) {
  const durationSeconds = buffer.duration;
  const ok = Math.abs(durationSeconds - PHRASE_DURATION_SECONDS) <= PHRASE_DURATION_TOLERANCE_SECONDS + 1e-9;
  return { ok, durationSeconds };
}
