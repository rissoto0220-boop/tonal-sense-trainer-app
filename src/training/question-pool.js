// 訓練メニューから、実際に出題する問題の列を作る。DOM・保存・音声に依存しない純関数。
//
// 出題候補は「刺激×Key」。Key固定のメニューは「刺激×そのKey」、Keyランダムのメニューは「刺激×4Key」
// (各Keyが同じ回数ずつ出やすくなる)。候補を generateQuestionSequence で周回ランダムに並べる。
import { TASK_TEMPLATES } from "./definitions.js";
import { findTrainingStimulus } from "./stimuli.js";
import { generateQuestionSequence } from "./question-sequence.js";
import { resolveAnswerTargets } from "./resolve-answer-targets.js";

function keyCodesFor(keyPolicy) {
  if (keyPolicy.mode === "fixed") return [keyPolicy.keyCode];
  if (keyPolicy.mode === "random") return keyPolicy.keyCodes;
  throw new Error(`未対応のKeyの設定です: ${keyPolicy.mode}`);
}

// 戻り値: [{ stimulusId, keyCode }](刺激の順 × Keyの順)。
export function buildQuestionPool(menu) {
  const keyCodes = keyCodesFor(menu.keyPolicy);
  return menu.stimulusIds.flatMap((stimulusId) => keyCodes.map((keyCode) => ({ stimulusId, keyCode })));
}

// 戻り値: 出題数ぶんの問題。各問は
//   { questionNumber, questionId, menuId, stimulusId, keyCode, taskTemplateId, resolvedAnswerTargets }
// 正解(resolvedAnswerTargets)は、刺激と課題テンプレートから解決する。
export function buildQuestions(menu, { randomFn = Math.random, questionCount = menu.generation.questionCount } = {}) {
  const taskTemplate = TASK_TEMPLATES[menu.taskTemplateRef];
  if (!taskTemplate) throw new Error(`メニュー ${menu.menuId} の課題テンプレート「${menu.taskTemplateRef}」が辞書にありません`);

  const sequence = generateQuestionSequence(buildQuestionPool(menu), { questionCount, randomFn });
  return sequence.map(({ stimulusId, keyCode }, index) => {
    const stimulus = findTrainingStimulus(stimulusId);
    if (!stimulus) throw new Error(`メニュー ${menu.menuId} の刺激「${stimulusId}」が定義されていません`);
    const questionNumber = index + 1;
    return {
      questionNumber,
      questionId: `${menu.menuId}-q${String(questionNumber).padStart(2, "0")}`,
      menuId: menu.menuId,
      stimulusId,
      keyCode,
      taskTemplateId: taskTemplate.taskTemplateId,
      resolvedAnswerTargets: resolveAnswerTargets(stimulus, taskTemplate),
    };
  });
}
