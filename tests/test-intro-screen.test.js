import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./training/helpers/fake-dom.js";
import { buildTestIntroHtml, showTestIntroScreen, TEST_INTRO_SCREEN_TEXT } from "../src/shared/test-intro-screen.js";
import { TEST_INTRO_TEXT } from "../src/shared/test-intro-text.js";

function mount({ withHistory = true, lines = ["説明1", "説明2"] } = {}) {
  const calls = [];
  const screenEl = createFakeDom();
  showTestIntroScreen({
    screenEl,
    title: "絶対音感テスト",
    lines,
    onStart: () => calls.push("start"),
    ...(withHistory ? { onShowHistory: () => calls.push("history") } : {}),
    onBack: () => calls.push("back"),
  });
  return { screenEl, calls };
}

test("見出しはテスト名。説明は1文字列ごとに1つの段落", () => {
  const html = buildTestIntroHtml({ title: "絶対音感テスト", lines: ["説明1", "説明2"] });
  assert.match(html, /<h2 tabindex="-1">絶対音感テスト<\/h2>/);
  assert.equal(html.split('class="test-intro-text"').length - 1, 2);
  assert.match(html, /<p class="test-intro-text">説明1<\/p>/);
});

test("ボタンは「始める」「履歴・CSVを見る」「テスト選択へ戻る」の3つ。始めるが主なボタン", () => {
  const html = buildTestIntroHtml({ title: "t", lines: [] });
  assert.match(html, new RegExp(`<button type="button" class="primary" data-role="start">${TEST_INTRO_SCREEN_TEXT.start}</button>`));
  assert.match(html, new RegExp(`data-role="history">${TEST_INTRO_SCREEN_TEXT.history}</button>`));
  assert.match(html, new RegExp(`data-role="back">${TEST_INTRO_SCREEN_TEXT.back}</button>`));
  assert.deepEqual(TEST_INTRO_SCREEN_TEXT, { start: "始める", history: "履歴・CSVを見る", back: "テスト選択へ戻る" });
});

test("各ボタンは、対応するコールバックだけを呼ぶ", () => {
  const { screenEl, calls } = mount();
  screenEl.el('[data-role="history"]').click();
  assert.deepEqual(calls, ["history"]);
  screenEl.el('[data-role="back"]').click();
  assert.deepEqual(calls, ["history", "back"]);
  screenEl.el('[data-role="start"]').click();
  assert.deepEqual(calls, ["history", "back", "start"]);
});

test("画面を出しただけでは、何も始めない。見出しにフォーカスする", () => {
  const { screenEl, calls } = mount();
  assert.deepEqual(calls, []);
  assert.equal(screenEl.el("h2").focused, true);
});

test("onShowHistory がないときは、履歴のボタンを出さない", () => {
  const { screenEl } = mount({ withHistory: false });
  assert.equal(screenEl.innerHTML.includes('data-role="history"'), false);
});

test("説明が空・省略でも壊れない。文字は無害化する", () => {
  assert.doesNotThrow(() => buildTestIntroHtml({ title: "t" }));
  assert.equal(buildTestIntroHtml({ title: "t" }).includes("test-intro-text"), false);
  const html = buildTestIntroHtml({ title: "<t>", lines: ["<b>&"] });
  assert.match(html, /<h2 tabindex="-1">&lt;t&gt;<\/h2>/);
  assert.match(html, /<p class="test-intro-text">&lt;b&gt;&amp;<\/p>/);
});

test("説明の文章(test-intro-text.js)は、4つのテストすべてにあり、空でない文字列の配列", () => {
  for (const id of ["absolute-pitch", "relative-pitch", "functional-pitch", "training"]) {
    const lines = TEST_INTRO_TEXT[id];
    assert.ok(Array.isArray(lines) && lines.length > 0, id);
    for (const line of lines) assert.ok(typeof line === "string" && line.trim() !== "", id);
  }
});
