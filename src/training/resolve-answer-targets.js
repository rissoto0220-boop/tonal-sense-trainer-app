// 課題テンプレートの回答対象から、刺激を参照して正解コードを決める。
// DOM・保存・音声に依存しない純関数。刺激も課題テンプレートも書き換えない。
// 回答対象は partId と eventId の組で指す(eventIndex は使わない)。
import { ANSWER_FEATURES, CHORDS, OPTION_SETS } from "./definitions.js";

function findEvent(stimulus, partId, eventId) {
  const part = stimulus.parts?.[partId];
  if (!part) throw new Error(`刺激 ${stimulus.stimulusId} にパート「${partId}」がありません`);
  const matches = part.events.filter((event) => event.eventId === eventId);
  if (matches.length === 0) throw new Error(`刺激 ${stimulus.stimulusId} のパート「${partId}」にイベント「${eventId}」がありません`);
  if (matches.length > 1) throw new Error(`刺激 ${stimulus.stimulusId} のパート「${partId}」でイベントID「${eventId}」が重複しています`);
  return matches[0];
}

// answerFeature ごとの正解コードの決め方。
function correctCodeFor(feature, event, chords, context) {
  if (feature === "degree") {
    if (!event.degree) throw new Error(`${context}: イベントに degree がありません`);
    return event.degree;
  }
  // chordRootDegree
  const chord = chords[event.chordRef];
  if (!chord) throw new Error(`${context}: 和音「${event.chordRef}」が辞書にありません`);
  return chord.rootDegree;
}

// 戻り値: answerTargets と同じ順序の配列。
//   [{ targetId, partId, eventId, answerFeature, sequenceOrder, optionSetRef, correctAnswerCode }]
export function resolveAnswerTargets(stimulus, taskTemplate, { chords = CHORDS, optionSets = OPTION_SETS } = {}) {
  return taskTemplate.answerTargets.map((target) => {
    const context = `課題 ${taskTemplate.taskTemplateId} の回答対象 ${target.targetId}`;
    if (!ANSWER_FEATURES.includes(target.answerFeature)) {
      throw new Error(`${context}: 未対応の answerFeature「${target.answerFeature}」です`);
    }
    const optionSet = optionSets[target.optionSetRef];
    if (!optionSet) throw new Error(`${context}: 回答候補「${target.optionSetRef}」が辞書にありません`);
    if (optionSet.answerFeature !== target.answerFeature) {
      throw new Error(`${context}: 回答候補「${target.optionSetRef}」の answerFeature が食い違っています`);
    }

    const event = findEvent(stimulus, target.partId, target.eventId);
    const correctAnswerCode = correctCodeFor(target.answerFeature, event, chords, context);
    if (!optionSet.options.some((option) => option.code === correctAnswerCode)) {
      throw new Error(`${context}: 正解コード「${correctAnswerCode}」が回答候補「${target.optionSetRef}」に含まれません`);
    }

    return {
      targetId: target.targetId,
      partId: target.partId,
      eventId: target.eventId,
      answerFeature: target.answerFeature,
      sequenceOrder: target.sequenceOrder,
      optionSetRef: target.optionSetRef,
      correctAnswerCode,
    };
  });
}
