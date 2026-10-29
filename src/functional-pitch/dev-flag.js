// 機能的音感測定を本体(app.js)から開くための「開発用の旗」の解釈。DOM・保存に依存しない。
//
// 未完成のあいだ、公開される本番では機能的音感を「準備中」のまま選べないようにするため、
// URL に ?functional=dev を付けたときだけ有効にする。
//   ?functional=dev                : 有効(音色確認→練習→Key選択の通常の流れ)
//   ?functional=dev&practice=skip  : 練習(音色確認を含む)を省略してKey選択から始める
//   ?functional=dev&trials=N       : 1つのKeyの試行数を N(1〜90)に短縮する(開発確認用。90試行は最短でも約17分かかる)
// 旗がなければ、他のどんなパラメーターがあっても無効。

// location: window.location 相当({ search })。
export function resolveFunctionalPitchOptions(location) {
  const params = new URLSearchParams(location?.search ?? "");
  if (params.get("functional") !== "dev") {
    return { enabled: false, practiceRequired: true, trialLimit: null };
  }
  const trials = Number(params.get("trials"));
  return {
    enabled: true,
    practiceRequired: params.get("practice") !== "skip",
    trialLimit: Number.isInteger(trials) && trials >= 1 && trials <= 90 ? trials : null,
  };
}
