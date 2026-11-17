// 音感訓練の「将来の問題拡張」のサンプルメニュー(4個)。宣言的なデータだけを置く。
// ver.1 の訓練メニュー(menus.js の TRAINING_MENUS)には入れない。?training=dev&samples=on のときだけ並べ、
// 結果は保存しない(複数回答の保存形式・CSVの形が未決定のため、研究データに混ぜない)。
//
// ver.1 のメニューとの違い:
//   sample: true     サンプルの印(画面で別のグループに並べ、保存しない)。
//   tonicCode        主音の音度。回答画面の上部の表示「? → ラ」と、背の高い鍵盤・六角形の頂点に使う。
//                    ver.1 のメニューは持たない(既定 n1 = ド/Ⅰ)。
import { MINOR_SAMPLE_STIMULI, PROGRESSION_SAMPLE_STIMULI } from "./sample-stimuli.js";

const ids = (stimuli) => stimuli.map((stimulus) => stimulus.stimulusId);
const KEY_C = { mode: "fixed", keyCode: "C" };

const STAGES = [
  {
    title: "短調 単音(主音ラ)",
    taskTemplateRef: "tt-melody-first",
    stimuli: MINOR_SAMPLE_STIMULI,
    activeOptionCodes: ["n6", "n7", "n1", "n2", "n3", "n4"],
    tonicCode: "n6",
  },
  {
    title: "短調 和音 ⅡⅢⅥ",
    taskTemplateRef: "tt-chord-first",
    stimuli: MINOR_SAMPLE_STIMULI,
    activeOptionCodes: ["n2", "n3", "n6"],
    tonicCode: "n6",
  },
  {
    title: "六和音の進行 単音を2つ",
    taskTemplateRef: "tt-melody-first-two",
    stimuli: PROGRESSION_SAMPLE_STIMULI,
    activeOptionCodes: ["n5", "n6", "n7", "n2", "n3", "n4"],
    tonicCode: "n1",
  },
  {
    title: "六和音の進行 和音を2つ",
    taskTemplateRef: "tt-chord-first-two",
    stimuli: PROGRESSION_SAMPLE_STIMULI,
    activeOptionCodes: ["n1", "n2", "n3", "n4", "n5", "n6"],
    tonicCode: "n1",
  },
];

export const SAMPLE_MENUS = STAGES.map((stage, index) => ({
  menuId: `sample-${String(index + 1).padStart(2, "0")}`,
  number: index + 1,
  name: `S${index + 1} ${stage.title}(Key C)`,
  taskTemplateRef: stage.taskTemplateRef,
  stimulusIds: ids(stage.stimuli),
  activeOptionCodes: stage.activeOptionCodes,
  tonicCode: stage.tonicCode,
  generation: { questionCount: stage.stimuli.length },
  keyPolicy: KEY_C,
  sample: true,
}));
