// 音感訓練 ver.1 の刺激(何が鳴るか)と、音源ファイル名の規則。宣言的なデータだけを置く。
// 再生処理・画面処理は入れない。回答対象も正解ボタンも持たない(正解は resolve-answer-targets.js で解決する)。
//
// ver.1 の刺激は、どれも「第1音 → 第2音(主音ド)」の2イベント。
//   メロディ: m1 = 第1音、m2 = ド
//   和音    : h1 = 第1和音、h2 = Ⅰ(ch-n1-maj)
// 組み合わせ(第1音/第1和音)は、資料「アプリの仕様_20260328.pdf」ページ8のメニュー記述から決めた
// (tonal-sense-docs/training-data-design-prototype.md 第7.2節)。
// 拍(onsetBeats・durationBeats)は仮音源の暫定値(第1音2拍 → ド2拍、♩=120)。正式音源が決まったら合わせて直す。
import { DEFINITIONS_SCHEMA_VERSION } from "./definitions.js";

// 訓練で使うKey(相対音感の完全版と同じ4つ)。相対音感のコードは参照せず、訓練用に持つ。
export const TRAINING_KEY_CODES = ["C", "Es", "Fis", "A"];

// 音源ファイル名のKey接頭辞(機能的音感と同じく小文字)。
const FILENAME_PREFIX_BY_KEY = { C: "c", Es: "es", Fis: "fis", A: "a" };

// 音源の版。音源を差し替えたら上げる。
export const TRAINING_AUDIO_VERSION = "01";

// 音源の置き場所(既存の音源と混ざらないよう専用フォルダー)。
export const TRAINING_SOUNDS_BASE_PATH = "public/sounds/training/";

// 第1音と第1和音から、ver.1 の刺激を組み立てる。刺激IDは st-<第1音の音度>-<第1和音>。
function twoEventStimulus(firstDegree, firstChordRef) {
  return {
    stimulusId: `st-${firstDegree}-${firstChordRef}`,
    schemaVersion: DEFINITIONS_SCHEMA_VERSION,
    stimulusVersion: "1.0.0",
    musicalContext: { scale: "major" },
    parts: {
      melody: {
        events: [
          { eventId: "m1", type: "note", onsetBeats: 0, durationBeats: 2, degree: firstDegree },
          { eventId: "m2", type: "note", onsetBeats: 2, durationBeats: 2, degree: "n1" },
        ],
      },
      harmony: {
        events: [
          { eventId: "h1", type: "chord", onsetBeats: 0, durationBeats: 2, chordRef: firstChordRef },
          { eventId: "h2", type: "chord", onsetBeats: 2, durationBeats: 2, chordRef: "ch-n1-maj" },
        ],
      },
    },
  };
}

// ver.1 の10刺激(第1音/第1和音)。
export const TRAINING_STIMULI = [
  twoEventStimulus("n7", "ch-n5-dom7"), // シ/Ⅴ
  twoEventStimulus("n1", "ch-n1-maj"), // ド/Ⅰ
  twoEventStimulus("n2", "ch-n5-dom7"), // レ/Ⅴ
  twoEventStimulus("n6", "ch-n4-maj"), // ラ/Ⅳ
  twoEventStimulus("n3", "ch-n1-maj"), // ミ/Ⅰ
  twoEventStimulus("n5", "ch-n5-dom7"), // ソ/Ⅴ
  twoEventStimulus("n4", "ch-n5-dom7"), // ファ/Ⅴ
  twoEventStimulus("n5", "ch-n1-maj"), // ソ/Ⅰ
  twoEventStimulus("n1", "ch-n4-maj"), // ド/Ⅳ
  twoEventStimulus("n4", "ch-n4-maj"), // ファ/Ⅳ
];

export function findTrainingStimulus(stimulusId) {
  return TRAINING_STIMULI.find((stimulus) => stimulus.stimulusId === stimulusId) ?? null;
}

// kind: "q"(問題音) または "fb"(回答後のフィードバックのフレーズ)。問題音とフィードバックは、刺激ごとに必ず1組で対応する。
function audioFilenameFor(kind, keyCode, stimulusId) {
  const prefix = FILENAME_PREFIX_BY_KEY[keyCode];
  if (!prefix) throw new Error(`未対応のKeyです: ${keyCode}`);
  if (!findTrainingStimulus(stimulusId)) throw new Error(`未定義の刺激IDです: ${stimulusId}`);
  return `${prefix}-${kind}-${stimulusId}-v${TRAINING_AUDIO_VERSION}.wav`;
}

// 問題音のファイル名(例: c-q-st-n7-ch-n5-dom7-v01.wav)。
export function questionAudioFilenameFor(keyCode, stimulusId) {
  return audioFilenameFor("q", keyCode, stimulusId);
}

// フィードバックのフレーズのファイル名(例: c-fb-st-n7-ch-n5-dom7-v01.wav)。
export function feedbackAudioFilenameFor(keyCode, stimulusId) {
  return audioFilenameFor("fb", keyCode, stimulusId);
}

// 調セットアップ(出題音の前に毎問鳴らす、調を示す音源)のファイル名(例: c-setup-v01.wav)。Keyごとに1本。
export function keySetupAudioFilenameFor(keyCode) {
  const prefix = FILENAME_PREFIX_BY_KEY[keyCode];
  if (!prefix) throw new Error(`未対応のKeyです: ${keyCode}`);
  return `${prefix}-setup-v${TRAINING_AUDIO_VERSION}.wav`;
}
