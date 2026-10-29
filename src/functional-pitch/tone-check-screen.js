// 機能的音感測定の音色確認の画面(仕様13章)。
import { escapeHtml } from "../shared/escape-html.js";
import { createToneCheckController } from "./tone-check-controller.js";
import { TONE_CHECK_PARTS } from "./stimuli.js";

export const PART_LABEL = { recorder: "リコーダー", piano: "ピアノ" };

// 状態は色だけに頼らず、文字と枠の形で示す(✓は回答の選択中の印と紛らわしいので使わない)。
export const PART_STATE_TEXT = { idle: "未再生", playing: "再生中", played: "再生済み" };

export const TONE_CHECK_ERROR_TEXT = "音声を読み込めませんでした。ページを再読み込みしてください。";

// 音色確認画面のHTML文字列を返す(初期状態: どちらも未再生、「練習へ進む」は無効)。
export function buildToneCheckHtml() {
  const items = TONE_CHECK_PARTS.map((part) => `
      <li class="functional-tone-item" data-part="${part}" data-state="idle">
        <button type="button" class="secondary" data-role="play" data-part="${part}">${escapeHtml(PART_LABEL[part])}の音を聴く</button>
        <span class="functional-tone-state" data-role="state">${escapeHtml(PART_STATE_TEXT.idle)}</span>
      </li>`).join("");

  return `
    <div class="panel functional-tone-check">
      <h2>音色の確認</h2>
      <p>この測定では、リコーダーとピアノが一緒に鳴る短いフレーズを聴きます。まず、それぞれの楽器の音を1回ずつ聴いてください。何度でも聴けます。</p>
      <ul class="functional-tone-list">${items}
      </ul>
      <p class="error" data-role="error"></p>
      <p class="functional-visually-hidden" role="status" data-role="announcer"></p>
      <div class="actions">
        <button type="button" class="primary" data-role="proceed" disabled>練習へ進む</button>
      </div>
    </div>`;
}

function createDomView(screenEl) {
  const role = (name) => screenEl.querySelector(`[data-role="${name}"]`);
  const item = (part) => screenEl.querySelector(`.functional-tone-item[data-part="${part}"]`);
  const playButtons = () => [...screenEl.querySelectorAll('[data-role="play"]')];

  return {
    setPartState(part, state) {
      const el = item(part);
      el.dataset.state = state;
      el.querySelector('[data-role="state"]').textContent = PART_STATE_TEXT[state];
      if (state === "played") role("announcer").textContent = `${PART_LABEL[part]}の再生が終わりました`;
    },
    setPlayEnabled(enabled) { playButtons().forEach((button) => { button.disabled = !enabled; }); },
    setProceedEnabled(enabled) {
      role("proceed").disabled = !enabled;
      if (enabled) role("announcer").textContent = "両方の音を聴きました。「練習へ進む」を押せます";
    },
    showError() {
      role("error").textContent = TONE_CHECK_ERROR_TEXT;
      role("announcer").textContent = TONE_CHECK_ERROR_TEXT;
    },
  };
}

// screenEl に音色確認画面を作り、controller(destroy を持つ)を返す。
// onProceed: 両方を聴き終えて「練習へ進む」を押したときに呼ぶ(音は止めてから呼ぶ)。
// onError({ kind, error }): 音声エラー時に呼ぶ。
// controllerOptions: 時計・音声の差し替え(テスト・開発用ページ向け)。
export function runToneCheck({ screenEl, onProceed, onError = () => {}, controllerOptions = {} }) {
  screenEl.innerHTML = buildToneCheckHtml();
  const controller = createToneCheckController({ view: createDomView(screenEl), onError, ...controllerOptions });

  screenEl.querySelectorAll('[data-role="play"]').forEach((button) => {
    button.addEventListener("click", () => controller.play(button.dataset.part));
  });
  screenEl.querySelector('[data-role="proceed"]').addEventListener("click", () => {
    if (!controller.hasHeardBoth()) return;
    controller.destroy(); // 聴き直しの途中でも、音を止めてから進む
    onProceed();
  });

  return controller;
}
