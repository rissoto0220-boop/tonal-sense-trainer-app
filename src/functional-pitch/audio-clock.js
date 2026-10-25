// 「音声の時計(AudioContext)で、指定した時刻になったら関数を呼ぶ」仕組み。DOMに依存しない。
//
// setTimeoutで待つが、発火時に音声の時計を読み直し、予定より早ければ残り時間で予約し直す
// (音声の時計を正とする)。音声の時計が止まっている間は、追いつくまで待ち続ける。
// 試行の段階の切り替え(trial-timeline.js)と、音色確認の「再生が終わった」の検出
// (tone-check-controller.js)が共有する。

// setTimeoutが予定より数ミリ秒早く発火しても、再予約せずに進めてよい許容(秒)。
const EARLY_TOLERANCE_SECONDS = 0.002;
// 時計がまだ追いついていないときの再予約の最短間隔(ミリ秒)。時計が止まっている間の空回りを防ぐ。
const RETRY_MIN_DELAY_MS = 10;

export function createClockScheduler({ setTimeoutFn, clearTimeoutFn, audioContextTimeFn }) {
  const timeoutIds = new Set();
  let stopped = false;

  return {
    // 音声の時計が targetTime(秒)に達したら fn を1回呼ぶ。cancelAll の後は何も予約しない。
    runAt(targetTime, fn) {
      if (stopped) return;
      const arm = (minDelayMs) => {
        const remainingMs = (targetTime - audioContextTimeFn()) * 1000;
        const id = setTimeoutFn(() => {
          timeoutIds.delete(id);
          if (stopped) return;
          if (audioContextTimeFn() < targetTime - EARLY_TOLERANCE_SECONDS) {
            arm(RETRY_MIN_DELAY_MS);
            return;
          }
          fn();
        }, Math.max(minDelayMs, remainingMs));
        timeoutIds.add(id);
      };
      arm(0);
    },
    // 予約済みのタイマーをすべて消し、以後の予約・呼び出しを止める。何度呼んでも安全。
    cancelAll() {
      stopped = true;
      timeoutIds.forEach((id) => clearTimeoutFn(id));
      timeoutIds.clear();
    },
  };
}
