// 機能的音感測定の、Key選択・読み込み中・完了・エラーの画面(仕様15・19章)。
// build〜Html は HTML文字列を返す純粋関数。show〜 は画面へ描画してボタンをつなぐ(DOMを使う)。
import { escapeHtml } from "../shared/escape-html.js";
import { MEASUREMENT_KEYS } from "./stimuli.js";

export const KEY_LABEL = { C: "Key C", Fis: "Key Fis" };

export function buildKeySelectHtml({ showExit = false } = {}) {
  const buttons = MEASUREMENT_KEYS.map((key) => `
        <button type="button" class="secondary functional-key-button" data-key="${key}">${escapeHtml(KEY_LABEL[key])}</button>`).join("");
  return `
    <div class="panel functional-key-select">
      <h2 tabindex="-1">実施するKeyを選択してください</h2>
      <div class="functional-key-list">${buttons}
      </div>${showExit ? `
      <div class="actions"><button type="button" class="secondary" data-role="exit">テスト選択へ戻る</button></div>` : ""}
    </div>`;
}

export function buildLoadingHtml() {
  return `<div class="panel center"><p class="status">音声を準備しています…</p></div>`;
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

// 測定の開始前に、音源の読み込み・長さの確認に失敗したとき。失敗したファイルは研究者が分かるように表示する。
export function buildLoadErrorHtml(failures) {
  const items = failures.map((f) => {
    const reason = f.reason === "duration" ? "長さが想定と異なります" : "読み込めません";
    return `<li>${escapeHtml(fileName(f.src))}(${reason})</li>`;
  }).join("");
  return `
    <div class="panel functional-measurement-error">
      <h2 tabindex="-1">音源を読み込めませんでした</h2>
      <p class="error">測定を開始できません(${failures.length}件)。研究者へお知らせください。</p>
      <ul class="functional-error-files">${items}</ul>
      <p class="note">ページを再読み込みすると、もう一度試せます。もう一方のKeyは、別の音源なので選べます。</p>
      <div class="actions"><button type="button" class="primary" data-role="back">Key選択へ戻る</button></div>
    </div>`;
}

// 測定の途中で音声エラーが起きたとき。
export function buildInterruptedHtml(completedCount) {
  return `
    <div class="panel functional-measurement-error">
      <h2 tabindex="-1">測定を中断しました</h2>
      <p class="error">音声エラーのため、測定を中断しました。(${completedCount} 試行まで回答済み)</p>
      <p class="note">研究者へお知らせください。ページを再読み込みすると、もう一度試せます。</p>
      <div class="actions"><button type="button" class="primary" data-role="back">Key選択へ戻る</button></div>
    </div>`;
}

// 90試行の生成結果が検査に通らなかったとき(通常は起きない内部エラー)。
export function buildInternalErrorHtml() {
  return `
    <div class="panel functional-measurement-error">
      <h2 tabindex="-1">測定を開始できませんでした</h2>
      <p class="error">試行の順序を正しく作れませんでした。研究者へお知らせください。</p>
      <div class="actions"><button type="button" class="primary" data-role="back">Key選択へ戻る</button></div>
    </div>`;
}

// Key選択画面を描画する。onSelect(keyCode): Keyのボタンを押したとき(押した直後に全ボタンを無効にする)。
// onExit: 「テスト選択へ戻る」を押したとき。省略すると、そのボタンを表示しない。
export function showKeySelectScreen({ screenEl, onSelect, onExit = null }) {
  screenEl.innerHTML = buildKeySelectHtml({ showExit: Boolean(onExit) });
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
