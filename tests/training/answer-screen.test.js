import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFakeScreen } from "../functional-pitch/helpers/fake-screen.js";
import {
  buildAnswerScreenHtml,
  mountAnswerScreen,
  hexagonPositions,
  promptText,
  feedbackLines,
  BUTTON_TEXT,
} from "../../src/training/answer-screen.js";
import { OPTION_SETS } from "../../src/training/definitions.js";

const IDLE = { answerable: false, selectedCode: null, result: null, showNext: false, replayEnabled: null };
const MELODY = { optionSetRef: "melody-keyboard", activeOptionCodes: ["n7", "n1", "n2"], progressLabel: "1 / 15" };
const CHORD = { optionSetRef: "chord-root-degrees", activeOptionCodes: ["n1", "n5"], progressLabel: "1 / 15" };

const keyButtons = (html) => [...html.matchAll(/<button type="button" class="([^"]*)" data-code="([^"]+)"([^>]*)>([^<]*)<\/button>/g)]
  .map(([, classes, code, rest, label]) => ({ classes: classes.split(" "), code, disabled: /\sdisabled/.test(rest), label, rest }));

function mount(options = MELODY) {
  const screenEl = createFakeScreen();
  const calls = [];
  const screen = mountAnswerScreen({
    screenEl,
    ...options,
    onAnswer: (code) => calls.push(["answer", code]),
    onReplay: () => calls.push(["replay"]),
    onNext: () => calls.push(["next"]),
  });
  return { screenEl, screen, calls };
}

test("上部の表示: 回答前は「? → ド」、回答後は回答した音", () => {
  assert.equal(promptText(null, "ド"), "? → ド");
  assert.equal(promptText("ミ", "ド"), "ミ → ド");
  assert.equal(promptText(null, "Ⅰ"), "? → Ⅰ");
});

test("正誤の文言: 正解は「正解です」、不正解は「不正解です」+「正解は「○」です」", () => {
  assert.deepEqual(feedbackLines("correct", "ミ"), ["正解です"]);
  assert.deepEqual(feedbackLines("incorrect", "ミ"), ["不正解です", "正解は「ミ」です"]);
});

test("単音の鍵盤: ソ ラ シ ド レ ミ ファ の横一列。ドだけ背が高い印", () => {
  const html = buildAnswerScreenHtml({ ...MELODY, state: IDLE });
  assert.match(html, /class="training-keyboard"/);
  const keys = keyButtons(html);
  assert.deepEqual(keys.map((key) => key.label), ["ソ", "ラ", "シ", "ド", "レ", "ミ", "ファ"]);
  assert.deepEqual(keys.filter((key) => key.classes.includes("training-key--tonic")).map((key) => key.code), ["n1"]);
  assert.match(html, /<div class="training-prompt">\? → ド<\/div>/);
});

test("出題に使う音だけ押せる。使わない音は is-inactive で、回答可能になっても押せない", () => {
  const html = buildAnswerScreenHtml({ ...MELODY, state: { ...IDLE, answerable: true } });
  for (const key of keyButtons(html)) {
    const active = MELODY.activeOptionCodes.includes(key.code);
    assert.equal(key.classes.includes("is-inactive"), !active, key.code);
    assert.equal(key.disabled, !active, key.code);
  }
});

test("回答可能になる前は、押せる音も押せない(音の再生中など)", () => {
  const keys = keyButtons(buildAnswerScreenHtml({ ...MELODY, state: IDLE }));
  assert.ok(keys.every((key) => key.disabled));
});

test("和音の六角形: Ⅰが上(0)、時計回りに Ⅰ Ⅳ Ⅲ Ⅵ Ⅱ Ⅴ", () => {
  const positions = hexagonPositions(OPTION_SETS["chord-root-degrees"].options);
  const byPosition = Object.entries(positions).sort((a, b) => a[1] - b[1]).map(([code]) => code);
  assert.deepEqual(byPosition, ["n1", "n4", "n3", "n6", "n2", "n5"]);
  const html = buildAnswerScreenHtml({ ...CHORD, state: IDLE });
  assert.match(html, /class="training-hexagon"/);
  assert.match(html, /data-code="n1" style="--i:0"/);
  assert.match(html, /data-code="n5" style="--i:5"/);
  assert.match(html, /<div class="training-prompt">\? → Ⅰ<\/div>/);
});

test("和音のボタンは、和音ごとの色の印(training-chord--n1 など)を持ち、ローマ数字を表示する", () => {
  const keys = keyButtons(buildAnswerScreenHtml({ ...CHORD, state: IDLE }));
  for (const key of keys) assert.ok(key.classes.includes(`training-chord--${key.code}`));
  assert.deepEqual(keys.map((key) => key.label), ["Ⅲ", "Ⅵ", "Ⅱ", "Ⅴ", "Ⅰ", "Ⅳ"]);
});

test("回答: 1回だけ受け付け、上部の表示が回答した音に変わり、全ボタンが押せなくなる", () => {
  const { screenEl, screen, calls } = mount();
  screen.setAnswerable(true);
  screenEl.button('[data-code="n2"]').click();
  screenEl.button('[data-code="n7"]')?.click();
  assert.deepEqual(calls, [["answer", "n2"]]);
  assert.match(screenEl.innerHTML, /<div class="training-prompt">レ → ド<\/div>/);
  assert.ok(screenEl.querySelectorAll("[data-code]").every((button) => button.disabled));
  assert.ok(screenEl.button('[data-role="giveup"]').disabled);
  assert.match(screenEl.innerHTML, /class="training-key selected" data-code="n2"/);
});

test("回答可能になる前の押下は無視される", () => {
  const { screenEl, calls } = mount();
  screenEl.button('[data-code="n1"]').click();
  assert.deepEqual(calls, []);
});

test("「わからない」: 回答コードは giveup。上部の表示は「?」のまま", () => {
  const { screenEl, screen, calls } = mount();
  screen.setAnswerable(true);
  screenEl.button('[data-role="giveup"]').click();
  assert.deepEqual(calls, [["answer", "giveup"]]);
  assert.match(screenEl.innerHTML, /<div class="training-prompt">\? → ド<\/div>/);
});

test("正誤の表示: 正解は文言だけ、不正解は文言と「次に進む」(押すと onNext)", () => {
  const correct = mount();
  correct.screen.setAnswerable(true);
  correct.screenEl.button('[data-code="n1"]').click();
  correct.screen.showResult({ outcome: "correct", correctAnswerCode: "n1" });
  assert.match(correct.screenEl.innerHTML, /role="status" aria-live="polite"><p>正解です<\/p><\/div>/);
  assert.equal(correct.screenEl.button('[data-role="next"]'), undefined);

  const wrong = mount();
  wrong.screen.setAnswerable(true);
  wrong.screenEl.button('[data-code="n2"]').click();
  wrong.screen.showResult({ outcome: "incorrect", correctAnswerCode: "n7", showNext: true, replayEnabled: true });
  assert.match(wrong.screenEl.innerHTML, /<p>不正解です<\/p><p>正解は「シ」です<\/p>/);
  const next = wrong.screenEl.button('[data-role="next"]');
  assert.equal(next.focused, true, "「次に進む」にフォーカスを移す");
  next.click();
  assert.equal(wrong.screenEl.button('[data-role="replay"]').disabled, false, "不正解のあとは聞き直せる");
  wrong.screenEl.button('[data-role="replay"]').click();
  assert.deepEqual(wrong.calls, [["answer", "n2"], ["next"], ["replay"]]);
});

test("リプレイ: 回答可能なときに押せ、onReplay を呼ぶ", () => {
  const { screenEl, screen, calls } = mount();
  assert.ok(screenEl.button('[data-role="replay"]').disabled);
  screen.setAnswerable(true);
  screenEl.button('[data-role="replay"]').click();
  assert.deepEqual(calls, [["replay"]]);
});

test("destroy 後の操作は無視される", () => {
  const { screenEl, screen, calls } = mount();
  screen.setAnswerable(true);
  screen.destroy();
  screenEl.button('[data-code="n1"]').click();
  screenEl.button('[data-role="replay"]').click();
  assert.deepEqual(calls, []);
});

test("ボタンの文言と、既存のボタンの見た目(secondary / primary)", () => {
  assert.deepEqual(BUTTON_TEXT, { replay: "リプレイ", giveUp: "わからない", next: "次に進む" });
  const html = buildAnswerScreenHtml({ ...MELODY, state: { ...IDLE, showNext: true } });
  assert.match(html, /class="secondary" data-role="replay"/);
  assert.match(html, /class="secondary" data-role="giveup"/);
  assert.match(html, /class="primary" data-role="next">次に進む</);
});

test("styles.css: 和音の6色(決定済み)と、押せない音の点線、正誤用の色を使わない", () => {
  const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  const section = css.slice(css.indexOf("/* ===== 音感訓練の回答画面"));
  const colors = { n1: "#D22421", n4: "#E69F00", n3: "#00855F", n6: "#8A57B0", n2: "#F0E442", n5: "#56B4E9" };
  for (const [code, color] of Object.entries(colors)) {
    assert.match(section, new RegExp(`\\.training-chord--${code} \\{ background: ${color};`));
  }
  assert.match(section, /\.training-key\.is-inactive,\n\.training-chord\.is-inactive \{ background: #eceae4; border-style: dashed;/);
  assert.equal(/correct|incorrect/.test(section.replace(/\/\*[\s\S]*?\*\//g, "")), false, "正誤用のクラスを作らない");
  assert.equal(/--hex-size: [^;]*%/.test(section), false, "六角形の大きさに%を使わない");
});
