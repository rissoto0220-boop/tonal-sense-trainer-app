import { test } from "node:test";
import assert from "node:assert/strict";
import { MENU_TABS, OTHER_TAB, groupMenusByTab, resolveSelectedTabId } from "../../src/training/menu-tabs.js";
import { TRAINING_MENUS } from "../../src/training/menus.js";
import { SAMPLE_MENUS } from "../../src/training/sample-menus.js";

const summary = (groups) => groups.map(({ tab, menus }) => [tab.tabId, menus.map((menu) => menu.menuId)]);
const ids = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `menu-${String(from + i).padStart(2, "0")}`);

test("タブの定義: Key C・Key ランダム・拡張の3つ。tabId は英小文字・数字・ハイフンだけで重複しない", () => {
  assert.deepEqual(MENU_TABS.map((tab) => [tab.tabId, tab.label]), [["key-c", "Key C"], ["key-random", "Key ランダム"], ["samples", "拡張"]]);
  assert.equal(MENU_TABS.find((tab) => tab.tabId === "samples").note, "開発確認用・保存しません");
  const tabIds = [...MENU_TABS, OTHER_TAB].map((tab) => tab.tabId);
  assert.equal(new Set(tabIds).size, tabIds.length);
  for (const tabId of tabIds) assert.match(tabId, /^[a-z0-9-]+$/);
});

test("16メニューは、Key C(①〜⑧)と Key ランダム(⑨〜⑯)に分かれる。サンプルがなければ「拡張」は出ない", () => {
  assert.deepEqual(summary(groupMenusByTab(TRAINING_MENUS)), [["key-c", ids(1, 8)], ["key-random", ids(9, 16)]]);
});

test("サンプルを渡すと、「拡張」のタブに S1〜S4 が入る", () => {
  const groups = groupMenusByTab([...TRAINING_MENUS, ...SAMPLE_MENUS]);
  assert.deepEqual(groups.map(({ tab }) => tab.tabId), ["key-c", "key-random", "samples"]);
  assert.deepEqual(groups[2].menus.map((menu) => menu.menuId), ["sample-01", "sample-02", "sample-03", "sample-04"]);
});

test("各メニューは、最初に当てはまったタブだけに入る(二重に入らない)", () => {
  const tabs = [
    { tabId: "all-c", label: "C", matches: (menu) => menu.keyPolicy.mode === "fixed" },
    { tabId: "everything", label: "全部", matches: () => true },
  ];
  const groups = groupMenusByTab(TRAINING_MENUS, tabs);
  assert.deepEqual(summary(groups), [["all-c", ids(1, 8)], ["everything", ids(9, 16)]]);
});

test("どのタブにも当てはまらないメニューは「その他」に入り、画面から消えない", () => {
  const tabs = [{ tabId: "key-c", label: "Key C", matches: (menu) => menu.keyPolicy.mode === "fixed" }];
  const groups = groupMenusByTab(TRAINING_MENUS, tabs);
  assert.deepEqual(summary(groups), [["key-c", ids(1, 8)], ["other", ids(9, 16)]]);
  assert.equal(groups[1].tab.label, "その他");
});

test("タブの配列を差し替えると、タブの数と順番がそのとおりに変わる(増減・並べ替え)", () => {
  const reversed = [...MENU_TABS].reverse();
  assert.deepEqual(groupMenusByTab([...TRAINING_MENUS, ...SAMPLE_MENUS], reversed).map(({ tab }) => tab.tabId), ["samples", "key-random", "key-c"]);
  const four = [
    ...MENU_TABS.slice(0, 2),
    { tabId: "chords", label: "和音", matches: (menu) => menu.taskTemplateRef.startsWith("tt-chord") },
    MENU_TABS[2],
  ];
  // 「和音」は Key C・Key ランダムより後ろなので、ver.1 の和音メニューは先のタブに入る。サンプルの和音は「拡張」より前の「和音」に入る
  const groups = groupMenusByTab([...TRAINING_MENUS, ...SAMPLE_MENUS], four);
  assert.deepEqual(groups.map(({ tab }) => tab.tabId), ["key-c", "key-random", "chords", "samples"]);
  assert.deepEqual(groups[2].menus.map((menu) => menu.menuId), ["sample-02", "sample-04"]);
});

test("メニューが0個のときは、タブも0個", () => {
  assert.deepEqual(groupMenusByTab([]), []);
});

test("最初に開くタブ: 指定があればそれ、なければ・見つからなければ最初のタブ、タブがなければ null", () => {
  const groups = groupMenusByTab([...TRAINING_MENUS, ...SAMPLE_MENUS]);
  assert.equal(resolveSelectedTabId(groups, "samples"), "samples");
  assert.equal(resolveSelectedTabId(groups, null), "key-c");
  assert.equal(resolveSelectedTabId(groupMenusByTab(TRAINING_MENUS), "samples"), "key-c");
  assert.equal(resolveSelectedTabId([], "key-c"), null);
});
