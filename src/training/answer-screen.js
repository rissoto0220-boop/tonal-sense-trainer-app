// 音感訓練の回答画面(T3)。音声と進行は持たず、操作を呼び出し側へ知らせるだけ(T4でつなぐ)。
//
// 画面の構成(研究者の見本・決定、tonal-sense-docs/training-data-design-prototype.md 第7.9節):
//   [見出し・進捗 …… 「中断する」(右上。押すと、すぐ下に確認を出す。training_pending_to_decisions.md 第7節)]
//   → 上部の表示「? → ド」(和音は「? → Ⅰ」) → 鍵盤 → 「リプレイ」「わからない」 → 正誤の文言 → 「次に進む」
//   (2026-11-15 研究者の決定: 「訓練を終了する」を「中断する」にし、押し間違えないよう、リプレイ等から離して右上へ移した)
// - 単音: 横一列の階名鍵盤(ソ ラ シ ド レ ミ ファ)。ドは背を高くする(主音の主張)。
// - 和音: 6つのボタンを六角形に並べる(Ⅰを上に、時計回りに Ⅰ Ⅳ Ⅲ Ⅵ Ⅱ Ⅴ)。
// - 出題に使う音(activeOptionCodes)だけ押せる。押せない音は薄い灰色と点線の枠(色だけに頼らない)。
// - 回答後、上部の「?」は回答した音に変わる(正解を示すのではない)。「わからない」のときは「?」のまま。
// - 正誤は文言で示す。色で正誤を示さない。青は「回答受付」の意味なので正誤に使わない。
// 画面は問題ごとに1回だけ作り、状態が変わったら必要な部分だけを書き換える(mountAnswerScreen のコメント参照)。
//
// 拡張サンプル(sample-menus.js)のための2つの指定(省略すると ver.1 と同じ動作):
// - tonicCode: 主音の音度(既定 n1)。短調のサンプルでは n6 にし、上部の表示を「? → ラ」「? → Ⅵ」にする。
//   背の高い鍵盤・六角形の頂点も主音に合わせる。
// - targetCount: 1問で答える数(既定1)。2なら上部の表示は「? → ? → ド」で、回答した順に埋まる。
//   「わからない」は、残りの回答をすべて「わからない」にして、その問題の回答を終える(暫定。研究者の決定は未定)。
import { escapeHtml } from "../shared/escape-html.js";
import { createAnswerLock } from "../shared/answer-lock.js";
import { OPTION_SETS } from "./definitions.js";
import { GIVE_UP_RESPONSE_CODE } from "./judge.js";

// 主音(ド・Ⅰ)のコード。上部の表示の「→ ド」と、鍵盤で背を高くする音に使う。
export const TONIC_CODE = "n1";

export const BUTTON_TEXT = { replay: "リプレイ", giveUp: "わからない", next: "次に進む", quit: "中断する" };

// 「中断する」を押したときの確認(研究者の決定の文例。2026-11-15 に「終了」から「中断」へそろえた)。
export const QUIT_CONFIRM_TEXT = {
  title: "訓練を中断しますか?",
  lines: ["途中から再開することはできません。", "完了済みの回答は保存されます。"],
  confirm: "中断する",
  cancel: "続ける",
};

// 正誤の文言(相対音感の練習と同じ言い方)。outcome は "correct" / "incorrect" / "giveup"。
// 「わからない」(giveup)も不正解と同じ文言で正解を示す(研究者の決定: どちらでも正解を提示する)。
export function feedbackLines(outcome, correctLabel) {
  return outcome === "correct" ? ["正解です"] : ["不正解です", `正解は「${correctLabel}」です`];
}

// 複数回答の正誤の文言。1つ目・2つ目…の順に1行ずつ。results: [{ outcome, correctLabel }]
export function multiFeedbackLines(results) {
  return results.map(({ outcome, correctLabel }, index) => (outcome === "correct"
    ? `${index + 1}つ目: 正解です`
    : `${index + 1}つ目: 不正解です(正解は「${correctLabel}」)`));
}

// 上部の表示。回答前(または「わからない」)は「?」。answerLabel は1つ、または回答の数ぶんの配列。
export function promptText(answerLabel, tonicLabel) {
  const labels = Array.isArray(answerLabel) ? answerLabel : [answerLabel];
  return [...labels.map((label) => label ?? "?"), tonicLabel].join(" → ");
}

// 和音の六角形での位置(0=上、時計回りに1〜5)。回答候補の並び(Ⅲ Ⅵ Ⅱ Ⅴ Ⅰ Ⅳ)を、主音(既定Ⅰ)から巡回させる。
export function hexagonPositions(options, tonicCode = TONIC_CODE) {
  const tonicIndex = options.findIndex((option) => option.code === tonicCode);
  return Object.fromEntries(options.map((option, index) => [option.code, (index - tonicIndex + options.length) % options.length]));
}

function labelFor(optionSet, code) {
  return optionSet.options.find((option) => option.code === code)?.label ?? null;
}

// 回答済みのコードの配列(回答順)。state.selectedCodes がなければ、1回答の state.selectedCode から作る。
function selectedCodesOf(state) {
  if (Array.isArray(state.selectedCodes)) return state.selectedCodes;
  return state.selectedCode === null || state.selectedCode === undefined ? [] : [state.selectedCode];
}

// 回答を終えたか(全部答えた、または「わからない」を押した)。
function isAnswerComplete(selectedCodes, targetCount) {
  return selectedCodes.length >= targetCount || selectedCodes.includes(GIVE_UP_RESPONSE_CODE);
}

// 上部の表示の文字列(回答の数ぶんの欄 → 主音)。
function promptFor(optionSet, selectedCodes, targetCount, tonicCode) {
  const labels = Array.from({ length: targetCount }, (_, index) => {
    const code = selectedCodes[index];
    return code === undefined || code === GIVE_UP_RESPONSE_CODE ? null : labelFor(optionSet, code);
  });
  return promptText(labels, labelFor(optionSet, tonicCode));
}

// 正誤の文言。results: [{ outcome, correctAnswerCode }](1回答なら ver.1 と同じ文言)。
function resultLines(optionSet, results) {
  if (!results) return [];
  if (results.length === 1) return feedbackLines(results[0].outcome, labelFor(optionSet, results[0].correctAnswerCode));
  return multiFeedbackLines(results.map(({ outcome, correctAnswerCode }) => ({ outcome, correctLabel: labelFor(optionSet, correctAnswerCode) })));
}

// state: { answerable, selectedCode(1回答) または selectedCodes(回答順の配列),
//          result: { outcome, correctAnswerCode } | null(1回答) または results: [...](複数回答),
//          showNext, nextEnabled, replayEnabled, confirmingQuit }
// heading: 画面の見出し(メニュー名)。省略すると見出しを出さない。
export function buildAnswerScreenHtml({ optionSetRef, activeOptionCodes, progressLabel, state, tonicCode = TONIC_CODE, targetCount = 1, heading = "" }) {
  const optionSet = OPTION_SETS[optionSetRef];
  if (!optionSet) throw new Error(`回答候補「${optionSetRef}」が辞書にありません`);
  const isChord = optionSet.answerFeature === "chordRootDegree";
  const selectedCodes = selectedCodesOf(state);
  const answered = isAnswerComplete(selectedCodes, targetCount);
  const positions = isChord ? hexagonPositions(optionSet.options, tonicCode) : {};

  const buttons = optionSet.options.map((option) => {
    const active = activeOptionCodes.includes(option.code);
    const enabled = active && state.answerable && !answered;
    const classes = [isChord ? "training-chord" : "training-key"];
    if (isChord) classes.push(`training-chord--${option.code}`);
    if (!isChord && option.code === tonicCode) classes.push("training-key--tonic");
    if (!active) classes.push("is-inactive");
    if (selectedCodes.includes(option.code)) classes.push("selected");
    const style = isChord ? ` style="--i:${positions[option.code]}"` : "";
    const name = active ? option.label : `${option.label}(この訓練では使いません)`;
    return `<button type="button" class="${classes.join(" ")}" data-code="${escapeHtml(option.code)}"${style} aria-label="${escapeHtml(name)}"${enabled ? "" : " disabled"}>${escapeHtml(option.label)}</button>`;
  }).join("");

  const lines = resultLines(optionSet, state.results ?? (state.result ? [state.result] : null));
  const toolsEnabled = state.answerable && !answered;
  const nextEnabled = (state.nextEnabled ?? true) && !state.confirmingQuit;

  return `
    <div class="panel training-answer">
      <div class="training-answer-header">
        <div class="training-answer-heading">${heading ? `
          <h2 class="training-answer-title">${escapeHtml(heading)}</h2>` : ""}
          <p class="training-progress">${escapeHtml(progressLabel)}</p>
        </div>
        <button type="button" class="secondary training-quit-button" data-role="quit"${state.confirmingQuit ? " disabled" : ""}>${BUTTON_TEXT.quit}</button>
      </div>
      <div class="notice training-quit-confirm" data-role="quit-confirm" role="alertdialog" aria-label="${escapeHtml(QUIT_CONFIRM_TEXT.title)}"${state.confirmingQuit ? "" : " hidden"}>
        <p class="training-quit-title">${escapeHtml(QUIT_CONFIRM_TEXT.title)}</p>
        ${QUIT_CONFIRM_TEXT.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        <p class="training-quit-actions"><button type="button" class="primary" data-role="quit-yes">${QUIT_CONFIRM_TEXT.confirm}</button><button type="button" class="secondary" data-role="quit-no">${QUIT_CONFIRM_TEXT.cancel}</button></p>
      </div>
      <div class="training-prompt" data-role="prompt">${escapeHtml(promptFor(optionSet, selectedCodes, targetCount, tonicCode))}</div>
      <div class="${isChord ? "training-hexagon" : "training-keyboard"}">${buttons}</div>
      <div class="actions centered training-tools">
        <button type="button" class="secondary" data-role="replay"${(state.replayEnabled ?? toolsEnabled) ? "" : " disabled"}>${BUTTON_TEXT.replay}</button>
        <button type="button" class="secondary" data-role="giveup"${toolsEnabled ? "" : " disabled"}>${BUTTON_TEXT.giveUp}</button>
      </div>
      <div class="training-feedback" data-role="feedback" role="status" aria-live="polite">${feedbackHtml(lines)}</div>
      <div class="actions centered"><button type="button" class="primary" data-role="next"${state.showNext ? "" : " hidden"}${nextEnabled ? "" : " disabled"}>${BUTTON_TEXT.next}</button></div>
    </div>`;
}

function feedbackHtml(lines) {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

// 回答画面を表示する。戻り値の操作で状態を変える。
//   onAnswer(code, { index, complete }): 鍵盤を押したとき(1問に targetCount 回まで)。code は回答候補のコード、
//     または "giveup"(「わからない」)。index は何番目の回答か(0始まり)、complete はその問題の回答を終えたか。
//   onReplay(): 「リプレイ」を押したとき。onNext(): 「次に進む」を押したとき。
//   onQuit(): 「中断する」を押したとき(確認は出さない。呼び出し側が音を止めてから showQuitConfirm を呼ぶ)。
// 戻り値:
//   setAnswerable(enabled): 回答を受け付けるかどうか(音の再生中は受け付けない、など)。
//   setReplayEnabled(enabled): 「リプレイ」を押せるかどうか(null に戻すと、回答の受付に合わせる)。
//   showResult({ outcome, correctAnswerCode, results, showNext, nextEnabled, replayEnabled }): 正誤の文言を表示する。
//     複数回答なら results: [{ outcome, correctAnswerCode }](回答順)を渡す。
//     nextEnabled が偽なら「次に進む」は見えるが押せない(フィードバックの再生中)。
//   setNextEnabled(enabled): 「次に進む」を押せるかどうか。
//   showQuitConfirm({ onConfirm, onCancel }): 終了の確認を出す。確認の間は、他のボタンを押せない。
//     「続ける」で確認を閉じてから onCancel、「中断する」(確認の中のボタン)で onConfirm を呼ぶ。
//   destroy(): 以後の操作を無視する。
// 画面は最初に1回だけ作り、その後は必要な部分(ボタンの押せる/押せない・選択中の印・上部の表示・正誤の文言・
// 「次に進む」の表示)だけを書き換える。描き直すと、外枠 .panel のフェードイン(styles.css)が毎回やり直され、
// 音の再生のたびにボタンが一瞬消えて見えるため(2026-10-27 の確認で判明)。
export function mountAnswerScreen({ screenEl, optionSetRef, activeOptionCodes, progressLabel, heading = "", tonicCode = TONIC_CODE, targetCount = 1, onAnswer = () => {}, onReplay = () => {}, onNext = () => {}, onQuit = () => {} }) {
  const optionSet = OPTION_SETS[optionSetRef];
  // 回答の欄ごとに「最初の1回だけ受け付ける」ロック(二度押しで次の欄まで埋まらないようにする)。
  const locks = Array.from({ length: targetCount }, () => createAnswerLock());
  const state = { answerable: false, selectedCodes: [], results: null, showNext: false, nextEnabled: true, replayEnabled: null, confirmingQuit: false };
  let quitHandlers = null; // 確認を出している間の { onConfirm, onCancel }
  let destroyed = false;

  screenEl.innerHTML = buildAnswerScreenHtml({ optionSetRef, activeOptionCodes, progressLabel, state, tonicCode, targetCount, heading });
  const optionButtons = [...screenEl.querySelectorAll("[data-code]")];
  const promptEl = screenEl.querySelector('[data-role="prompt"]');
  const feedbackEl = screenEl.querySelector('[data-role="feedback"]');
  const replayButton = screenEl.querySelector('[data-role="replay"]');
  const giveUpButton = screenEl.querySelector('[data-role="giveup"]');
  const nextButton = screenEl.querySelector('[data-role="next"]');
  const quitButton = screenEl.querySelector('[data-role="quit"]');
  const quitConfirmEl = screenEl.querySelector('[data-role="quit-confirm"]');
  const quitYesButton = screenEl.querySelector('[data-role="quit-yes"]');
  const quitNoButton = screenEl.querySelector('[data-role="quit-no"]');

  function update() {
    const answered = isAnswerComplete(state.selectedCodes, targetCount);
    const answerable = state.answerable && !state.confirmingQuit;
    for (const button of optionButtons) {
      const code = button.dataset.code;
      button.disabled = !(activeOptionCodes.includes(code) && answerable && !answered);
      button.classList.toggle("selected", state.selectedCodes.includes(code));
    }
    promptEl.textContent = promptFor(optionSet, state.selectedCodes, targetCount, tonicCode);
    const toolsEnabled = answerable && !answered;
    replayButton.disabled = state.confirmingQuit || !(state.replayEnabled ?? toolsEnabled);
    giveUpButton.disabled = !toolsEnabled;
    feedbackEl.innerHTML = feedbackHtml(resultLines(optionSet, state.results));
    const nextUsable = state.showNext && state.nextEnabled && !state.confirmingQuit;
    const nextWasUsable = !nextButton.hidden && !nextButton.disabled;
    nextButton.hidden = !state.showNext;
    nextButton.disabled = !nextUsable;
    if (nextUsable && !nextWasUsable) nextButton.focus();
    quitButton.disabled = state.confirmingQuit;
    quitConfirmEl.hidden = !state.confirmingQuit;
  }

  function answer(code) {
    const index = state.selectedCodes.length;
    if (destroyed || !state.answerable || state.confirmingQuit || index >= targetCount || !locks[index].tryLock()) return;
    state.selectedCodes = [...state.selectedCodes, code];
    const complete = isAnswerComplete(state.selectedCodes, targetCount);
    update();
    onAnswer(code, { index, complete });
  }

  for (const button of optionButtons) button.addEventListener("click", () => answer(button.dataset.code));
  giveUpButton.addEventListener("click", () => answer(GIVE_UP_RESPONSE_CODE));
  replayButton.addEventListener("click", () => { if (!destroyed) onReplay(); });
  nextButton.addEventListener("click", () => { if (!destroyed) onNext(); });
  quitButton.addEventListener("click", () => { if (!destroyed && !state.confirmingQuit) onQuit(); });
  quitYesButton.addEventListener("click", () => {
    if (destroyed || !quitHandlers) return;
    quitHandlers.onConfirm();
  });
  quitNoButton.addEventListener("click", () => {
    if (destroyed || !quitHandlers) return;
    const { onCancel } = quitHandlers;
    quitHandlers = null;
    state.confirmingQuit = false;
    update();
    onCancel();
  });

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
    showResult({ outcome, correctAnswerCode, results = null, showNext = false, nextEnabled = true, replayEnabled = null }) {
      if (destroyed) return;
      state.results = results ?? [{ outcome, correctAnswerCode }];
      state.showNext = showNext;
      state.nextEnabled = nextEnabled;
      state.replayEnabled = replayEnabled;
      update();
    },
    setNextEnabled(enabled) {
      if (destroyed) return;
      state.nextEnabled = enabled;
      update();
    },
    showQuitConfirm({ onConfirm = () => {}, onCancel = () => {} } = {}) {
      if (destroyed) return;
      quitHandlers = { onConfirm, onCancel };
      state.confirmingQuit = true;
      update();
      quitNoButton.focus();
    },
    destroy() {
      destroyed = true;
    },
  };
}
