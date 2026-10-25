// 測定の最中に、ページを閉じる・再読み込みする前のブラウザの確認(beforeunload)を有効にする。
// 90試行は約25〜30分かかり、途中から再開する機能はないため、誤って閉じたときの最後の砦にする。
// 保存はしない。確認の文言はブラウザが決める(変更できない)。

// target: window 相当(addEventListener / removeEventListener を持つもの)。
// 戻り値: 解除する関数(何度呼んでも安全)。
export function enableUnloadGuard(target = typeof window !== "undefined" ? window : null) {
  if (!target) return () => {};
  const handler = (event) => {
    event.preventDefault();
    event.returnValue = ""; // 古いブラウザ向け
  };
  target.addEventListener("beforeunload", handler);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    target.removeEventListener("beforeunload", handler);
  };
}
