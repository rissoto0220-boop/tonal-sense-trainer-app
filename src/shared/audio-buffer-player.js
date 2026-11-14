// Web Audio API(AudioContext)を使った、高精度な音声再生・スケジューリングのための薄いラッパー。
//
// 既存の<audio>要素版(audio-player.js)とは別に用意する。絶対音感・相対音感とも
// このモジュールを使う(audio-player.jsは現在どちらからも使われていないが、削除の指示は
// 受けていないため残してある)。
// 音声を事前にデコードしてメモリ上のAudioBufferとして持っておくことで、
// 再生を命じてから実際に鳴り始めるまでの読み込み遅延をなくし、かつAudioContext自身の
// 正確な時計を基準に「何秒後に鳴らす」という予約ができる(setTimeoutの精度に頼らない)。
//
// 反応時間計測の起点(仕様: 絶対音感13.3・相対音感16.1)は、引き続き「実装可能な範囲」の
// 近似であるという前提は変わらない。ここでの改善は、その近似の精度を上げるものであり、
// 実際の発音との理論上のずれを完全になくすものではない。

let sharedContext = null;

function getAudioContext() {
  if (!sharedContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    sharedContext = new AudioContextClass();
  }
  return sharedContext;
}

// ブラウザの自動再生制限により、AudioContextはページ読み込み直後は一時停止(suspended)状態の
// ことがある。参加者が実際にクリックした操作の中から呼び出すこと(絶対音感の「練習を開始」、
// 相対音感の本番開始操作など)。
export function resumeAudioContext() {
  const context = getAudioContext();
  if (context.state === "suspended") {
    return context.resume();
  }
  return Promise.resolve();
}

// AudioContextの現在時刻(秒)。スケジュールの基準・反応時間計測に使う。
export function audioContextTime() {
  return getAudioContext().currentTime;
}

// AudioContextの再開直後などは音声出力の準備が整いきっていないことがあり、予約なしで
// 即座に再生を始めようとすると、最初の音の冒頭が欠けて聞こえることがある(コールドスタート)。
// 「今すぐ」ではなく「今から少し先」を再生予定時刻にすることで回避する。
// 手動確認の結果(2026-08-30): 0.1秒ではまれに発生、0.3秒でも発生、1.0秒では発生せず、
// 0.5秒で確定した(相対音感の音声タイムラインで確認。絶対音感でも同じ現象が起こり得るため、
// 両方でこの値を共有する)。
export const COLD_START_LEAD_SECONDS = 0.5;

const bufferCache = new Map();

// 音声ファイルを読み込み・デコードしてAudioBufferを返す(事前読み込み)。
// 同じsrcへの呼び出しは、デコード結果(Promise)をキャッシュして使い回す。
// 失敗した読み込みはキャッシュに残さない。エラー画面から戻ってやり直したときに、もう一度読みに行く
// (残すと、ページを再読み込みするまで同じ失敗が続くため。2026-11-14)。
export function loadAudioBuffer(src) {
  if (!bufferCache.has(src)) {
    const promise = fetch(src)
      .then((response) => response.arrayBuffer())
      .then((data) => getAudioContext().decodeAudioData(data));
    bufferCache.set(src, promise);
    promise.catch(() => {
      if (bufferCache.get(src) === promise) bufferCache.delete(src);
    });
  }
  return bufferCache.get(src);
}

// bufferを、AudioContextの時刻でwhen(省略時は現在時刻、即座)に再生開始する。
// 開始時刻はこの呼び出し時点で確定するため、絶対音感13.3の<audio>版と違い、
// 「実際に開始したか」をPromiseで待つ必要がない。
export function scheduleAudioBuffer(buffer, when) {
  const context = getAudioContext();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  const startedAt = when ?? context.currentTime;
  source.start(startedAt);
  return { source, startedAt };
}
