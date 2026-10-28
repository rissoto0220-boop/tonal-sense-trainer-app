// 訓練メニューから、実際に出題する問題の列を作る。DOM・保存・音声に依存しない純関数。
//
// Keyは1回の訓練(セッション)で1つ(研究者の決定、training_pending_to_decisions.md 第12節)。
// Key固定のメニューはそのKey、Keyランダムのメニューは訓練の開始時に4Keyから1つ抽選し、全問・リプレイ・
// フィードバックで同じKeyを使う。出題候補は「刺激×そのKey」で、generateQuestionSequence で周回ランダムに並べる。
import { TASK_TEMPLATES } from "./definitions.js";
import { findTrainingStimulus } from "./stimuli.js";
import { generateQuestionSequence } from "./question-sequence.js";
import { resolveAnswerTargets } from "./resolve-answer-targets.js";

// 保存する keyAssignmentMethod の値。
export const KEY_ASSIGNMENT_METHODS = { fixed: "fixed", random: "randomAtSessionStart" };

function keyCodesFor(keyPolicy) {
  if (keyPolicy.mode === "fixed") return [keyPolicy.keyCode];
  if (keyPolicy.mode === "random") return keyPolicy.keyCodes;
  throw new Error(`未対応のKeyの設定です: ${keyPolicy.mode}`);
}

// 訓練の開始時に1回だけ呼ぶ。戻り値: { sessionKeyCode, keyAssignmentMethod }
export function drawSessionKey(menu, randomFn = Math.random) {
  const keyCodes = keyCodesFor(menu.keyPolicy);
  const sessionKeyCode = keyCodes[Math.min(keyCodes.length - 1, Math.floor(randomFn() * keyCodes.length))];
  return { sessionKeyCode, keyAssignmentMethod: KEY_ASSIGNMENT_METHODS[menu.keyPolicy.mode] };
}

// 戻り値: [{ stimulusId, keyCode }](刺激の順。Keyはすべて keyCode)。
export function buildQuestionPool(menu, keyCode) {
  if (!keyCodesFor(menu.keyPolicy).includes(keyCode)) throw new Error(`メニュー ${menu.menuId} では Key ${keyCode} を使えません`);
  return menu.stimulusIds.map((stimulusId) => ({ stimulusId, keyCode }));
}

// 戻り値: 出題数ぶんの問題。各問は
//   { questionNumber, menuId, stimulusId, keyCode, taskTemplateId, resolvedAnswerTargets }
// keyCode を省くと drawSessionKey で決める。正解(resolvedAnswerTargets)は、刺激と課題テンプレートから解決する。
// 問題のID(QID・questionId)は作らない(研究者の決定、第14節)。試行は「訓練のID + 問題の番号」で区別する。
export function buildQuestions(menu, {
  randomFn = Math.random,
  questionCount = menu.generation.questionCount,
  keyCode = drawSessionKey(menu, randomFn).sessionKeyCode,
} = {}) {
  const taskTemplate = TASK_TEMPLATES[menu.taskTemplateRef];
  if (!taskTemplate) throw new Error(`メニュー ${menu.menuId} の課題テンプレート「${menu.taskTemplateRef}」が辞書にありません`);

  const sequence = generateQuestionSequence(buildQuestionPool(menu, keyCode), { questionCount, randomFn });
  return sequence.map(({ stimulusId }, index) => {
    const stimulus = findTrainingStimulus(stimulusId);
    if (!stimulus) throw new Error(`メニュー ${menu.menuId} の刺激「${stimulusId}」が定義されていません`);
    return {
      questionNumber: index + 1,
      menuId: menu.menuId,
      stimulusId,
      keyCode,
      taskTemplateId: taskTemplate.taskTemplateId,
      resolvedAnswerTargets: resolveAnswerTargets(stimulus, taskTemplate),
    };
  });
}
