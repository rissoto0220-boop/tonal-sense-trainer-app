import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./helpers/fake-dom.js";
import { showTrainingMenuScreen, buildMenuScreenHtml, nextTabIndex, MENU_SCREEN_TEXT } from "../../src/training/menu-screen.js";
import { TRAINING_MENUS } from "../../src/training/menus.js";
import { SAMPLE_MENUS } from "../../src/training/sample-menus.js";

const ALL_MENUS = [...TRAINING_MENUS, ...SAMPLE_MENUS];

function mount(options = {}) {
  const screenEl = createFakeDom();
  const calls = [];
  showTrainingMenuScreen({
    screenEl,
    menus: TRAINING_MENUS,
    onSelect: (menu) => calls.push(["select", menu.menuId]),
    onShowHistory: () => calls.push(["history"]),
    onShowScoreChart: () => calls.push(["score-chart"]),
    onTabChange: (tabId) => calls.push(["tab", tabId]),
    onBack: () => calls.push(["back"]),
    ...options,
  });
  const tab = (tabId) => screenEl.el(`[data-tab-id="${tabId}"]`);
  const panel = (tabId) => screenEl.el(`[data-panel-id="${tabId}"]`);
  const selectedTabs = () => screenEl.querySelectorAll("[data-tab-id]").filter((el) => el.getAttribute("aria-selected") === "true").map((el) => el.dataset.tabId);
  const visiblePanels = () => screenEl.querySelectorAll("[data-panel-id]").filter((el) => !el.hidden).map((el) => el.dataset.panelId);
  return { screenEl, calls, tab, panel, selectedTabs, visiblePanels };
}

// --- HTML ---

test("タブの列: 16メニューなら「Key C」「Key ランダム」の2タブ。WAI-ARIA のタブの役割を持つ", () => {
  const html = buildMenuScreenHtml(TRAINING_MENUS);
  assert.match(html, /role="tablist" aria-label="メニューの種類"/);
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*data-tab-id="([^"]+)"[^>]*>([^<]+)<\/button>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(tabs, [["key-c", "Key C"], ["key-random", "Key ランダム"]]);
  assert.match(html, /id="training-tab-key-c" aria-controls="training-tabpanel-key-c" aria-selected="true" tabindex="0"/);
  assert.match(html, /id="training-tab-key-random" aria-controls="training-tabpanel-key-random" aria-selected="false" tabindex="-1"/);
  assert.match(html, /role="tabpanel" id="training-tabpanel-key-c" aria-labelledby="training-tab-key-c" data-role="tab-panel" data-panel-id="key-c">/);
  assert.match(html, /data-panel-id="key-random" hidden>/);
});

test("一覧: 全16メニューを、タブごとの一覧に、メニューの順で並べる(①〜⑧が Key C、⑨〜⑯が Key ランダム)", () => {
  const html = buildMenuScreenHtml(TRAINING_MENUS);
  const ids = [...html.matchAll(/data-menu-id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, TRAINING_MENUS.map((menu) => menu.menuId));
  const randomPanelAt = html.indexOf('data-panel-id="key-random"');
  assert.ok(html.indexOf('data-menu-id="menu-08"') < randomPanelAt && html.indexOf('data-menu-id="menu-09"') > randomPanelAt);
});

test("メニュー名と説明(出題数・Key)を表示する。目次リストのスタイル(test-list・test-button)を使う", () => {
  const html = buildMenuScreenHtml(TRAINING_MENUS);
  assert.match(html, /① 単音 シドレの判別\(Key C\)/);
  assert.match(html, /15問・Key C</);
  assert.match(html, /15問・Key はランダム\(C\/Es\/Fis\/A\)</);
  assert.match(html, new RegExp(MENU_SCREEN_TEXT.title));
  assert.equal((html.match(/class="test-list"/g) ?? []).length, 2);
  assert.equal((html.match(/class="test-button"/g) ?? []).length, 16);
});

test("サンプルを渡すと「拡張」のタブが増え、その一覧の先頭に注意書きを出す", () => {
  const html = buildMenuScreenHtml(ALL_MENUS);
  assert.match(html, /data-tab-id="samples">拡張<\/button>/);
  const panelAt = html.indexOf('data-panel-id="samples"');
  assert.ok(html.indexOf("開発確認用・保存しません") > panelAt);
  assert.ok(html.indexOf("開発確認用・保存しません") < html.indexOf('data-menu-id="sample-01"'));
  assert.equal(buildMenuScreenHtml(TRAINING_MENUS).includes("開発確認用・保存しません"), false);
});

test("selectedTabId で開いておくタブを選べる。見つからなければ最初のタブ", () => {
  const html = buildMenuScreenHtml(ALL_MENUS, { selectedTabId: "samples" });
  assert.match(html, /id="training-tab-samples" aria-controls="training-tabpanel-samples" aria-selected="true"/);
  assert.match(html, /data-panel-id="key-c" hidden>/);
  assert.match(buildMenuScreenHtml(TRAINING_MENUS, { selectedTabId: "samples" }), /id="training-tab-key-c" aria-controls="training-tabpanel-key-c" aria-selected="true"/);
});

test("タブが1つだけなら、タブの列を出さず一覧だけを出す(tabpanel の役割も付けない)", () => {
  const html = buildMenuScreenHtml(TRAINING_MENUS.slice(0, 8));
  assert.equal(html.includes('role="tablist"'), false);
  assert.equal(html.includes('role="tabpanel"'), false);
  assert.equal(html.includes(" hidden"), false);
  assert.equal((html.match(/class="test-button"/g) ?? []).length, 8);
});

test("タブの定義を差し替えると、その数と順でタブが並ぶ", () => {
  const tabs = [
    { tabId: "melody", label: "単音", matches: (menu) => menu.taskTemplateRef.startsWith("tt-melody") },
    { tabId: "chord", label: "和音", matches: (menu) => menu.taskTemplateRef.startsWith("tt-chord") },
  ];
  const html = buildMenuScreenHtml(TRAINING_MENUS, { tabs });
  const tabIds = [...html.matchAll(/role="tab"[^>]*data-tab-id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(tabIds, ["melody", "chord"]);
});

// --- 操作 ---

test("タブを押すと、そのタブの一覧だけが見え、onTabChange が呼ばれる。画面は描き直さない", () => {
  const { screenEl, calls, tab, selectedTabs, visiblePanels } = mount({ menus: ALL_MENUS });
  assert.deepEqual(selectedTabs(), ["key-c"]);
  assert.deepEqual(visiblePanels(), ["key-c"]);
  tab("samples").click();
  assert.deepEqual(selectedTabs(), ["samples"]);
  assert.deepEqual(visiblePanels(), ["samples"]);
  assert.equal(tab("samples").getAttribute("tabindex"), "0");
  assert.equal(tab("key-c").getAttribute("tabindex"), "-1");
  tab("samples").click(); // 開いているタブをもう一度押しても、通知しない
  assert.deepEqual(calls, [["tab", "samples"]]);
  assert.equal(screenEl.renders(), 1, "切り替えで画面を作り直さない(ちらつき防止)");
});

test("矢印キー・Home・End で隣のタブに移り、そのタブを開いてフォーカスを移す(端は反対の端へ回る)", () => {
  const { calls, tab, selectedTabs } = mount({ menus: ALL_MENUS });
  const event = tab("key-c").keydown("ArrowRight");
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(selectedTabs(), ["key-random"]);
  assert.equal(tab("key-random").focused, true);
  tab("key-random").keydown("End");
  assert.deepEqual(selectedTabs(), ["samples"]);
  tab("samples").keydown("ArrowRight");
  assert.deepEqual(selectedTabs(), ["key-c"]);
  tab("key-c").keydown("ArrowLeft");
  assert.deepEqual(selectedTabs(), ["samples"]);
  tab("samples").keydown("Home");
  assert.deepEqual(selectedTabs(), ["key-c"]);
  assert.equal(tab("key-c").keydown("Enter").defaultPrevented, false, "対象外のキーは止めない");
  assert.deepEqual(calls.map(([, tabId]) => tabId), ["key-random", "samples", "key-c", "samples", "key-c"]);
});

test("nextTabIndex: 左右の矢印は隣へ(端は回る)、Home・End は端へ、それ以外は null", () => {
  assert.equal(nextTabIndex("ArrowRight", 0, 3), 1);
  assert.equal(nextTabIndex("ArrowRight", 2, 3), 0);
  assert.equal(nextTabIndex("ArrowLeft", 0, 3), 2);
  assert.equal(nextTabIndex("Home", 2, 3), 0);
  assert.equal(nextTabIndex("End", 0, 3), 2);
  assert.equal(nextTabIndex("Tab", 0, 3), null);
});

test("initialTabId のタブを開いた状態で始まる(訓練から戻ったとき用)。始めたときは onTabChange を呼ばない", () => {
  const { calls, selectedTabs, visiblePanels } = mount({ menus: ALL_MENUS, initialTabId: "samples" });
  assert.deepEqual(selectedTabs(), ["samples"]);
  assert.deepEqual(visiblePanels(), ["samples"]);
  assert.deepEqual(calls, []);
});

test("メニューを押すと onSelect にそのメニュー、「履歴・CSVを見る」で onShowHistory、「テスト選択へ戻る」で onBack", () => {
  const { screenEl, calls } = mount();
  screenEl.el('[data-menu-id="menu-09"]').click();
  assert.match(screenEl.text('[data-role="history"]'), new RegExp(MENU_SCREEN_TEXT.history));
  screenEl.el('[data-role="history"]').click();
  screenEl.el('[data-role="back"]').click();
  assert.deepEqual(calls, [["select", "menu-09"], ["history"], ["back"]]);
  assert.equal(screenEl.el("h2").focused, true, "見出しにフォーカスを移す");
});

test("「得点の推移を見る」を押すと onShowScoreChart が呼ばれる", () => {
  const { screenEl, calls } = mount();
  assert.match(screenEl.text('[data-role="score-chart"]'), new RegExp(MENU_SCREEN_TEXT.scoreChart));
  screenEl.el('[data-role="score-chart"]').click();
  assert.deepEqual(calls, [["score-chart"]]);
});
