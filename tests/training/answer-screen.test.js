import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFakeDom } from "./helpers/fake-dom.js";
import {
  buildAnswerScreenHtml,
  mountAnswerScreen,
  hexagonPositions,
  promptText,
  feedbackLines,
  BUTTON_TEXT,
  QUIT_CONFIRM_TEXT,
} from "../../src/training/answer-screen.js";
import { OPTION_SETS } from "../../src/training/definitions.js";

const IDLE = { answerable: false, selectedCode: null, result: null, showNext: false, replayEnabled: null };
const MELODY = { optionSetRef: "melody-keyboard", activeOptionCodes: ["n7", "n1", "n2"], progressLabel: "1 / 15" };
const CHORD = { optionSetRef: "chord-root-degrees", activeOptionCodes: ["n1", "n5"], progressLabel: "1 / 15" };

const keyButtons = (html) => [...html.matchAll(/<button type="button" class="([^"]*)" data-code="([^"]+)"([^>]*)>([^<]*)<\/button>/g)]
  .map(([, classes, code, rest, label]) => ({ classes: classes.split(" "), code, disabled: /\sdisabled/.test(rest), label, rest }));

function mount(options = MELODY) {
  const screenEl = createFakeDom();
  const calls = [];
  const screen = mountAnswerScreen({
    screenEl,
    ...options,
    onAnswer: (code) => calls.push(["answer", code]),
    onReplay: () => calls.push(["replay"]),
    onNext: () => calls.push(["next"]),
    onQuit: () => calls.push(["quit"]),
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
  assert.deepEqual(feedbackLines("giveup", "ミ"), ["不正解です", "正解は「ミ」です"], "「わからない」も正解を示す");
});

test("単音の鍵盤: ソ ラ シ ド レ ミ ファ の横一列。ドだけ背が高い印", () => {
  const html = buildAnswerScreenHtml({ ...MELODY, state: IDLE });
  assert.match(html, /class="training-keyboard"/);
  const keys = keyButtons(html);
  assert.deepEqual(keys.map((key) => key.label), ["ソ", "ラ", "シ", "ド", "レ", "ミ", "ファ"]);
  assert.deepEqual(keys.filter((key) => key.classes.includes("training-key--tonic")).map((key) => key.code), ["n1"]);
  assert.match(html, /<div class="training-prompt" data-role="prompt">\? → ド<\/div>/);
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
  assert.match(html, /<div class="training-prompt" data-role="prompt">\? → Ⅰ<\/div>/);
});

test("和音のボタンは、和音ごとの色の印(training-chord--n1 など)を持ち、ローマ数字を表示する", () => {
  const keys = keyButtons(buildAnswerScreenHtml({ ...CHORD, state: IDLE }));
  for (const key of keys) assert.ok(key.classes.includes(`training-chord--${key.code}`));
  assert.deepEqual(keys.map((key) => key.label), ["Ⅲ", "Ⅵ", "Ⅱ", "Ⅴ", "Ⅰ", "Ⅳ"]);
});

test("回答: 1回だけ受け付け、上部の表示が回答した音に変わり、全ボタンが押せなくなる", () => {
  const { screenEl, screen, calls } = mount();
  screen.setAnswerable(true);
  screenEl.el('[data-code="n2"]').click();
  screenEl.el('[data-code="n7"]')?.click();
  assert.deepEqual(calls, [["answer", "n2"]]);
  assert.equal(screenEl.text('[data-role="prompt"]'), "レ → ド");
  assert.ok(screenEl.querySelectorAll("[data-code]").every((button) => button.disabled));
  assert.ok(screenEl.el('[data-role="giveup"]').disabled);
  assert.ok(screenEl.el('[data-code="n2"]').classList.contains("selected"));
  assert.equal(screenEl.el('[data-code="n7"]').classList.contains("selected"), false);
});

test("回答可能になる前の押下は無視される", () => {
  const { screenEl, calls } = mount();
  screenEl.el('[data-code="n1"]').click();
  assert.deepEqual(calls, []);
});

test("「わからない」: 回答コードは giveup。上部の表示は「?」のまま", () => {
  const { screenEl, screen, calls } = mount();
  screen.setAnswerable(true);
  screenEl.el('[data-role="giveup"]').click();
  assert.deepEqual(calls, [["answer", "giveup"]]);
  assert.equal(screenEl.text('[data-role="prompt"]'), "? → ド");
});

test("正誤の表示: 正解は文言だけ、不正解は文言と「次に進む」(押すと onNext)", () => {
  const correct = mount();
  correct.screen.setAnswerable(true);
  correct.screenEl.el('[data-code="n1"]').click();
  correct.screen.showResult({ outcome: "correct", correctAnswerCode: "n1" });
  assert.equal(correct.screenEl.el('[data-role="feedback"]').innerHTML, "<p>正解です</p>");
  assert.equal(correct.screenEl.el('[data-role="next"]').hidden, true, "正解のときは「次に進む」を出さない");

  const wrong = mount();
  wrong.screen.setAnswerable(true);
  wrong.screenEl.el('[data-code="n2"]').click();
  wrong.screen.showResult({ outcome: "incorrect", correctAnswerCode: "n7", showNext: true, replayEnabled: true });
  assert.equal(wrong.screenEl.el('[data-role="feedback"]').innerHTML, "<p>不正解です</p><p>正解は「シ」です</p>");
  assert.equal(wrong.screenEl.el('[data-role="next"]').hidden, false);
  const next = wrong.screenEl.el('[data-role="next"]');
  assert.equal(next.focused, true, "「次に進む」にフォーカスを移す");
  next.click();
  assert.equal(wrong.screenEl.el('[data-role="replay"]').disabled, false, "不正解のあとは聞き直せる");
  wrong.screenEl.el('[data-role="replay"]').click();
  assert.deepEqual(wrong.calls, [["answer", "n2"], ["next"], ["replay"]]);
});

test("リプレイ: 回答可能なときに押せ、onReplay を呼ぶ", () => {
  const { screenEl, screen, calls } = mount();
  assert.ok(screenEl.el('[data-role="replay"]').disabled);
  screen.setAnswerable(true);
  screenEl.el('[data-role="replay"]').click();
  assert.deepEqual(calls, [["replay"]]);
});

test("destroy 後の操作は無視される", () => {
  const { screenEl, screen, calls } = mount();
  screen.setAnswerable(true);
  screen.destroy();
  screenEl.el('[data-code="n1"]').click();
  screenEl.el('[data-role="replay"]').click();
  assert.deepEqual(calls, []);
});

test("ボタンの文言と、既存のボタンの見た目(secondary / primary)", () => {
  assert.deepEqual(BUTTON_TEXT, { replay: "リプレイ", giveUp: "わからない", next: "次に進む", quit: "訓練を終了する" });
  const html = buildAnswerScreenHtml({ ...MELODY, state: { ...IDLE, showNext: true } });
  assert.match(html, /class="secondary" data-role="replay"/);
  assert.match(html, /class="secondary" data-role="giveup"/);
  assert.match(html, /class="primary" data-role="next">次に進む</);
  assert.match(html, /class="secondary" data-role="quit">訓練を終了する</);
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

test("状態が変わっても画面を作り直さない(音の再生のたびにボタンが消えないように)", () => {
  const { screenEl, screen } = mount();
  assert.equal(screenEl.renders(), 1);
  const before = screenEl.el('[data-code="n1"]');
  screen.setAnswerable(true);
  screen.setReplayEnabled(false);
  screen.setReplayEnabled(true);
  screenEl.el('[data-code="n1"]').click();
  screen.showResult({ outcome: "correct", correctAnswerCode: "n1" });
  assert.equal(screenEl.renders(), 1, "innerHTML への代入は最初の1回だけ");
  assert.equal(screenEl.el('[data-code="n1"]'), before, "ボタンは同じ要素のまま");
});

test("setReplayEnabled: 回答の受付とは別に「リプレイ」を切り替える", () => {
  const { screenEl, screen } = mount();
  screen.setAnswerable(true);
  screen.setReplayEnabled(false);
  assert.equal(screenEl.el('[data-role="replay"]').disabled, true);
  assert.equal(screenEl.el('[data-role="giveup"]').disabled, false);
  screen.setReplayEnabled(null);
  assert.equal(screenEl.el('[data-role="replay"]').disabled, false, "null に戻すと回答の受付に合わせる");
});

test("「次に進む」は最初から置いてあり、表示するまでは hidden", () => {
  const html = buildAnswerScreenHtml({ ...MELODY, state: IDLE });
  assert.match(html, /class="primary" data-role="next" hidden>次に進む</);
});

test("「次に進む」は、見えていても押せない状態にできる(フィードバックの再生中)。押せるようになったらフォーカス", () => {
  const { screenEl, screen, calls } = mount();
  screen.setAnswerable(true);
  screenEl.el('[data-code="n2"]').click();
  screen.showResult({ outcome: "incorrect", correctAnswerCode: "n7", showNext: true, nextEnabled: false, replayEnabled: false });
  const next = screenEl.el('[data-role="next"]');
  assert.equal(next.hidden, false);
  assert.equal(next.disabled, true);
  assert.equal(next.focused, false);
  next.click();
  assert.deepEqual(calls, [["answer", "n2"]]);
  screen.setNextEnabled(true);
  assert.equal(next.disabled, false);
  assert.equal(next.focused, true);
  next.click();
  assert.deepEqual(calls, [["answer", "n2"], ["next"]]);
});

test("終了の確認: 最初は隠れている。文言は決定どおり", () => {
  const html = buildAnswerScreenHtml({ ...MELODY, state: IDLE });
  assert.match(html, /data-role="quit-confirm"[^>]* hidden>/);
  assert.equal(QUIT_CONFIRM_TEXT.title, "訓練を終了しますか?");
  assert.deepEqual(QUIT_CONFIRM_TEXT.lines, ["途中から再開することはできません。", "完了済みの回答は保存されます。"]);
  assert.match(html, /data-role="quit-yes">終了する</);
  assert.match(html, /data-role="quit-no">続ける</);
});

test("終了の確認: 「訓練を終了する」で onQuit。確認の間は他のボタンを押せず、「続ける」で元に戻る", () => {
  const { screenEl, screen, calls } = mount();
  screen.setAnswerable(true);
  screenEl.el('[data-role="quit"]').click();
  assert.deepEqual(calls, [["quit"]]);
  const log = [];
  screen.showQuitConfirm({ onConfirm: () => log.push("confirm"), onCancel: () => log.push("cancel") });
  assert.equal(screenEl.el('[data-role="quit-confirm"]').hidden, false);
  assert.ok(screenEl.el('[data-code="n1"]').disabled);
  assert.ok(screenEl.el('[data-role="replay"]').disabled);
  assert.ok(screenEl.el('[data-role="giveup"]').disabled);
  assert.ok(screenEl.el('[data-role="quit"]').disabled);
  assert.equal(screenEl.el('[data-role="quit-no"]').focused, true, "誤って終了しないよう「続ける」にフォーカス");
  screenEl.el('[data-role="quit-no"]').click();
  assert.deepEqual(log, ["cancel"]);
  assert.equal(screenEl.el('[data-role="quit-confirm"]').hidden, true);
  assert.equal(screenEl.el('[data-code="n1"]').disabled, false);
  assert.equal(screenEl.renders(), 1, "確認の表示でも作り直さない");

  screen.showQuitConfirm({ onConfirm: () => log.push("confirm"), onCancel: () => log.push("cancel") });
  screenEl.el('[data-role="quit-yes"]').click();
  assert.deepEqual(log, ["cancel", "confirm"]);
});
