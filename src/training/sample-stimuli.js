// 音感訓練の「将来の問題拡張」のサンプル刺激。宣言的なデータだけを置く。
// ver.1 の刺激(stimuli.js の TRAINING_STIMULI)とは分けて持つ。研究本番の出題には使わない。
//
// 2種類:
//   短調   : 第1音 → ラ(主音)、第1和音 → Ⅵm(主和音)。和音は和声的短音階の Ⅱm・Ⅲ7・Ⅵm。
//            ver.1 と同じ2イベント・各2拍。musicalContext.scale は "minor"。
//   進行   : 六和音(Ⅰ〜Ⅵ)から2つ → Ⅰ の3イベント(1拍 + 1拍 + 2拍、計4拍で ver.1 と同じ長さ)。
//            メロディは各和音の構成音で、最後はド。
// 階名は ver.1 と同じ「ドを長調の主音とする読み方」(短調の主音はラ)。音源ファイル名の規則も ver.1 と同じ。
import { DEFINITIONS_SCHEMA_VERSION } from "./definitions.js";

const note = (eventId, onsetBeats, durationBeats, degree) => ({ eventId, type: "note", onsetBeats, durationBeats, degree });
const chord = (eventId, onsetBeats, durationBeats, chordRef) => ({ eventId, type: "chord", onsetBeats, durationBeats, chordRef });

// 短調: 刺激IDは st-min-<第1音の音度>-<第1和音>。
function minorStimulus(firstDegree, firstChordRef) {
  return {
    stimulusId: `st-min-${firstDegree}-${firstChordRef}`,
    schemaVersion: DEFINITIONS_SCHEMA_VERSION,
    stimulusVersion: "0.1.0",
    musicalContext: { scale: "minor" },
    parts: {
      melody: { events: [note("m1", 0, 2, firstDegree), note("m2", 2, 2, "n6")] },
      harmony: { events: [chord("h1", 0, 2, firstChordRef), chord("h2", 2, 2, "ch-n6-min")] },
    },
  };
}

// 進行: 刺激IDは st-prog-<第1和音の根音>-<第2和音の根音>。
function progressionStimulus([degree1, chordRef1], [degree2, chordRef2]) {
  const root = (chordRef) => chordRef.split("-")[1];
  return {
    stimulusId: `st-prog-${root(chordRef1)}-${root(chordRef2)}`,
    schemaVersion: DEFINITIONS_SCHEMA_VERSION,
    stimulusVersion: "0.1.0",
    musicalContext: { scale: "major" },
    parts: {
      melody: { events: [note("m1", 0, 1, degree1), note("m2", 1, 1, degree2), note("m3", 2, 2, "n1")] },
      harmony: { events: [chord("h1", 0, 1, chordRef1), chord("h2", 1, 1, chordRef2), chord("h3", 2, 2, "ch-n1-maj")] },
    },
  };
}

export const MINOR_SAMPLE_STIMULI = [
  minorStimulus("n3", "ch-n3-dom7"), // ミ/Ⅲ7
  minorStimulus("n7", "ch-n3-dom7"), // シ/Ⅲ7
  minorStimulus("n1", "ch-n6-min"), // ド/Ⅵm
  minorStimulus("n6", "ch-n6-min"), // ラ/Ⅵm
  minorStimulus("n2", "ch-n2-min"), // レ/Ⅱm
  minorStimulus("n4", "ch-n2-min"), // ファ/Ⅱm
];

export const PROGRESSION_SAMPLE_STIMULI = [
  progressionStimulus(["n2", "ch-n2-min"], ["n7", "ch-n5-dom7"]), // Ⅱm→Ⅴ7→Ⅰ(レ→シ→ド)
  progressionStimulus(["n4", "ch-n4-maj"], ["n2", "ch-n5-dom7"]), // Ⅳ→Ⅴ7→Ⅰ(ファ→レ→ド)
  progressionStimulus(["n3", "ch-n6-min"], ["n4", "ch-n4-maj"]), // Ⅵm→Ⅳ→Ⅰ(ミ→ファ→ド)
  progressionStimulus(["n7", "ch-n3-min"], ["n6", "ch-n6-min"]), // Ⅲm→Ⅵm→Ⅰ(シ→ラ→ド)
  progressionStimulus(["n5", "ch-n1-maj"], ["n6", "ch-n4-maj"]), // Ⅰ→Ⅳ→Ⅰ(ソ→ラ→ド)
  progressionStimulus(["n3", "ch-n6-min"], ["n2", "ch-n2-min"]), // Ⅵm→Ⅱm→Ⅰ(ミ→レ→ド)
];

export const SAMPLE_STIMULI = [...MINOR_SAMPLE_STIMULI, ...PROGRESSION_SAMPLE_STIMULI];
