// 音感訓練の定義データ(和音・回答候補・課題テンプレート)。宣言的なデータだけを置く。
// 再生処理・画面処理・保存はここに入れない(刺激定義にも混ぜない)。
// 設計の説明: tonal-sense-docs/training-data-design-prototype.md(第2章・第7章)。
//
// 責務の分離:
//   刺激(stimulus)      何が鳴るか。メロディと和音を別パートで持つ。回答対象も正解ボタンも持たない。
//   和音(CHORDS)        和音の種類。配置(ボイシング)は含めない。
//   回答候補(OPTION_SETS) 回答画面の選択肢。内部コード(code)と画面表示(label)を分ける。
//   課題テンプレート    刺激のどのイベントを、何として答えさせるか。partId と eventId で指す。
// 正解は刺激から解決する(resolve-answer-targets.js)。刺激・課題には正解を書かない。

// 定義データの版。保存データの schemaVersion(src/relative-pitch/session-store.js など)とは別物。
export const DEFINITIONS_SCHEMA_VERSION = 1;

// 1回の訓練の出題数の既定値(研究者の決定: 一旦15で固定、調整可能にする)。
// generateQuestionSequence の引数 questionCount で上書きできる。
export const DEFAULT_QUESTION_COUNT = 15;

// 回答の種類(answerFeature)の許容値。将来JSON Schemaを導入するときの列挙値になる。
//   degree          メロディのイベントの音度(例: n3)
//   chordRootDegree 和音のイベントの根音の音度(例: n1 = Ⅰ)
export const ANSWER_FEATURES = ["degree", "chordRootDegree"];

// 音度コード。n=自然音、s=シャープ、b=フラット。数字は第何度か。
export const DEGREE_CODES = ["n", "s", "b"].flatMap((prefix) => [1, 2, 3, 4, 5, 6, 7].map((number) => `${prefix}${number}`));

// 和音の品質コード(機能的音感テストに合わせる)。
export const CHORD_QUALITIES = ["maj", "dom7"];

/**
 * @typedef {Object} StimulusEvent 刺激の1イベント(メロディの1音、または和音1つ)
 * @property {string} eventId       パート内で一意。メロディは m1, m2…、和音は h1, h2…
 * @property {string} type          "note"(メロディ) または "chord"(和音)
 * @property {number} onsetBeats    開始位置(拍)
 * @property {number} durationBeats 長さ(拍)
 * @property {string} [degree]      メロディのみ。音度コード(例: "n3")
 * @property {string} [chordRef]    和音のみ。CHORDS のキー(例: "ch-n1-maj")
 * @property {string} [voicingRef]  和音のみ。配置の記録用(今回は未使用)
 */

/**
 * @typedef {Object} Stimulus 刺激。メロディと和音は別パートで、イベント数・リズムが違ってよい。
 * @property {string} stimulusId
 * @property {number} schemaVersion
 * @property {{ melody: { events: StimulusEvent[] }, harmony: { events: StimulusEvent[] } }} parts
 */

/**
 * @typedef {Object} AnswerTarget 回答対象。partId と eventId の組で刺激のイベントを指す。
 * @property {string} targetId      課題内で一意
 * @property {string} partId        "melody" または "harmony"
 * @property {string} eventId       刺激のイベントID
 * @property {string} answerFeature ANSWER_FEATURES のいずれか
 * @property {number} sequenceOrder 回答する順番(1始まり)
 * @property {string} optionSetRef  OPTION_SETS のキー
 */

/**
 * @typedef {Object} TaskTemplate 課題テンプレート。回答対象が1件でも answerTargets は配列。
 * @property {string} taskTemplateId
 * @property {number} schemaVersion
 * @property {AnswerTarget[]} answerTargets
 */

/**
 * @typedef {Object} OptionSet 回答候補。配列の順序は、回答画面の並び(資料の鍵盤の並び)。
 * @property {string} answerFeature
 * @property {{ code: string, label: string }[]} options
 */

/**
 * @typedef {Object} ResolvedAnswerTarget 解決された回答対象(正解コード入り)
 * @property {string} targetId
 * @property {string} partId
 * @property {string} eventId
 * @property {string} answerFeature
 * @property {number} sequenceOrder
 * @property {string} optionSetRef
 * @property {string} correctAnswerCode
 */

// 和音の種類。ver.1のメニューで使う3つ(Ⅰ・Ⅳ・Ⅴ7)。品質コードは機能的音感テストと同じ。
export const CHORDS = {
  "ch-n1-maj": { rootDegree: "n1", quality: "maj" },
  "ch-n4-maj": { rootDegree: "n4", quality: "maj" },
  "ch-n5-dom7": { rootDegree: "n5", quality: "dom7" },
};

// 回答候補。code は正解判定に使う内部コード、label は画面に出す表示。
export const OPTION_SETS = {
  // 単音の階名鍵盤(資料ページ3の並び: ソ ラ シ ド レ ミ ファ)
  "melody-keyboard": {
    answerFeature: "degree",
    options: [
      { code: "n5", label: "ソ" },
      { code: "n6", label: "ラ" },
      { code: "n7", label: "シ" },
      { code: "n1", label: "ド" },
      { code: "n2", label: "レ" },
      { code: "n3", label: "ミ" },
      { code: "n4", label: "ファ" },
    ],
  },
  // 和音の鍵盤(資料ページ4の並び: 3→6→2→5→1→4)。和音は根音の度数で答える。
  "chord-root-degrees": {
    answerFeature: "chordRootDegree",
    options: [
      { code: "n3", label: "Ⅲ" },
      { code: "n6", label: "Ⅵ" },
      { code: "n2", label: "Ⅱ" },
      { code: "n5", label: "Ⅴ" },
      { code: "n1", label: "Ⅰ" },
      { code: "n4", label: "Ⅳ" },
    ],
  },
};

// 課題テンプレート。ver.1は第1音(第1和音)だけを答える。
export const TASK_TEMPLATES = {
  "tt-melody-first": {
    taskTemplateId: "tt-melody-first",
    schemaVersion: DEFINITIONS_SCHEMA_VERSION,
    answerTargets: [
      { targetId: "t1", partId: "melody", eventId: "m1", answerFeature: "degree", sequenceOrder: 1, optionSetRef: "melody-keyboard" },
    ],
  },
  "tt-chord-first": {
    taskTemplateId: "tt-chord-first",
    schemaVersion: DEFINITIONS_SCHEMA_VERSION,
    answerTargets: [
      { targetId: "t1", partId: "harmony", eventId: "h1", answerFeature: "chordRootDegree", sequenceOrder: 1, optionSetRef: "chord-root-degrees" },
    ],
  },
};
