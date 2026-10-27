// 音感訓練 ver.1 の訓練メニュー(16個)。宣言的なデータだけを置く。
//
// ①〜⑧: 資料「アプリの仕様_20260328.pdf」ページ8の8段階。Key C 固定。
// ⑨〜⑯: ①〜⑧と同じ刺激構成で、Key をランダム(C/Es/Fis/A)にしたもの(研究者の決定、2026-10-27)。
// 同じ刺激の集合を、単音回答 → 和音回答の順に使う(資料の方針)。
//
// activeOptionCodes: 回答画面で押せる音(資料の「出現する音」)。それ以外の鍵盤は押せない。
import { DEFAULT_QUESTION_COUNT } from "./definitions.js";
import { TRAINING_KEY_CODES } from "./stimuli.js";

const SI_DO_RE = ["st-n7-ch-n5-dom7", "st-n1-ch-n1-maj", "st-n2-ch-n5-dom7"];
const LA_TO_MI = ["st-n6-ch-n4-maj", ...SI_DO_RE, "st-n3-ch-n1-maj"];
const SO_TO_FA = ["st-n5-ch-n5-dom7", ...LA_TO_MI, "st-n4-ch-n5-dom7"];
const ALL_TEN = [...SO_TO_FA, "st-n5-ch-n1-maj", "st-n1-ch-n4-maj", "st-n4-ch-n4-maj"];

const MELODY_SO_TO_FA = ["n5", "n6", "n7", "n1", "n2", "n3", "n4"];
const CHORDS_I_IV_V = ["n1", "n4", "n5"];

const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯"];

// 8段階(資料ページ8)。Keyの設定以外の部分。
const STAGES = [
  { title: "単音 シドレの判別", taskTemplateRef: "tt-melody-first", stimulusIds: SI_DO_RE, activeOptionCodes: ["n7", "n1", "n2"] },
  { title: "和音 ⅠⅤの判別", taskTemplateRef: "tt-chord-first", stimulusIds: SI_DO_RE, activeOptionCodes: ["n1", "n5"] },
  { title: "単音 ラシドレミの判別", taskTemplateRef: "tt-melody-first", stimulusIds: LA_TO_MI, activeOptionCodes: ["n6", "n7", "n1", "n2", "n3"] },
  { title: "和音 ⅠⅣⅤの判別", taskTemplateRef: "tt-chord-first", stimulusIds: LA_TO_MI, activeOptionCodes: CHORDS_I_IV_V },
  { title: "単音 ソラシドレミファの判別", taskTemplateRef: "tt-melody-first", stimulusIds: SO_TO_FA, activeOptionCodes: MELODY_SO_TO_FA },
  { title: "和音 ⅠⅣⅤの判別", taskTemplateRef: "tt-chord-first", stimulusIds: SO_TO_FA, activeOptionCodes: CHORDS_I_IV_V },
  // ⑦⑧は⑤⑥と名前が同じ(資料どおり)。違いは刺激: ソ(Ⅰ)、ド(Ⅳ)、ファ(Ⅳ)の組み合わせが加わる。
  { title: "単音 ソラシドレミファの判別", taskTemplateRef: "tt-melody-first", stimulusIds: ALL_TEN, activeOptionCodes: MELODY_SO_TO_FA },
  { title: "和音 ⅠⅣⅤの判別", taskTemplateRef: "tt-chord-first", stimulusIds: ALL_TEN, activeOptionCodes: CHORDS_I_IV_V },
];

const KEY_POLICIES = [
  { mode: "fixed", keyCode: "C", label: "Key C" },
  { mode: "random", keyCodes: TRAINING_KEY_CODES, label: "Key ランダム" },
];

// ⑨〜⑯は①〜⑧から機械的に作る(刺激構成を二重に書かない)。
export const TRAINING_MENUS = KEY_POLICIES.flatMap(({ label, ...keyPolicy }, policyIndex) =>
  STAGES.map((stage, stageIndex) => {
    const number = policyIndex * STAGES.length + stageIndex + 1;
    return {
      menuId: `menu-${String(number).padStart(2, "0")}`,
      number,
      name: `${CIRCLED_NUMBERS[number - 1]} ${stage.title}(${label})`,
      taskTemplateRef: stage.taskTemplateRef,
      stimulusIds: stage.stimulusIds,
      activeOptionCodes: stage.activeOptionCodes,
      generation: { questionCount: DEFAULT_QUESTION_COUNT },
      keyPolicy,
    };
  }),
);

export function findTrainingMenu(menuId) {
  return TRAINING_MENUS.find((menu) => menu.menuId === menuId) ?? null;
}
