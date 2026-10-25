// 機能的音感測定の刺激定義。
//
// 刺激の属性(和音根音度・和音品質・旋律音度)は、刺激IDの文字列を解析して取り出さず、
// それぞれ独立した項目として持つ。変化条件の分類(trial-generator.js)もこの項目を比べて決める。
// 音度表記: n1〜n7=自然な第1〜第7度(s=シャープ、b=フラットは今回の刺激では未使用)。

export const STIMULI = [
  { stimulusId: "ch-n1-maj-mel-n1", chordRootDegree: "n1", chordQuality: "maj", melodyDegree: "n1" },
  { stimulusId: "ch-n1-maj-mel-n3", chordRootDegree: "n1", chordQuality: "maj", melodyDegree: "n3" },
  { stimulusId: "ch-n1-maj-mel-n5", chordRootDegree: "n1", chordQuality: "maj", melodyDegree: "n5" },
  { stimulusId: "ch-n4-maj-mel-n4", chordRootDegree: "n4", chordQuality: "maj", melodyDegree: "n4" },
  { stimulusId: "ch-n4-maj-mel-n6", chordRootDegree: "n4", chordQuality: "maj", melodyDegree: "n6" },
  { stimulusId: "ch-n4-maj-mel-n1", chordRootDegree: "n4", chordQuality: "maj", melodyDegree: "n1" },
  { stimulusId: "ch-n5-dom7-mel-n5", chordRootDegree: "n5", chordQuality: "dom7", melodyDegree: "n5" },
  { stimulusId: "ch-n5-dom7-mel-n7", chordRootDegree: "n5", chordQuality: "dom7", melodyDegree: "n7" },
  { stimulusId: "ch-n5-dom7-mel-n2", chordRootDegree: "n5", chordQuality: "dom7", melodyDegree: "n2" },
  { stimulusId: "ch-n5-dom7-mel-n4", chordRootDegree: "n5", chordQuality: "dom7", melodyDegree: "n4" },
];

export function findStimulus(stimulusId) {
  return STIMULI.find((stimulus) => stimulus.stimulusId === stimulusId) ?? null;
}

// 本番のKey(仕様: Key C・Key Fis)と練習のKey(Key Es)。
// Keyの内部識別子は既存の相対音感と同じ(C / Es / Fis)。
export const MEASUREMENT_KEYS = ["C", "Fis"];
export const PRACTICE_KEY = "Es";

// 練習の固定3試行(仕様14章)。提示順は固定でシャッフルしない。
// changeCondition は内部用で、参加者には表示しない。
export const PRACTICE_TRIALS = [
  { practiceNumber: 1, firstStimulusId: "ch-n1-maj-mel-n1", secondStimulusId: "ch-n1-maj-mel-n3", changeCondition: "melody-change" },
  { practiceNumber: 2, firstStimulusId: "ch-n1-maj-mel-n1", secondStimulusId: "ch-n4-maj-mel-n1", changeCondition: "chord-change" },
  { practiceNumber: 3, firstStimulusId: "ch-n1-maj-mel-n3", secondStimulusId: "ch-n5-dom7-mel-n7", changeCondition: "both-change" },
];

// WAVファイル名(仕様6章): <Key>-phr-<stimulus-id>-v<audio-version>.wav
// Keyの接頭辞は小文字(既存の cadence_Es.wav 等は改名しない。新しい音源だけこの規則に従う)。
const FILENAME_PREFIX_BY_KEY = { C: "c", Es: "es", Fis: "fis" };
export const AUDIO_VERSION = "01";

// 刺激定義に存在しない刺激ID・Keyはエラーにする(文字列を組み立てて存在しないファイルを要求しないため)。
export function phraseFilenameFor(keyCode, stimulusId) {
  const prefix = FILENAME_PREFIX_BY_KEY[keyCode];
  if (!prefix) throw new Error(`未対応のKeyです: ${keyCode}`);
  if (!findStimulus(stimulusId)) throw new Error(`未定義の刺激IDです: ${stimulusId}`);
  return `${prefix}-phr-${stimulusId}-v${AUDIO_VERSION}.wav`;
}

// 音色確認用の単独パート(仕様13章)。練習Key(Es)でのみ用意する。
export const TONE_CHECK_PARTS = ["recorder", "piano"];

export function toneCheckFilenameFor(part) {
  if (!TONE_CHECK_PARTS.includes(part)) throw new Error(`未対応のパートです: ${part}`);
  return `${FILENAME_PREFIX_BY_KEY[PRACTICE_KEY]}-practice-${part}-only-v${AUDIO_VERSION}.wav`;
}
