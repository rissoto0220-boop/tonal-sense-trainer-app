// 機能的音感測定の練習の画面の流れ(仕様14章)。
// 3試行(本番と同じ試行画面・タイムライン)→ 終了画面(本番を開始する / 練習をもう一度行う)。
// 「練習をもう一度」は音色確認へ戻らず、練習1から再開する。保存はしない。
import { resumeAudioContext } from "../shared/audio-buffer-player.js";
import { createPracticeSession } from "./practice-session.js";
import { mountTrialScreen } from "./trial-screen.js";

// 終了画面のHTML文字列を返す。条件名や正解・不正解を連想させる語は含めない。
export function buildPracticeEndHtml() {
  return `
    <div class="panel center functional-practice-end">
      <h2 tabindex="-1">練習が終わりました</h2>
      <p>本番を開始するか、練習をもう一度行うかを選んでください。</p>
      <div class="actions centered">
        <button type="button" class="primary" data-role="start-main">本番を開始する</button>
        <button type="button" class="secondary" data-role="retry">練習をもう一度行う</button>
      </div>
    </div>`;
}

// onFinished({ practice_results }): 「本番を開始する」を押したときに呼ぶ(全ラウンドの練習結果)。
// onError({ kind, error }): 音声エラー時に呼ぶ(画面にはエラーが表示される)。
// 戻り値の destroy(): 画面を離れるときに呼ぶ。鳴っている音を止め、タイマーを消す。
// session / mountTrialScreenFn / resumeAudioContextFn / trialControllerOptions は、テスト・開発用ページ向けの差し替え。
export function runPracticeFlow({
  screenEl,
  onFinished,
  onError = () => {},
  session = createPracticeSession(),
  mountTrialScreenFn = mountTrialScreen,
  resumeAudioContextFn = resumeAudioContext,
  trialControllerOptions = {},
}) {
  let controller = null;
  let destroyed = false;

  function destroy() {
    destroyed = true;
    controller?.destroy();
    controller = null;
  }

  // 参加者の操作(クリック)の中で呼ぶこと。AudioContextの時計が動き出してから最初の試行を始める。
  function startRound() {
    resumeAudioContextFn().then(() => {
      if (destroyed) return;
      controller?.destroy();
      controller = mountTrialScreenFn(screenEl, trialControllerOptions);
      startCurrentTrial();
    });
  }

  function startCurrentTrial() {
    controller.start({
      trial: session.currentTrial(),
      progressLabel: session.progressLabel(),
      nextLabel: "次の問題へ",
      onConfirmed: (confirmed) => {
        session.record(confirmed);
        if (session.isFinished()) showEnd();
        else startCurrentTrial();
      },
      onError,
    });
  }

  function showEnd() {
    controller?.destroy();
    controller = null;
    screenEl.innerHTML = buildPracticeEndHtml();
    screenEl.querySelector("h2").focus();
    const buttons = [...screenEl.querySelectorAll("button")];
    const lock = () => buttons.forEach((button) => { button.disabled = true; }); // 二重押しを防ぐ
    screenEl.querySelector('[data-role="start-main"]').addEventListener("click", () => {
      lock();
      onFinished({ practice_results: session.results() });
    });
    screenEl.querySelector('[data-role="retry"]').addEventListener("click", () => {
      lock();
      session.restart();
      startRound();
    });
  }

  startRound();
  return { destroy };
}
