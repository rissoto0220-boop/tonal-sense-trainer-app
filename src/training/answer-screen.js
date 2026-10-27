// 音感訓練の回答画面(T3)。音声と進行は持たず、操作を呼び出し側へ知らせるだけ(T4でつなぐ)。
//
// 画面の構成(研究者の見本・決定、tonal-sense-docs/training-data-design-prototype.md 第7.9節):
//   進捗 → 上部の表示「? → ド」(和音は「? → Ⅰ」) → 鍵盤 → 「リプレイ」「わからない」 → 正誤の文言 → 「次に進む」
// - 単音: 横一列の階名鍵盤(ソ ラ シ ド レ ミ ファ)。ドは背を高くする(主音の主張)。
// - 和音: 6つのボタンを六角形に並べる(Ⅰを上に、時計回りに Ⅰ Ⅳ Ⅲ Ⅵ Ⅱ Ⅴ)。
// - 出題に使う音(activeOptionCodes)だけ押せる。押せない音は薄い灰色と点線の枠(色だけに頼らない)。
// - 回答後、上部の「?」は回答した音に変わる(正解を示すのではない)。「わからない」のときは「?」のまま。
// - 正誤は文言で示す。色で正誤を示さない。青は「回答受付」の意味なので正誤に使わない。
// 画面は問題ごとに1回だけ作り、状態が変わったら必要な部分だけを書き換える(mountAnswerScreen のコメント参照)。
import { escapeHtml } from "../shared/escape-html.js";
import { createAnswerLock } from "../shared/answer-lock.js";
import { OPTION_SETS } from "./definitions.js";
import { GIVE_UP_RESPONSE_CODE } from "./judge.js";

// 主音(ド・Ⅰ)のコード。上部の表示の「→ ド」と、鍵盤で背を高くする音に使う。
export const TONIC_CODE = "n1";

export const BUTTON_TEXT = { replay: "リプレイ", giveUp: "わからない", next: "次に進む" };

// 正誤の文言(相対音感の練習と同じ言い方)。
export function feedbackLines(outcome, correctLabel) {
  return outcome === "correct" ? ["正解です"] : ["不正解です", `正解は「${correctLabel}」です`];
}

// 上部の表示。回答前(または「わからない」)は「?」。
export function promptText(answerLabel, tonicLabel) {
  return `${answerLabel ?? "?"} → ${tonicLabel}`;
}

// 和音の六角形での位置(0=上、時計回りに1〜5)。回答候補の並び(Ⅲ Ⅵ Ⅱ Ⅴ Ⅰ Ⅳ)を、Ⅰから巡回させる。
export function hexagonPositions(options) {
  const tonicIndex = options.findIndex((option) => option.code === TONIC_CODE);
  return Object.fromEntries(options.map((option, index) => [option.code, (index - tonicIndex + options.length) % options.length]));
}

function labelFor(optionSet, code) {
  return optionSet.options.find((option) => option.code === code)?.label ?? null;
}

// state: { answerable, selectedCode, result: { outcome, correctAnswerCode } | null, showNext, replayEnabled }
export function buildAnswerScreenHtml({ optionSetRef, activeOptionCodes, progressLabel, state }) {
  const optionSet = OPTION_SETS[optionSetRef];
  if (!optionSet) throw new Error(`回答候補「${optionSetRef}」が辞書にありません`);
  const isChord = optionSet.answerFeature === "chordRootDegree";
  const answered = state.selectedCode !== null;
  const answerLabel = answered && state.selectedCode !== GIVE_UP_RESPONSE_CODE ? labelFor(optionSet, state.selectedCode) : null;
  const positions = isChord ? hexagonPositions(optionSet.options) : {};

  const buttons = optionSet.options.map((option) => {
    const active = activeOptionCodes.includes(option.code);
    const enabled = active && state.answerable && !answered;
    const classes = [isChord ? "training-chord" : "training-key"];
    if (isChord) classes.push(`training-chord--${option.code}`);
    if (!isChord && option.code === TONIC_CODE) classes.push("training-key--tonic");
    if (!active) classes.push("is-inactive");
    if (option.code === state.selectedCode) classes.push("selected");
    const style = isChord ? ` style="--i:${positions[option.code]}"` : "";
    const name = active ? option.label : `${option.label}(この訓練では使いません)`;
    return `<button type="button" class="${classes.join(" ")}" data-code="${escapeHtml(option.code)}"${style} aria-label="${escapeHtml(name)}"${enabled ? "" : " disabled"}>${escapeHtml(option.label)}</button>`;
  }).join("");

  const lines = state.result ? feedbackLines(state.result.outcome, labelFor(optionSet, state.result.correctAnswerCode)) : [];
  const toolsEnabled = state.answerable && !answered;

  return `
    <div class="panel training-answer">
      <p class="training-progress">${escapeHtml(progressLabel)}</p>
      <div class="training-prompt" data-role="prompt">${escapeHtml(promptText(answerLabel, labelFor(optionSet, TONIC_CODE)))}</div>
      <div class="${isChord ? "training-hexagon" : "training-keyboard"}">${buttons}</div>
      <div class="actions centered training-tools">
        <button type="button" class="secondary" data-role="replay"${(state.replayEnabled ?? toolsEnabled) ? "" : " disabled"}>${BUTTON_TEXT.replay}</button>
        <button type="button" class="secondary" data-role="giveup"${toolsEnabled ? "" : " disabled"}>${BUTTON_TEXT.giveUp}</button>
      </div>
      <div class="training-feedback" data-role="feedback" role="status" aria-live="polite">${feedbackHtml(lines)}</div>
      <div class="actions centered"><button type="button" class="primary" data-role="next"${state.showNext ? "" : " hidden"}>${BUTTON_TEXT.next}</button></div>
    </div>`;
}

function feedbackHtml(lines) {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

// 回答画面を表示する。戻り値の操作で状態を変える。
//   onAnswer(code): 鍵盤を押したとき(1問に1回だけ)。code は回答候補のコード、または "giveup"(「わからない」)。
//   onReplay(): 「リプレイ」を押したとき。onNext(): 「次に進む」を押したとき。
// 戻り値:
//   setAnswerable(enabled): 回答を受け付けるかどうか(音の再生中は受け付けない、など)。
//   setReplayEnabled(enabled): 「リプレイ」を押せるかどうか(null に戻すと、回答の受付に合わせる)。
//   showResult({ outcome, correctAnswerCode, showNext, replayEnabled }): 正誤の文言を表示する。
//   destroy(): 以後の操作を無視する。
// 画面は最初に1回だけ作り、その後は必要な部分(ボタンの押せる/押せない・選択中の印・上部の表示・正誤の文言・
// 「次に進む」の表示)だけを書き換える。描き直すと、外枠 .panel のフェードイン(styles.css)が毎回やり直され、
// 音の再生のたびにボタンが一瞬消えて見えるため(2026-10-27 の確認で判明)。
export function mountAnswerScreen({ screenEl, optionSetRef, activeOptionCodes, progressLabel, onAnswer = () => {}, onReplay = () => {}, onNext = () => {} }) {
  const optionSet = OPTION_SETS[optionSetRef];
  const lock = createAnswerLock();
  const state = { answerable: false, selectedCode: null, result: null, showNext: false, replayEnabled: null };
  let destroyed = false;

  screenEl.innerHTML = buildAnswerScreenHtml({ optionSetRef, activeOptionCodes, progressLabel, state });
  const optionButtons = [...screenEl.querySelectorAll("[data-code]")];
  const promptEl = screenEl.querySelector('[data-role="prompt"]');
  const feedbackEl = screenEl.querySelector('[data-role="feedback"]');
  const replayButton = screenEl.querySelector('[data-role="replay"]');
  const giveUpButton = screenEl.querySelector('[data-role="giveup"]');
  const nextButton = screenEl.querySelector('[data-role="next"]');

  function update() {
    const answered = state.selectedCode !== null;
    for (const button of optionButtons) {
      const code = button.dataset.code;
      button.disabled = !(activeOptionCodes.includes(code) && state.answerable && !answered);
      button.classList.toggle("selected", code === state.selectedCode);
    }
    const answerLabel = answered && state.selectedCode !== GIVE_UP_RESPONSE_CODE ? labelFor(optionSet, state.selectedCode) : null;
    promptEl.textContent = promptText(answerLabel, labelFor(optionSet, TONIC_CODE));
    const toolsEnabled = state.answerable && !answered;
    replayButton.disabled = !(state.replayEnabled ?? toolsEnabled);
    giveUpButton.disabled = !toolsEnabled;
    const lines = state.result ? feedbackLines(state.result.outcome, labelFor(optionSet, state.result.correctAnswerCode)) : [];
    feedbackEl.innerHTML = feedbackHtml(lines);
    const showingNext = !nextButton.hidden;
    nextButton.hidden = !state.showNext;
    if (state.showNext && !showingNext) nextButton.focus();
  }

  function answer(code) {
    if (destroyed || !state.answerable || !lock.tryLock()) return;
    state.selectedCode = code;
    update();
    onAnswer(code);
  }

  for (const button of optionButtons) button.addEventListener("click", () => answer(button.dataset.code));
  giveUpButton.addEventListener("click", () => answer(GIVE_UP_RESPONSE_CODE));
  replayButton.addEventListener("click", () => { if (!destroyed) onReplay(); });
  nextButton.addEventListener("click", () => { if (!destroyed) onNext(); });

  return {
    setAnswerable(enabled) {
      if (destroyed) return;
      state.answerable = enabled;
      update();
    },
    // 「リプレイ」を押せるかどうかを、回答の受付とは別に切り替える(再生中は押せない、など)。
    setReplayEnabled(enabled) {
      if (destroyed) return;
      state.replayEnabled = enabled;
      update();
    },
    showResult({ outcome, correctAnswerCode, showNext = false, replayEnabled = null }) {
      if (destroyed) return;
      state.result = { outcome, correctAnswerCode };
      state.showNext = showNext;
      state.replayEnabled = replayEnabled;
      update();
    },
    destroy() {
      destroyed = true;
    },
  };
}
