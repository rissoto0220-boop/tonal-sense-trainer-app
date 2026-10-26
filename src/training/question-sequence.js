// 訓練の出題順を作る。DOM・保存・音声に依存しない純関数。
//
// 規則(研究者の決定):
//   - 出題数は既定15(DEFAULT_QUESTION_COUNT)。引数 questionCount で調整できる。
//   - 出題順はランダム。1周の中では重複しない。
//   - 候補の数が出題数より少ないときは、周回する。周ごとに全候補をシャッフルし直す
//     (例: 5種類で15問なら、5+5+5 で各候補がちょうど3回)。
//   - 出題数が候補の数の倍数でないときは、最後の端数の周は、シャッフルした先頭から必要な数だけ使う
//     (例: 7種類で15問なら 7+7+1)。
// 周の境目で同じ候補が続かないようにする、などの追加の制約は決まっていないので設けない。
import { DEFAULT_QUESTION_COUNT } from "./definitions.js";

// Fisher-Yates。元の配列は書き換えず、新しい配列を返す。
function shuffled(items, randomFn) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// pool: 出題候補の配列(何を1つの候補とするかは呼び出し側が決める)。戻り値の要素は pool の要素そのもの。
// randomFn: 0以上1未満の乱数を返す関数。テストでは固定の乱数を渡して結果を再現する。
export function generateQuestionSequence(pool, { questionCount = DEFAULT_QUESTION_COUNT, randomFn = Math.random } = {}) {
  if (!Array.isArray(pool) || pool.length === 0) throw new Error("出題候補が空です");
  if (!Number.isInteger(questionCount) || questionCount < 1) {
    throw new Error(`出題数は1以上の整数にしてください(指定: ${questionCount})`);
  }

  const sequence = [];
  while (sequence.length < questionCount) {
    const cycle = shuffled(pool, randomFn);
    sequence.push(...cycle.slice(0, questionCount - sequence.length));
  }
  return sequence;
}
