// テスト・訓練の最中に、ページを閉じる・再読み込みする前のブラウザの確認(beforeunload)を有効にする。
// どのテストも途中から再開する機能はないため、誤って閉じたときの最後の砦にする。
// 全テストで、練習の開始から結果まで確認を出す(2026-11-14 研究者の決定)。もとは機能的音感の測定用(90試行は約25〜30分)。
// 保存はしない。確認の文言はブラウザが決める(変更できない)。

// target: window 相当(addEventListener / removeEventListener を持つもの)。
// 戻り値: 解除する関数(何度呼んでも安全)。
// 有効な確認は、モジュール内に覚えておき、releaseAllUnloadGuards() でまとめて解除できる。
const activeReleases = new Set();

export function enableUnloadGuard(target = typeof window !== "undefined" ? window : null) {
  if (!target) return () => {};
  const handler = (event) => {
    event.preventDefault();
    event.returnValue = ""; // 古いブラウザ向け
  };
  target.addEventListener("beforeunload", handler);
  let active = true;
  const release = () => {
    if (!active) return;
    active = false;
    activeReleases.delete(release);
    target.removeEventListener("beforeunload", handler);
  };
  activeReleases.add(release);
  return release;
}

// 有効な確認を、すべて解除する(2026-11-15 エラーの見せ方の統一 フェーズ5-C)。
// 想定外のエラーの帯の「最初からやり直す」で、再読み込みの前に確認が出ないようにするために使う。
// 各テスト・訓練が持っている個別の解除関数は、あとから呼んでも安全。
export function releaseAllUnloadGuards() {
  for (const release of [...activeReleases]) release();
}
