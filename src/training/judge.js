// 回答の正誤判定と得点の集計。DOM・保存・音声に依存しない純関数。
// 判定は表示ラベルではなく内部コードで行う(相対音感の isCorrectAnswer と同じ作法)。
import { OPTION_SETS } from "./definitions.js";

// 「わからない」を押したときの回答コード。不正解として扱う(研究者の決定)。回答候補(鍵盤)には含めない。
export const GIVE_UP_RESPONSE_CODE = "giveup";

// resolvedAnswerTargets: resolveAnswerTargets の戻り値。
// responseCodesByTargetId: { [targetId]: 回答コード }(回答候補のコード、または "giveup")。
// 戻り値: { responses: [{ targetId, responseCode, correctAnswerCode, outcome }],
//           scoring: { targetCount, correctTargetCount, accuracy, allCorrect } }
export function judgeResponses(resolvedAnswerTargets, responseCodesByTargetId, { optionSets = OPTION_SETS } = {}) {
  const responses = resolvedAnswerTargets.map((target) => {
    const responseCode = responseCodesByTargetId[target.targetId];
    if (responseCode === undefined) throw new Error(`回答対象 ${target.targetId} の回答がありません`);
    const isOption = optionSets[target.optionSetRef]?.options.some((option) => option.code === responseCode);
    if (!isOption && responseCode !== GIVE_UP_RESPONSE_CODE) {
      throw new Error(`回答対象 ${target.targetId} の回答コード「${responseCode}」は回答候補にありません`);
    }
    return {
      targetId: target.targetId,
      responseCode,
      correctAnswerCode: target.correctAnswerCode,
      outcome: responseCode === target.correctAnswerCode ? "correct" : "incorrect",
    };
  });

  const correctTargetCount = responses.filter((response) => response.outcome === "correct").length;
  return {
    responses,
    scoring: {
      targetCount: responses.length,
      correctTargetCount,
      accuracy: responses.length === 0 ? 0 : correctTargetCount / responses.length,
      allCorrect: responses.length > 0 && correctTargetCount === responses.length,
    },
  };
}
