import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./training/helpers/fake-dom.js";
import { showTestSelectionScreen, buildTestSelectionHtml, TEST_SELECTION_TEXT } from "../src/shared/test-selection-screen.js";

// 画面の部品は screenEl から探す(2026-11-14 に document.getElementById から変更)ので、偽の画面で確かめられる。
// 2026-11-15: テスト選択は名前だけ。説明・「履歴・CSVを見る」は説明画面(test-intro-screen.js)へ移した。
function makeTests() {
  return [
    { id: "absolute-pitch", title: "絶対音感テスト", available: true },
    { id: "relative-pitch", title: "相対音感テスト", available: true },
    { id: "functional-pitch", title: "機能的音感テスト", available: false },
    { id: "training", title: "音感訓練", available: true },
  ];
}

function mount() {
  const calls = [];
  const screenEl = createFakeDom();
  showTestSelectionScreen({
    screenEl,
    participantId: "P00001",
    tests: makeTests(),
    onSelect: (selected) => calls.push(["select", selected.id]),
    onChangeParticipant: () => calls.push(["change"]),
  });
  return { screenEl, calls };
}

test("見出し・参加者ID・テストの一覧。選べないテストは「準備中」で押せない", () => {
  const html = buildTestSelectionHtml({ participantId: "P00001", tests: makeTests() });
  assert.match(html, new RegExp(`<h2>${TEST_SELECTION_TEXT.title}</h2>`));
  assert.match(html, /参加者ID: P00001/);
  assert.match(html, /id="test-functional-pitch" class="test-button" data-test-id="functional-pitch" disabled>/);
  assert.match(html, /<span class="test-badge">準備中<\/span>/);
});

test("テストの名前だけを出す。説明の文章と「履歴・CSVを見る」は出さない", () => {
  const html = buildTestSelectionHtml({ participantId: "P00001", tests: makeTests() });
  assert.equal(html.includes("test-description"), false);
  assert.equal(html.includes("data-history-test"), false);
  assert.equal(html.includes("履歴・CSV"), false);
  assert.equal(TEST_SELECTION_TEXT.history, undefined);
});

test("テストを押すと onSelect(そのテスト)を呼ぶ(テストはまだ始めない)。選べないテストは押しても何も起きない", () => {
  const { screenEl, calls } = mount();
  screenEl.el('[data-test-id="relative-pitch"]').click();
  screenEl.el('[data-test-id="functional-pitch"]').click();
  screenEl.el('[data-test-id="training"]').click();
  assert.deepEqual(calls, [["select", "relative-pitch"], ["select", "training"]]);
});

test("「参加者IDを変更する」で onChangeParticipant", () => {
  const { screenEl, calls } = mount();
  screenEl.el('[data-role="change-participant"]').click();
  assert.deepEqual(calls, [["change"]]);
});

test("文字は無害化する", () => {
  const html = buildTestSelectionHtml({ participantId: "<P>", tests: [{ id: "x", title: "<t>", available: true }] });
  assert.match(html, /参加者ID: &lt;P&gt;/);
  assert.match(html, /<span class="test-title">&lt;t&gt;<\/span>/);
});
