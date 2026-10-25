// 機能的音感測定の試行画面(仕様9・10章)。見た目は数字の押しボタン、中身は項目ごとのラジオボタン。
// 1つのKeyの測定中は、画面全体を作り直さず、試行ごとに中身を初期化する
// (読み上げ機能が、試行のたびに画面全体を読み上げ直さないようにするため)。
import { escapeHtml } from "../shared/escape-html.js";
import { createTrialController } from "./trial-controller.js";
import {
  RATING_ITEMS,
  RATING_MIN,
  RATING_MAX,
  RATING_LOW_LABEL,
  RATING_HIGH_LABEL,
} from "./rating-state.js";

export const PHASE_TEXT = {
  preparing: "音声を準備しています…",
  phrase1: "フレーズ1を再生しています",
  gap: "次のフレーズを再生します",
  phrase2: "フレーズ2を再生しています",
  answerable: "それぞれの印象の変化を回答してください",
};

// 2つの枠(図)の状態の文字。図は色だけに頼らず、塗り・枠の形・この文字の3つで状態を示す。
export const PHRASE_STATE_TEXT = {
  waiting: "待機中",
  playing: "再生中",
  played: "再生済み",
};

// 段階ごとの、フレーズ1・フレーズ2の状態(waiting=待機中 / playing=再生中 / played=再生済み)。
export function phraseStates(phase) {
  switch (phase) {
    case "phrase1": return { phrase1: "playing", phrase2: "waiting" };
    case "gap": return { phrase1: "played", phrase2: "waiting" };
    case "phrase2": return { phrase1: "played", phrase2: "playing" };
    case "answerable": return { phrase1: "played", phrase2: "played" };
    default: return { phrase1: "waiting", phrase2: "waiting" }; // preparing・error
  }
}

export const ERROR_TEXT = {
  load: "音声を読み込めませんでした。ページを再読み込みしてください。",
  duration: "音源の長さが想定と異なります。研究者へお知らせください。",
  schedule: "音声を再生できませんでした。ページを再読み込みしてください。",
};

function buildPhraseBoxHtml(number) {
  return `
        <div class="functional-phrase" data-phrase="${number}" data-state="waiting">
          <span class="functional-phrase__name">フレーズ${number}</span>
          <span class="functional-phrase__state">${escapeHtml(PHRASE_STATE_TEXT.waiting)}</span>
          <span class="functional-playing"><i></i><i></i><i></i></span>
        </div>`;
}

const ratingNumbers = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => RATING_MIN + i);

// 試行画面のHTML文字列を返す(初期状態: 全て無効、選択なし)。
// functional-trial--animated は再生中アニメーションを使うための印で、外せば静止表示になる。
export function buildTrialHtml() {
  const items = RATING_ITEMS.map((item) => `
      <fieldset class="rating-item" data-item="${item.key}" aria-describedby="rating-ends-${item.key}" disabled>
        <legend class="rating-question">${escapeHtml(item.question)}</legend>
        <div class="rating-options">
          ${ratingNumbers.map((n) => `
          <label class="rating-option">
            <input type="radio" name="rating-${item.key}" value="${n}">
            <span class="rating-option__face">${n}</span>
          </label>`).join("")}
        </div>
        <div id="rating-ends-${item.key}" class="rating-ends">
          <span>${escapeHtml(RATING_LOW_LABEL)}</span>
          <span>${escapeHtml(RATING_HIGH_LABEL)}</span>
        </div>
      </fieldset>`).join("");

  return `
    <div class="functional-trial functional-trial--animated" data-phase="preparing">
      <p class="functional-progress" data-role="progress" tabindex="-1"></p>
      <div class="functional-phrases" aria-hidden="true">${buildPhraseBoxHtml(1)}
        <span class="functional-phrases__arrow">→</span>${buildPhraseBoxHtml(2)}
      </div>
      <p class="functional-status" data-role="status" aria-live="off">${escapeHtml(PHASE_TEXT.preparing)}</p>
      <p class="error" data-role="error"></p>
      <p class="functional-visually-hidden" role="status" data-role="announcer"></p>
      ${items}
      <div class="actions centered">
        <button type="button" class="primary" data-role="next" disabled>次の問題へ</button>
      </div>
    </div>`;
}

function createDomView(screenEl) {
  const root = screenEl.querySelector(".functional-trial");
  const role = (name) => root.querySelector(`[data-role="${name}"]`);
  const radios = () => [...root.querySelectorAll(".rating-item input[type=radio]")];
  const setRatingsDisabled = (disabled) => {
    root.querySelectorAll(".rating-item").forEach((fieldset) => { fieldset.disabled = disabled; });
  };

  return {
    reset({ progressLabel, nextLabel }) {
      radios().forEach((radio) => { radio.checked = false; });
      setRatingsDisabled(true);
      role("next").disabled = true;
      role("next").textContent = nextLabel;
      role("progress").textContent = progressLabel;
      role("error").textContent = "";
      role("announcer").textContent = "";
      this.setPhase("preparing");
      // 押した「次の問題へ」が無効になってフォーカスが行方不明にならないよう、先頭へ移す。
      role("progress").focus();
    },
    setPhase(phase) {
      root.dataset.phase = phase;
      role("status").textContent = PHASE_TEXT[phase];
      this.setPhraseStates(phraseStates(phase));
    },
    setPhraseStates(states) {
      for (const number of [1, 2]) {
        const box = root.querySelector(`.functional-phrase[data-phrase="${number}"]`);
        const state = states[`phrase${number}`];
        box.dataset.state = state;
        box.querySelector(".functional-phrase__state").textContent = PHRASE_STATE_TEXT[state];
      }
    },
    setRatingsEnabled(enabled) { setRatingsDisabled(!enabled); },
    setNextEnabled(enabled) { role("next").disabled = !enabled; },
    announceAnswerable() { role("announcer").textContent = PHASE_TEXT.answerable; },
    lockAll() {
      setRatingsDisabled(true);
      role("next").disabled = true;
    },
    showError(kind) {
      const text = ERROR_TEXT[kind] ?? ERROR_TEXT.load;
      role("error").textContent = text;
      role("announcer").textContent = text;
      root.dataset.phase = "error";
      this.setPhraseStates(phraseStates("error"));
    },
  };
}

// screenEl に試行画面を作り、試行を操作する controller(start / destroy)を返す。
// controllerOptions: 時間制御の差し替え(runTrialTimelineFn / timelineOptions)。
export function mountTrialScreen(screenEl, controllerOptions = {}) {
  screenEl.innerHTML = buildTrialHtml();
  const view = createDomView(screenEl);
  const controller = createTrialController({ view, ...controllerOptions });

  screenEl.querySelectorAll(".rating-item").forEach((fieldset) => {
    fieldset.addEventListener("change", (event) => {
      if (event.target.type === "radio") controller.select(fieldset.dataset.item, Number(event.target.value));
    });
  });
  screenEl.querySelector('[data-role="next"]').addEventListener("click", () => controller.next());

  return controller;
}
