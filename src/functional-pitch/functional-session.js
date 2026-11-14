// 機能的音感測定の「セッション全体」の入口(仕様20章)。ユーザー・保存・CSV・サーバーに依存しない。
//
// 流れ: (practiceRequired なら)音色確認 → 練習3試行 → Key選択 → Keyごとの測定 → Key選択 → …
// 測定結果はコールバックで外へ渡すだけで、ここでは保存・送信はしない(保存は呼び出し側が行う)。
import { runToneCheck } from "./tone-check-screen.js";
import { runPracticeFlow } from "./practice-flow.js";
import { runKeyMeasurement } from "./key-measurement.js";
import { showKeySelectScreen } from "./measurement-screens.js";
import { showErrorScreen } from "../shared/error-screen.js";

// 音色確認・練習で音声エラーが起きたときの見出し(エラーの種類ごと)。
// 以前は画面の中に「ページを再読み込みしてください」と出すだけだったが、テスト選択へ戻れるエラー画面にした(2026-11-14)。
export const STAGE_ERROR_TITLE = {
  load: "音声を読み込めませんでした",
  duration: "音源の長さが想定と異なります",
  schedule: "音声を再生できませんでした",
};
export const STAGE_ERROR_BACK_LABEL = "テスト選択へ戻る";

export function stageErrorMessage(kind) {
  const restart = "テスト選択へ戻って、最初からやり直してください。";
  return kind === "duration" ? `研究者へお知らせください。${restart}` : restart;
}

// screenEl: 描画先のDOM要素。
// practiceRequired: 真なら音色確認と練習から始める。偽ならKey選択から始める
//   (2回目以降の練習スキップ判定は、仕様未確定のため実装しない。呼び出し側が決めて渡す)。
// trialLimit: 試行数の短縮(開発確認用)。省略すると全90試行。
// onKeyMeasured(result): Keyの測定が終わるたびに1回呼ぶ。
//   result: { measurement_key_code, measurement_status, completed_trials, generated_trial_order, practice_results }
// onSessionStarted(info) / onTrialStarted(entry) / onTrialConfirmed(record): Keyごとの測定の通知
//   (key-measurement.js と同じ。onSessionStarted の info には practice_results も加える)。
// onExit: 省略可。渡すと、Key選択画面と、音色確認・練習のエラー画面に「テスト選択へ戻る」を表示し、押したときに呼ぶ。
// onShowHistory(backToKeySelect): 省略可。渡すと、Key選択画面に「履歴・CSVを見る」を表示し、
//   押したときに呼ぶ。履歴画面から戻るときは、渡された backToKeySelect() を呼ぶ。
// toneCheckOptions / practiceFlowOptions / keyMeasurementOptions: 各段階への追加の引数
//   (テスト・開発用ページ向けの差し替え。音源のフォルダーなど)。
// 戻り値の destroy(): 画面を離れるときに呼ぶ。音・タイマー・beforeunload をすべて止める。
export function runFunctionalPitchSession({
  screenEl,
  practiceRequired = true,
  trialLimit = null,
  onKeyMeasured = () => {},
  onSessionStarted = () => {},
  onTrialStarted = () => {},
  onTrialConfirmed = () => {},
  onExit = null,
  onShowHistory = null,
  toneCheckOptions = {},
  practiceFlowOptions = {},
  keyMeasurementOptions = {},
  runToneCheckFn = runToneCheck,
  runPracticeFlowFn = runPracticeFlow,
  runKeyMeasurementFn = runKeyMeasurement,
}) {
  let active = null; // 現在の段階(destroy を持つもの)
  let practiceResults = [];
  let destroyed = false;

  function replaceActive(next) {
    active?.destroy();
    active = next;
  }

  function destroy() {
    destroyed = true;
    active?.destroy();
    active = null;
  }

  function showToneCheck() {
    replaceActive(runToneCheckFn({ screenEl, onProceed: showPractice, onError: showStageError, ...toneCheckOptions }));
  }

  // 音色確認・練習の音声エラー。鳴っている段階を止めてから、テスト選択へ戻れるエラー画面を出す
  // (やり直しは最初から。Key測定のエラーは key-measurement.js の画面のまま)。
  function showStageError({ kind } = {}) {
    if (destroyed) return;
    replaceActive(null);
    showErrorScreen({
      screenEl,
      title: STAGE_ERROR_TITLE[kind] ?? STAGE_ERROR_TITLE.load,
      message: stageErrorMessage(kind),
      backLabel: STAGE_ERROR_BACK_LABEL,
      onBack: onExit ? () => { destroy(); onExit(); } : null,
    });
  }

  // 「練習へ進む」(参加者のクリック)の中で呼ばれる。
  function showPractice() {
    replaceActive(runPracticeFlowFn({
      screenEl,
      onFinished: ({ practice_results }) => {
        practiceResults = practice_results;
        showKeySelect();
      },
      onError: showStageError,
      ...practiceFlowOptions,
    }));
  }

  function showKeySelect() {
    if (destroyed) return;
    replaceActive(null);
    showKeySelectScreen({
      screenEl,
      onSelect: startKey,
      onExit: onExit ? () => { destroy(); onExit(); } : null,
      onShowHistory: onShowHistory ? () => onShowHistory(showKeySelect) : null,
    });
  }

  // Keyのボタン(参加者のクリック)の中で呼ばれる。
  function startKey(keyCode) {
    replaceActive(runKeyMeasurementFn({
      screenEl,
      keyCode,
      trialLimit,
      onSessionStarted: (info) => onSessionStarted({
        ...info,
        practice_results: practiceResults.map((r) => ({ ...r })),
      }),
      onTrialStarted,
      onTrialConfirmed,
      onMeasured: (result) => onKeyMeasured({
        ...result,
        practice_results: practiceResults.map((r) => ({ ...r })),
      }),
      onBack: showKeySelect,
      ...keyMeasurementOptions,
    }));
  }

  if (practiceRequired) showToneCheck();
  else showKeySelect();

  return { destroy };
}
