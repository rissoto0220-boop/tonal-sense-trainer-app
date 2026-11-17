// エラーの種類の表(2026-11-15 研究者の決定: エラーの見せ方を、エラーの種類で統一する)。DOMに依存しない。
// 各画面は「エラーの種類」「データへの影響」「戻り先」を渡すだけにして、見出し・文言はここで決める。
// 仕様書(絶対音感 §26)の原則: 無言で続けない。「何が起きたか」「データへの影響」「次にすべきこと」を簡潔に表示する。
// 種類を足すときは、ERROR_KINDS に1行足す(保存の失敗・保存データの破損は、保存形式が確定してから検討する)。

// 1行が1つの種類。
//   title: 見出し。cause: 何が起きたか。
//   notifyResearcher: 真なら、次にすべきことに「研究者へお知らせください。」を添える(端末・音源など、参加者では直せないとき)。
//   next: 省略可。次にすべきことの文言を、決まった形(下の describeError)ではなく、そのまま使いたいとき。
export const ERROR_KINDS = {
  "audio-load": {
    title: "音声を読み込めませんでした",
    cause: "音声ファイルを読み込めませんでした。",
    notifyResearcher: false,
  },
  "audio-duration": {
    title: "音源の長さが想定と異なります",
    cause: "音声ファイルの長さが、想定と違っていました。",
    notifyResearcher: true,
  },
  "audio-play": {
    title: "音声を再生できませんでした",
    cause: "音声を再生できませんでした。",
    notifyResearcher: false,
  },
  "audio-start": {
    title: "音声を始められませんでした",
    cause: "この端末で、音声を使い始められませんでした。",
    notifyResearcher: true,
  },
  setup: {
    title: "開始できませんでした",
    cause: "試行の順序を正しく作れませんでした。",
    notifyResearcher: true,
  },
  // 画面の上の帯で知らせる(画面は切り替えない)。src/shared/error-notice.js
  unexpected: {
    title: "問題が起きました",
    cause: "予期しないエラーが起きました。",
    notifyResearcher: true,
    next: "動きがおかしいときは、「最初からやり直す」を押してください。研究者へお知らせください。",
  },
};

// データへの影響。呼び出し側が、状況に合うキーを渡す。
export const ERROR_IMPACTS = {
  // まだ回答がないうちに、セッションを中断として保存した(絶対音感・相対音感の、音声の起動失敗)
  "session-interrupted": "このテストは、中断として記録しました。",
  // セッションを中断として保存した(相対音感・機能的音感の測定・訓練)
  "recorded-interrupted": "ここまでの回答は、中断として記録しました。",
  // 絶対音感の再生エラー: 問題を誤回答・タイムアウトに数えず、セッションを中断として保存した
  "interrupted-uncounted": "この問題は誤回答・タイムアウトとして数えず、テストは中断として記録しました。",
  // まだセッションを始めていない(音色確認・練習・測定の開始前・訓練の開始前)
  "not-recorded": "まだ記録は残っていません。",
  // 想定外の例外: 記録の状態は分からないので、保存済みのものが残ることだけを伝える
  "kept-as-saved": "ここまでの記録は、保存されているものが残ります。",
};

export const NOTIFY_RESEARCHER_TEXT = "研究者へお知らせください。";

// 音の時計・読み込みの部品が通知する種類(load / duration / schedule / start)を、表の種類に直す。
// 知らない種類は audio-load とする。
const KIND_BY_AUDIO_NOTICE = {
  load: "audio-load",
  duration: "audio-duration",
  schedule: "audio-play",
  start: "audio-start",
};

export function kindFromAudioNotice(notice) {
  return KIND_BY_AUDIO_NOTICE[notice] ?? "audio-load";
}

// 画面に出す文言を組み立てる。
//   kind: ERROR_KINDS のキー。impact: ERROR_IMPACTS のキー(省略すると、影響の行を出さない)。
//   backTo: 戻り先の画面の名前(「テスト選択」「Key選択」「メニュー選択」)。省略すると、再読み込みを案内する。
//   details: 詳細の行(ファイル名・回答済みの数など)の配列。
// 戻り値: { title, cause, details, impact, next }
export function describeError({ kind, impact = null, backTo = null, details = [] }) {
  const entry = ERROR_KINDS[kind];
  if (!entry) throw new Error(`未対応のエラーの種類です: ${kind}`);
  if (impact !== null && !(impact in ERROR_IMPACTS)) throw new Error(`未対応のデータへの影響です: ${impact}`);
  const restart = backTo ? `${backTo}へ戻って、やり直してください。` : "ページを再読み込みして、やり直してください。";
  return {
    title: entry.title,
    cause: entry.cause,
    details: [...details],
    impact: impact === null ? null : ERROR_IMPACTS[impact],
    next: entry.next ?? `${entry.notifyResearcher ? NOTIFY_RESEARCHER_TEXT : ""}${restart}`,
  };
}
