// 機能的音感測定の「セッション全体」の入口(仕様20章)。ユーザー・保存・CSV・サーバーに依存しない。
//
// 流れ: (practiceRequired なら)音色確認 → 練習3試行 → Key選択 → Keyごとの測定 → Key選択 → …
// 測定結果はコールバックで外へ渡すだけで、ここでは保存・送信はしない(保存は呼び出し側が行う)。
import { runToneCheck } from "./tone-check-screen.js";
import { runPracticeFlow } from "./practice-flow.js";
import { runKeyMeasurement } from "./key-measurement.js";
import { showKeySelectScreen } from "./measurement-screens.js";
import { showErrorScreen } from "../shared/error-screen.js";
import { kindFromAudioNotice } from "../shared/error-kinds.js";
import { enableUnloadGuard } from "../shared/unload-guard.js";

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
// enableUnloadGuardFn: ページを閉じる前の確認の差し替え(テスト用)。
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
  enableUnloadGuardFn = enableUnloadGuard,
}) {
  let active = null; // 現在の段階(destroy を持つもの)
  let practiceResults = [];
  let destroyed = false;
  // 音色確認・練習の間の、ページを閉じる前のブラウザの確認(2026-11-14 研究者の決定: 練習の開始から結果まで)。
  // Key選択・エラー画面・destroy で解除する。測定中の確認は key-measurement.js が持つ。
  let releaseGuard = () => {};
  function releaseStageGuard() {
    releaseGuard();
    releaseGuard = () => {};
  }

  function replaceActive(next) {
    active?.destroy();
    active = next;
  }

  function destroy() {
    destroyed = true;
    active?.destroy();
    active = null;
    releaseStageGuard();
  }

  function showToneCheck() {
    releaseStageGuard();
    releaseGuard = enableUnloadGuardFn();
    replaceActive(runToneCheckFn({ screenEl, onProceed: showPractice, onError: showStageError, ...toneCheckOptions }));
  }

  // 音色確認・練習の音声エラー。鳴っている段階を止めてから、テスト選択へ戻れるエラー画面を出す
  // (やり直しは最初から。Key測定のエラーは key-measurement.js の画面のまま)。
  function showStageError({ kind } = {}) {
    if (destroyed) return;
    replaceActive(null);
    releaseStageGuard();
    // 見出し・文言はエラーの種類の表(src/shared/error-kinds.js)。まだセッションは始まっていないので、記録はない。
    showErrorScreen({
      screenEl,
      kind: kindFromAudioNotice(kind),
      impact: "not-recorded",
      backTo: "テスト選択",
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
    releaseStageGuard(); // 拠点の画面では確認を出さない(測定を始めると key-measurement.js が有効にする)
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
