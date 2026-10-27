import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./helpers/fake-dom.js";
import { showTrainingMenuScreen, buildMenuScreenHtml, MENU_SCREEN_TEXT } from "../../src/training/menu-screen.js";
import { TRAINING_MENUS } from "../../src/training/menus.js";

function mount() {
  const screenEl = createFakeDom();
  const calls = [];
  showTrainingMenuScreen({
    screenEl,
    menus: TRAINING_MENUS,
    onSelect: (menu) => calls.push(["select", menu.menuId]),
    onBack: () => calls.push(["back"]),
  });
  return { screenEl, calls };
}

test("16メニューを、Key C(①〜⑧)と Key ランダム(⑨〜⑯)の2つに分けて並べる", () => {
  const html = buildMenuScreenHtml(TRAINING_MENUS);
  const ids = [...html.matchAll(/data-menu-id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, TRAINING_MENUS.map((menu) => menu.menuId));
  const fixedAt = html.indexOf(">Key C</h3>");
  const randomAt = html.indexOf(">Key ランダム</h3>");
  assert.ok(fixedAt >= 0 && randomAt > fixedAt);
  assert.ok(html.indexOf('data-menu-id="menu-08"') < randomAt && html.indexOf('data-menu-id="menu-09"') > randomAt);
});

test("メニュー名と説明(出題数・Key)を表示する", () => {
  const html = buildMenuScreenHtml(TRAINING_MENUS);
  assert.match(html, /① 単音 シドレの判別\(Key C\)/);
  assert.match(html, /15問・Key C</);
  assert.match(html, /15問・Key はランダム\(C\/Es\/Fis\/A\)</);
  assert.match(html, new RegExp(MENU_SCREEN_TEXT.title));
});

test("テスト選択画面と同じ目次リストのスタイル(test-list・test-button)を使う", () => {
  const html = buildMenuScreenHtml(TRAINING_MENUS);
  assert.equal((html.match(/class="test-list"/g) ?? []).length, 2);
  assert.equal((html.match(/class="test-button"/g) ?? []).length, 16);
});

test("メニューを押すと onSelect にそのメニュー、「テスト選択へ戻る」で onBack", () => {
  const { screenEl, calls } = mount();
  screenEl.el('[data-menu-id="menu-09"]').click();
  screenEl.el('[data-role="back"]').click();
  assert.deepEqual(calls, [["select", "menu-09"], ["back"]]);
  assert.equal(screenEl.el("h2").focused, true, "見出しにフォーカスを移す");
});
