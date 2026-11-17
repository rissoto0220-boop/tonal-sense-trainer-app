import { test } from "node:test";
import assert from "node:assert/strict";
import { showHistoryScreen as showRelativeHistory } from "../src/relative-pitch/history-screen.js";
import { showHistoryScreen as showFunctionalHistory } from "../src/functional-pitch/history-screen.js";
import { showHistoryScreen as showTrainingHistory } from "../src/training/history-screen.js";

// 履歴・CSV画面の戻るボタン(2026-11-15 研究者の決定: 説明画面から開いたときは、説明画面へ「戻る」)。
// 画面は document を直接書き換えるため、最小の偽の document で、ボタンの文字と、押したときの呼び出しだけを確かめる。
const SCREENS = [
  ["相対音感", showRelativeHistory, "テスト選択へ戻る"],
  ["機能的音感", showFunctionalHistory, "Key選択へ戻る"],
  ["音感訓練", showTrainingHistory, "メニュー選択へ戻る"],
];

function open(show, options = {}) {
  const listeners = {};
  globalThis.document = {
    getElementById: (id) => ({ checked: false, addEventListener: (type, fn) => { listeners[`${id}:${type}`] = fn; } }),
  };
  const screenEl = { innerHTML: "" };
  const backs = [];
  try {
    show({ screenEl, participantId: "P00001", participantData: { sessions: [] }, onBack: () => backs.push("back"), ...options });
  } finally {
    delete globalThis.document;
  }
  return { html: screenEl.innerHTML, backs, click: () => listeners["back:click"]() };
}

for (const [name, show, defaultLabel] of SCREENS) {
  test(`${name}の履歴: 戻るボタンの文字は、省略すると今までの文字。backLabel を渡すとその文字。押すと onBack`, () => {
    const plain = open(show);
    assert.match(plain.html, new RegExp(`<button id="back" class="primary">${defaultLabel}</button>`));
    const fromIntro = open(show, { backLabel: "戻る" });
    assert.match(fromIntro.html, /<button id="back" class="primary">戻る<\/button>/);
    assert.equal(fromIntro.html.includes(defaultLabel), false);
    fromIntro.click();
    assert.deepEqual(fromIntro.backs, ["back"]);
  });
}

test("戻るボタンの文字は無害化する", () => {
  assert.match(open(showTrainingHistory, { backLabel: "<戻る>" }).html, /<button id="back" class="primary">&lt;戻る&gt;<\/button>/);
});
