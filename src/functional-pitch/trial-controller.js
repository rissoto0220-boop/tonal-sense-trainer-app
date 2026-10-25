// 機能的音感測定1試行の進行(音声タイムライン+評定)を担う部分。DOMに依存しない。
// 見た目の更新は view に任せ、ここは「いつ何を有効にするか」と「確定値は何か」だけを決める。
//
// view が持つ関数:
//   reset({ progressLabel, nextLabel }) : 試行の開始時に画面を初期状態(全て無効・選択なし)へ戻す
//   setPhase(phase)                     : "preparing" / "phrase1" / "gap" / "phrase2" / "answerable"
//   setRatingsEnabled(enabled)          : 3項目のラジオの有効・無効
//   setNextEnabled(enabled)             : 「次の問題へ」の有効・無効
//   announceAnswerable()                : 回答可能になったことを読み上げ用の領域へ通知する
//   lockAll()                           : 確定直後に、全ラジオと「次の問題へ」を無効にする
//   showError(kind)                     : 音声エラーの表示("load" / "duration" / "schedule")
import { runTrialTimeline } from "./trial-timeline.js";
import { createRatingState } from "./rating-state.js";

// view: 上記の関数を持つもの。
// runTrialTimelineFn / timelineOptions: テストや開発用ページで時間制御を差し替えるための引数。
export function createTrialController({
  view,
  runTrialTimelineFn = runTrialTimeline,
  timelineOptions = {},
}) {
  let state = null;
  let handle = null;
  let onConfirmed = () => {};

  function teardown() {
    handle?.cancel();
    handle = null;
    state = null;
  }

  function updateNext() {
    view.setNextEnabled(Boolean(state?.canProceed()));
  }

  return {
    // trial: { keyCode, firstStimulusId, secondStimulusId }
    // 前の試行が残っていれば、止めてから始める(選択値も引き継がない)。
    start({ trial, progressLabel, nextLabel = "次の問題へ", onConfirmed: confirmedCallback, onError = () => {} }) {
      teardown();
      state = createRatingState();
      const current = state; // この試行の状態。別の試行が始まった後に届いた通知は無視する
      onConfirmed = confirmedCallback;
      view.reset({ progressLabel, nextLabel });

      handle = runTrialTimelineFn(trial, {
        ...timelineOptions,
        onPhase: (phase) => {
          if (state === current) view.setPhase(phase);
        },
        onAnswerable: () => {
          if (state !== current) return;
          state.setAnswerable(true);
          view.setPhase("answerable");
          view.setRatingsEnabled(true);
          view.announceAnswerable();
          updateNext();
        },
        onError: ({ kind, error }) => {
          if (state !== current) return;
          view.setRatingsEnabled(false);
          view.setNextEnabled(false);
          view.showError(kind);
          onError({ kind, error });
        },
      });
    },

    // 画面のラジオが変更されたときに呼ぶ。value は1〜7の整数。
    select(itemKey, value) {
      if (!state?.select(itemKey, value)) return;
      updateNext();
    },

    // 「次の問題へ」が押されたときに呼ぶ。回答可能になっていて、3項目すべて選ばれているときだけ
    // 最初の1回だけ確定する。確定値(仕様11章)を onConfirmed へ渡す。
    next() {
      if (!state || !handle || !state.canProceed()) return;
      const timing = handle.confirm();
      if (!timing) return;
      const ratings = state.confirm();
      view.lockAll();
      onConfirmed({
        ...ratings,
        response_enabled_at: timing.responseEnabledAt,
        response_confirmed_at: timing.responseConfirmedAt,
        response_time_ms: timing.responseTimeMs,
      });
    },

    // 画面を離れるときに呼ぶ。再生を止め、予約したタイマーを消す。
    destroy() {
      teardown();
    },
  };
}
