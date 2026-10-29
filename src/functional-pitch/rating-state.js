// 機能的音感測定の評定(3項目×7段階)の状態管理(仕様9・11章)。DOMに依存しない。
//
// 評定は主観評定で、正解・不正解はない。選択値は「次の問題へ」を押す(確定する)まで変更できる。

export const RATING_MIN = 1;
export const RATING_MAX = 7;

// 表示順は旋律・和音・全体で固定(仕様9章)。質問文は仕様の文言をそのまま使う。
export const RATING_ITEMS = [
  {
    key: "melody",
    outputKey: "melody_change_rating",
    question: "フレーズ1とフレーズ2では、リコーダー音の印象が変化したように感じた。",
  },
  {
    key: "harmony",
    outputKey: "harmony_change_rating",
    question: "フレーズ1とフレーズ2では、ピアノ音の印象が変化したように感じた。",
  },
  {
    key: "overall",
    outputKey: "overall_change_rating",
    question: "フレーズ1とフレーズ2では、フレーズ全体の印象が変化したように感じた。",
  },
];

// 7段階の両端のラベル。中央(4)には追加ラベルを付けない。
export const RATING_LOW_LABEL = "全くそう思わない";
export const RATING_HIGH_LABEL = "とてもそう思う";

export function isValidRating(value) {
  return Number.isInteger(value) && value >= RATING_MIN && value <= RATING_MAX;
}

export function createRatingState() {
  const values = Object.fromEntries(RATING_ITEMS.map((item) => [item.key, null]));
  let answerable = false;
  let confirmed = false;

  const allSelected = () => RATING_ITEMS.every((item) => values[item.key] !== null);
  const canProceed = () => answerable && !confirmed && allSelected();

  return {
    setAnswerable(value) { answerable = value; },
    // 選択を受け付けたらtrue。回答可能前・確定後・未知の項目・範囲外の値は受け付けない。
    select(itemKey, value) {
      if (!answerable || confirmed) return false;
      if (!(itemKey in values) || !isValidRating(value)) return false;
      values[itemKey] = value;
      return true;
    },
    getValue: (itemKey) => values[itemKey],
    allSelected,
    canProceed,
    isConfirmed: () => confirmed,
    // 確定する。進めない状態ならnull。確定後は選択値を変更できず、2回目以降もnullを返す。
    confirm() {
      if (!canProceed()) return null;
      confirmed = true;
      return Object.fromEntries(RATING_ITEMS.map((item) => [item.outputKey, values[item.key]]));
    },
  };
}
