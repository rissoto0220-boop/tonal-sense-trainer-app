// 機能的音感測定の練習(仕様14章)の進行。DOM・保存に依存しない。
//
// 練習は Key Es の固定3試行で、提示順はランダム化しない。正解・不正解はない(主観評定)。
// 回答はメモリ上の practice_results として保持するだけで、保存・送信はしない。
import { PRACTICE_TRIALS, PRACTICE_KEY } from "./stimuli.js";

const RESPONSE_KEYS = [
  "melody_change_rating",
  "harmony_change_rating",
  "overall_change_rating",
  "response_enabled_at",
  "response_confirmed_at",
  "response_time_ms",
];

export function createPracticeSession({ trials = PRACTICE_TRIALS, keyCode = PRACTICE_KEY } = {}) {
  let round = 1; // practice_round(1始まり。「練習をもう一度」で増える)
  let index = 0;
  const results = [];

  const isFinished = () => index >= trials.length;

  return {
    round: () => round,
    totalTrials: () => trials.length,
    isFinished,
    // 画面の試行(trial-controller)へ渡す形。条件名は含めない(参加者に表示しない)。
    currentTrial() {
      if (isFinished()) return null;
      const { firstStimulusId, secondStimulusId } = trials[index];
      return { keyCode, firstStimulusId, secondStimulusId };
    },
    progressLabel: () => `練習 ${Math.min(index + 1, trials.length)} / ${trials.length}`,
    // 確定値(trial-controller の onConfirmed に渡るもの)を現在の試行の結果として記録する。
    record(confirmed) {
      if (isFinished()) return false;
      const trial = trials[index];
      results.push({
        practice_round: round,
        practice_number: trial.practiceNumber,
        first_stimulus_id: trial.firstStimulusId,
        second_stimulus_id: trial.secondStimulusId,
        change_condition: trial.changeCondition,
        ...Object.fromEntries(RESPONSE_KEYS.map((key) => [key, confirmed[key]])),
      });
      index += 1;
      return true;
    },
    // 練習をもう一度行う。3試行を終えているときだけ。practice_round を増やして練習1に戻る(前回の結果は残る)。
    restart() {
      if (!isFinished()) return false;
      round += 1;
      index = 0;
      return true;
    },
    results: () => results.map((result) => ({ ...result })),
  };
}
