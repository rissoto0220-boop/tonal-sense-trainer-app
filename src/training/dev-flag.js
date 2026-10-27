// 音感訓練を本体(app.js)から開くための「開発用の旗」の解釈。DOM・保存に依存しない。
//
// 未完成のあいだ、公開される本番では音感訓練を「準備中」のまま選べないようにするため、
// URL に ?training=dev を付けたときだけ有効にする(機能的音感の ?functional=dev と同じ作法)。
//   ?training=dev                : 有効(リプレイは「出題音だけ」、出題数は15)
//   ?training=dev&replay=setup   : リプレイを「調セットアップから」にする(試験的に両方を用意している)
//   ?training=dev&questions=N    : 出題数を N(1〜60)に短縮する(開発確認用)
// 旗がなければ、他のどんなパラメーターがあっても無効。

export const MAX_DEV_QUESTION_COUNT = 60;

// location: window.location 相当({ search })。
export function resolveTrainingOptions(location) {
  const params = new URLSearchParams(location?.search ?? "");
  if (params.get("training") !== "dev") {
    return { enabled: false, replayMode: "question-only", questionCount: null };
  }
  const questions = Number(params.get("questions"));
  return {
    enabled: true,
    replayMode: params.get("replay") === "setup" ? "with-setup" : "question-only",
    questionCount: Number.isInteger(questions) && questions >= 1 && questions <= MAX_DEV_QUESTION_COUNT ? questions : null,
  };
}
