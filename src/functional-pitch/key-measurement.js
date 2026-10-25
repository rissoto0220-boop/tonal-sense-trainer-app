// 機能的音感測定の「Keyごとの測定」(仕様15〜19章)。ユーザー・保存・CSV・サーバーに依存しない。
//
// 流れ: 90試行の生成と検査 → 10個の音源の読み込みと確認 → 90試行 → 完了画面。
// 測定結果はメモリ上のコールバック onMeasured で外へ渡すだけで、保存・送信はしない。
import { resumeAudioContext } from "../shared/audio-buffer-player.js";
import { generateTrialOrder, validateTrialOrder } from "./trial-generator.js";
import { loadKeyPhrases } from "./key-audio.js";
import { mountTrialScreen } from "./trial-screen.js";
import { enableUnloadGuard } from "./unload-guard.js";
import {
  buildLoadingHtml,
  buildCompletionHtml,
  buildLoadErrorHtml,
  buildInterruptedHtml,
  buildInternalErrorHtml,
  showBackScreen,
} from "./measurement-screens.js";

const RESPONSE_KEYS = [
  "melody_change_rating",
  "harmony_change_rating",
  "overall_change_rating",
  "response_enabled_at",
  "response_confirmed_at",
  "response_time_ms",
];

const toOrderEntry = (trial) => ({
  trial_number: trial.trialNumber,
  first_stimulus_id: trial.firstStimulusId,
  second_stimulus_id: trial.secondStimulusId,
  change_condition: trial.changeCondition,
});

// keyCode: "C" または "Fis"。参加者のクリックの中で呼ぶこと(AudioContextの有効化のため)。
// trialLimit: 試行数の短縮(開発確認用)。省略すると全90試行。
// onMeasured(result): Keyの測定が終わった時点で1回だけ呼ぶ(音声エラーで中断した場合も含む)。
//   result: { measurement_key_code, measurement_status("completed"/"audio_error"),
//             completed_trials, generated_trial_order }
// onBack(): 完了・エラー画面の「Key選択へ戻る」を押したときに呼ぶ。
// 戻り値の destroy(): 画面を離れるときに呼ぶ。音・タイマー・beforeunload をすべて止める。
// 以下は、テスト・開発用ページ向けの差し替え。
export function runKeyMeasurement({
  screenEl,
  keyCode,
  trialLimit = null,
  onMeasured = () => {},
  onBack = () => {},
  randomFn = Math.random,
  generateTrialOrderFn = generateTrialOrder,
  resumeAudioContextFn = resumeAudioContext,
  loadKeyPhrasesFn = loadKeyPhrases,
  mountTrialScreenFn = mountTrialScreen,
  enableUnloadGuardFn = enableUnloadGuard,
  trialControllerOptions = {},
}) {
  let controller = null;
  let disableGuard = () => {};
  let destroyed = false;

  function destroy() {
    destroyed = true;
    controller?.destroy();
    controller = null;
    disableGuard();
    disableGuard = () => {};
  }

  const showBack = (html) => showBackScreen({ screenEl, html, onBack });

  screenEl.innerHTML = buildLoadingHtml();

  // 90試行はセッション開始時に完全シャッフルし、測定の途中で再シャッフルしない。
  const generatedOrder = generateTrialOrderFn(randomFn);
  if (!validateTrialOrder(generatedOrder).valid) {
    showBack(buildInternalErrorHtml());
    return { destroy };
  }
  const trials = trialLimit ? generatedOrder.slice(0, trialLimit) : generatedOrder;
  const completedTrials = [];

  function finish(status, html) {
    controller?.destroy();
    controller = null;
    disableGuard();
    disableGuard = () => {};
    onMeasured({
      measurement_key_code: keyCode,
      measurement_status: status,
      completed_trials: completedTrials.map((t) => ({ ...t })),
      generated_trial_order: generatedOrder.map(toOrderEntry),
    });
    showBack(html);
  }

  function startTrial(index) {
    const trial = trials[index];
    const isLast = index === trials.length - 1;
    controller.start({
      trial: { keyCode, firstStimulusId: trial.firstStimulusId, secondStimulusId: trial.secondStimulusId },
      progressLabel: `${index + 1} / ${trials.length}`,
      nextLabel: isLast ? "測定を終える" : "次の問題へ",
      onConfirmed: (confirmed) => {
        completedTrials.push({
          ...toOrderEntry(trial),
          ...Object.fromEntries(RESPONSE_KEYS.map((key) => [key, confirmed[key]])),
        });
        if (isLast) finish("completed", buildCompletionHtml(keyCode));
        else startTrial(index + 1);
      },
      onError: () => finish("audio_error", buildInterruptedHtml(completedTrials.length)),
    });
  }

  function startTrials() {
    disableGuard = enableUnloadGuardFn();
    controller = mountTrialScreenFn(screenEl, trialControllerOptions);
    startTrial(0);
  }

  const showLoadError = (failures) => showBack(buildLoadErrorHtml(failures));

  // AudioContextの有効化(クリックの中で呼ばれる)→ 10個の音源の読み込みと確認 → 測定の開始。
  Promise.resolve()
    .then(() => resumeAudioContextFn())
    .then(() => loadKeyPhrasesFn(keyCode))
    .then((result) => {
      if (destroyed) return;
      if (!result.ok) showLoadError(result.failures);
      else startTrials();
    }, (error) => {
      if (!destroyed) showLoadError([{ src: "", reason: "load", error }]);
    });

  return { destroy };
}
