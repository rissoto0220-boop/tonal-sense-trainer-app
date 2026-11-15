import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./training/helpers/fake-dom.js";
import { showTestSelectionScreen, buildTestSelectionHtml, TEST_SELECTION_TEXT } from "../src/shared/test-selection-screen.js";

// 画面の部品は screenEl から探す(2026-11-14 に document.getElementById から変更)ので、偽の画面で確かめられる。
function makeTests(calls) {
  const entry = (id, title, available, withHistory = true) => ({
    id, title, description: `${title}の説明`, available,
    onStart: () => calls.push(["start", id]),
    ...(withHistory ? { onShowHistory: () => calls.push(["history", id]) } : {}),
  });
  return [
    entry("absolute-pitch", "絶対音感テスト", true),
    entry("relative-pitch", "相対音感テスト", true),
    entry("functional-pitch", "機能的音感テスト", false),
    entry("training", "音感訓練", true, false),
  ];
}

function mount() {
  const calls = [];
  const screenEl = createFakeDom();
  showTestSelectionScreen({ screenEl, participantId: "P00001", tests: makeTests(calls), onChangeParticipant: () => calls.push(["change"]) });
  return { screenEl, calls };
}

test("見出し・参加者ID・テストの一覧。選べないテストは「準備中」で押せない", () => {
  const html = buildTestSelectionHtml({ participantId: "P00001", tests: makeTests([]) });
  assert.match(html, new RegExp(`<h2>${TEST_SELECTION_TEXT.title}</h2>`));
  assert.match(html, /参加者ID: P00001/);
  assert.match(html, /id="test-functional-pitch" class="test-button" data-test-id="functional-pitch" disabled>/);
  assert.match(html, /<span class="test-badge">準備中<\/span>/);
});

test("「履歴・CSVを見る」は、選べるテストで onShowHistory があるときだけ出す", () => {
  const { screenEl } = mount();
  const historyIds = screenEl.querySelectorAll("[data-history-test]").map((el) => el.dataset.historyTest);
  assert.deepEqual(historyIds, ["absolute-pitch", "relative-pitch"], "準備中のテストと、onShowHistory のないテストには出さない");
});

test("「履歴・CSVを見る」には、どのテストのものか分かる読み上げ用の名前を付ける", () => {
  const { screenEl } = mount();
  assert.equal(screenEl.el('[data-history-test="relative-pitch"]').getAttribute("aria-label"), "相対音感テストの履歴・CSVを見る");
  assert.equal(screenEl.text('[data-history-test="relative-pitch"]'), "履歴・CSVを見る");
});

test("「履歴・CSVを見る」を押すと、そのテストの onShowHistory だけを呼ぶ(テストは始めない)", () => {
  const { screenEl, calls } = mount();
  screenEl.el('[data-history-test="absolute-pitch"]').click();
  assert.deepEqual(calls, [["history", "absolute-pitch"]]);
});

test("テストを押すと onStart、「参加者IDを変更する」で onChangeParticipant。選べないテストは押しても何も起きない", () => {
  const { screenEl, calls } = mount();
  screenEl.el('[data-test-id="relative-pitch"]').click();
  screenEl.el('[data-test-id="functional-pitch"]').click();
  screenEl.el('[data-role="change-participant"]').click();
  assert.deepEqual(calls, [["start", "relative-pitch"], ["change"]]);
});

test("文字は無害化する", () => {
  const html = buildTestSelectionHtml({ participantId: "<P>", tests: [{ id: "x", title: "<t>", description: "&", available: true, onStart() {}, onShowHistory() {} }] });
  assert.match(html, /参加者ID: &lt;P&gt;/);
  assert.match(html, /aria-label="&lt;t&gt;の履歴・CSVを見る"/);
});
