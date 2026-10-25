// 機能的音感測定の90試行の生成(仕様16・17章)。DOM・保存・サーバーに依存しない。
//
// 乱数関数は外から渡せる(既存の相対音感と同じ考え方)。固定の乱数を渡せば同じ順序を再現できる。
import { STIMULI } from "./stimuli.js";

// 順序付きペアをすべて作る(自己ペアを除く)。A→BとB→Aは別の試行。10刺激なら 10×9=90。
export function generateOrderedPairs(stimuli = STIMULI) {
  const pairs = [];
  for (const first of stimuli) {
    for (const second of stimuli) {
      if (first.stimulusId === second.stimulusId) continue;
      pairs.push({ firstStimulusId: first.stimulusId, secondStimulusId: second.stimulusId });
    }
  }
  return pairs;
}

// 変化条件の分類(仕様17章)。刺激IDの文字列ではなく、独立した属性項目を比べて決める。
//   melody-change: 旋律音度が異なり、和音は同じ
//   chord-change : 旋律音度が同じで、和音が異なる
//   both-change  : 旋律音度も和音も異なる
// 和音が同じ=和音根音度と和音品質がともに同じ。
export function classifyChange(first, second) {
  const sameChord = first.chordRootDegree === second.chordRootDegree
    && first.chordQuality === second.chordQuality;
  const sameMelody = first.melodyDegree === second.melodyDegree;
  if (sameChord && sameMelody) throw new Error("旋律も和音も同じ2刺激は、変化条件に分類できません");
  if (sameChord) return "melody-change";
  if (sameMelody) return "chord-change";
  return "both-change";
}

// フィッシャー・イェーツ法による完全シャッフル。元の配列は変更しない。
function shuffle(array, randomFn) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 90試行を完全シャッフルして返す。変化条件・同じ刺激・逆順ペアの連続制限は設けない(仕様16章)。
// 各試行: { trialNumber(1始まり), firstStimulusId, secondStimulusId, changeCondition }
export function generateTrialOrder(randomFn = Math.random, stimuli = STIMULI) {
  const byId = new Map(stimuli.map((stimulus) => [stimulus.stimulusId, stimulus]));
  return shuffle(generateOrderedPairs(stimuli), randomFn).map((pair, index) => ({
    trialNumber: index + 1,
    firstStimulusId: pair.firstStimulusId,
    secondStimulusId: pair.secondStimulusId,
    changeCondition: classifyChange(byId.get(pair.firstStimulusId), byId.get(pair.secondStimulusId)),
  }));
}

// 生成した試行列の自動検査(仕様16章)。{ valid, errors } を返す。
export function validateTrialOrder(trials, stimuli = STIMULI) {
  const errors = [];
  const expectedCount = stimuli.length * (stimuli.length - 1);
  if (trials.length !== expectedCount) errors.push(`試行数が${expectedCount}ではありません: ${trials.length}`);

  if (trials.some((t) => t.firstStimulusId === t.secondStimulusId)) errors.push("自己ペアが含まれています");

  const pairKeys = trials.map((t) => `${t.firstStimulusId}>${t.secondStimulusId}`);
  const uniquePairKeys = new Set(pairKeys);
  if (uniquePairKeys.size !== pairKeys.length) errors.push("ペアが重複しています");

  const missing = generateOrderedPairs(stimuli)
    .filter((p) => !uniquePairKeys.has(`${p.firstStimulusId}>${p.secondStimulusId}`));
  if (missing.length > 0) errors.push(`含まれていないペアがあります: ${missing.length}件`);

  const expectedEach = stimuli.length - 1;
  for (const stimulus of stimuli) {
    const asFirst = trials.filter((t) => t.firstStimulusId === stimulus.stimulusId).length;
    const asSecond = trials.filter((t) => t.secondStimulusId === stimulus.stimulusId).length;
    if (asFirst !== expectedEach) errors.push(`${stimulus.stimulusId}の第1刺激回数が${expectedEach}回ではありません: ${asFirst}`);
    if (asSecond !== expectedEach) errors.push(`${stimulus.stimulusId}の第2刺激回数が${expectedEach}回ではありません: ${asSecond}`);
  }

  return { valid: errors.length === 0, errors };
}
