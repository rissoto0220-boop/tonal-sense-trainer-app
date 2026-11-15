// 機能的音感測定の、Key選択・読み込み中・完了・エラーの画面(仕様15・19章)。
// build〜Html は HTML文字列を返す純粋関数。show〜 は画面へ描画してボタンをつなぐ(DOMを使う)。
import { escapeHtml } from "../shared/escape-html.js";
import { buildErrorScreenHtml } from "../shared/error-screen.js";
import { MEASUREMENT_KEYS } from "./stimuli.js";

export const KEY_LABEL = { C: "Key C", Fis: "Key Fis" };

export function buildKeySelectHtml({ showExit = false, showHistory = false } = {}) {
  const buttons = MEASUREMENT_KEYS.map((key) => `
        <button type="button" class="secondary functional-key-button" data-key="${key}">${escapeHtml(KEY_LABEL[key])}</button>`).join("");
  const actions = [
    showHistory ? `<button type="button" class="secondary" data-role="history">履歴・CSVを見る</button>` : "",
    showExit ? `<button type="button" class="secondary" data-role="exit">テスト選択へ戻る</button>` : "",
  ].filter(Boolean).join("");
  return `
    <div class="panel functional-key-select">
      <h2 tabindex="-1">実施するKeyを選択してください</h2>
      <div class="functional-key-list">${buttons}
      </div>${actions ? `
      <div class="actions">${actions}</div>` : ""}
    </div>`;
}

export function buildLoadingHtml() {
  return `<div class="panel center"><h2>音声の準備</h2><p class="status">音声を準備しています…</p></div>`;
}

// 完了画面。得点・正答率・評定の平均などは表示しない(主観評定で、正解がないため)。
export function buildCompletionHtml(keyCode) {
  return `
    <div class="panel center functional-completion">
      <h2 tabindex="-1">${escapeHtml(KEY_LABEL[keyCode])}の測定が終了しました。</h2>
      <p>ご回答ありがとうございました。</p>
      <div class="actions centered"><button type="button" class="primary" data-role="back">Key選択へ戻る</button></div>
    </div>`;
}

const fileName = (src) => String(src).split("/").pop();

// エラー画面は、エラーの種類の表(src/shared/error-kinds.js)から作る(2026-11-15 に統一した)。
// どれも、まだ(または途中までの)記録の扱いを「データへの影響」に書き、「Key選択へ戻る」で戻れる。

// 測定の開始前に、音源の読み込み・長さの確認に失敗したとき。失敗したファイルは研究者が分かるように、詳細に並べる。
// 読み込めないファイルが1つでもあれば「読み込めませんでした」、長さの不一致だけなら「長さが想定と異なります」。
export function buildLoadErrorHtml(failures) {
  const files = failures
    .filter((f) => f.src)
    .map((f) => `${fileName(f.src)}(${f.reason === "duration" ? "長さが想定と異なります" : "読み込めません"})`);
  return buildErrorScreenHtml({
    kind: failures.some((f) => f.reason !== "duration") ? "audio-load" : "audio-duration",
    impact: "not-recorded",
    backTo: "Key選択",
    details: [`${failures.length}件の音声ファイルに問題があります。`, ...files, "もう一方のKeyは選べます。"],
  });
}

// 測定の途中で音声エラーが起きたとき。kind は、エラーの種類の表の種類(音の時計が通知した種類を kindFromAudioNotice で直したもの)。
export function buildInterruptedHtml(completedCount, kind = "audio-load") {
  return buildErrorScreenHtml({
    kind,
    impact: "recorded-interrupted",
    backTo: "Key選択",
    details: [`${completedCount}試行まで回答済み`],
  });
}

// 音声の仕組みを始められなかったとき(測定の開始前なので、まだ記録は残っていない)。
export function buildAudioStartErrorHtml() {
  return buildErrorScreenHtml({ kind: "audio-start", impact: "not-recorded", backTo: "Key選択" });
}

// 90試行の生成結果が検査に通らなかったとき(通常は起きない内部エラー)。
export function buildInternalErrorHtml() {
  return buildErrorScreenHtml({ kind: "setup", impact: "not-recorded", backTo: "Key選択" });
}

// Key選択画面を描画する。onSelect(keyCode): Keyのボタンを押したとき(押した直後に全ボタンを無効にする)。
// onExit: 「テスト選択へ戻る」を押したとき。省略すると、そのボタンを表示しない。
// onShowHistory: 「履歴・CSVを見る」を押したとき。省略すると、そのボタンを表示しない。
export function showKeySelectScreen({ screenEl, onSelect, onExit = null, onShowHistory = null }) {
  screenEl.innerHTML = buildKeySelectHtml({ showExit: Boolean(onExit), showHistory: Boolean(onShowHistory) });
  screenEl.querySelector("h2").focus();
  const buttons = [...screenEl.querySelectorAll("button")];
  const lock = () => buttons.forEach((button) => { button.disabled = true; }); // 二重押しを防ぐ
  screenEl.querySelectorAll("[data-key]").forEach((button) => {
    button.addEventListener("click", () => {
      lock();
      onSelect(button.dataset.key);
    });
  });
  if (onExit) {
    screenEl.querySelector('[data-role="exit"]').addEventListener("click", () => {
      lock();
      onExit();
    });
  }
  if (onShowHistory) {
    screenEl.querySelector('[data-role="history"]').addEventListener("click", () => {
      lock();
      onShowHistory();
    });
  }
}

// 「Key選択へ戻る」ボタンが1つある画面(完了・エラー)を描画する。
export function showBackScreen({ screenEl, html, onBack }) {
  screenEl.innerHTML = html;
  screenEl.querySelector("h2").focus();
  const button = screenEl.querySelector('[data-role="back"]');
  button.addEventListener("click", () => {
    button.disabled = true; // 二重押しを防ぐ
    onBack();
  });
}
