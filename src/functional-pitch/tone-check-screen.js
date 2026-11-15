// 機能的音感測定の音色確認の画面(仕様13章)。
import { escapeHtml } from "../shared/escape-html.js";
import { createToneCheckController } from "./tone-check-controller.js";
import { TONE_CHECK_PARTS } from "./stimuli.js";

export const PART_LABEL = { recorder: "リコーダー", piano: "ピアノ" };
export const PLAY_BUTTON_TEXT = (part) => `${PART_LABEL[part]}の音を聴く`;
export const PLAYING_BUTTON_TEXT = (part) => `${PART_LABEL[part]}の音を再生中…`;

// 状態は、ボタンの横の丸い印で示す(聴く前=空の点線の丸、再生中=青の塗り、聴き終えた=✓の丸。2026-11-15 研究者の決定)。
// 色だけに頼らず、丸の形(点線/実線)と✓でも区別する。画面読み上げ向けに、見えない文字(PART_STATE_TEXT)も丸の中に置く。
// ✓は評定ボタンの選択中の印と形が近いが、こちらは丸で囲み、ボタンの横に置くので区別できる。
export const PART_STATE_TEXT = { idle: "未再生", playing: "再生中", played: "再生済み" };
export const PART_MARK = { idle: "", playing: "", played: "✓" };

// 画面の中に一瞬出るエラー文。すぐにテスト選択へ戻れるエラー画面に切り替わるため、「再読み込み」を促さない(2026-11-14)。
export const TONE_CHECK_ERROR_TEXT = "音声を読み込めませんでした。";

// 音色確認画面のHTML文字列を返す(初期状態: どちらも未再生、「練習へ進む」は無効)。
export function buildToneCheckHtml() {
  const items = TONE_CHECK_PARTS.map((part) => `
      <li class="functional-tone-item" data-part="${part}" data-state="idle">
        <button type="button" class="secondary" data-role="play" data-part="${part}">${escapeHtml(PLAY_BUTTON_TEXT(part))}</button>
        <span class="functional-tone-state" data-role="state"><span class="functional-tone-mark" data-role="mark" aria-hidden="true">${PART_MARK.idle}</span><span class="functional-visually-hidden" data-role="state-text">${escapeHtml(PART_STATE_TEXT.idle)}</span></span>
      </li>`).join("");

  return `
    <div class="panel functional-tone-check">
      <h2>音色の確認</h2>
      <p>リコーダーとピアノが一緒に鳴るフレーズを聴きます。まず各楽器の音を聴いてください(何度でも聴けます)。</p>
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
      el.querySelector('[data-role="mark"]').textContent = PART_MARK[state];
      el.querySelector('[data-role="state-text"]').textContent = PART_STATE_TEXT[state];
      // 再生中は、ボタンの文字も「再生中…」にする(終われば元に戻す)。
      const button = el.querySelector('[data-role="play"]');
      button.textContent = state === "playing" ? PLAYING_BUTTON_TEXT(part) : PLAY_BUTTON_TEXT(part);
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
