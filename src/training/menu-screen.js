// 音感訓練のメニュー選択画面。メニューをタブ(Key C / Key ランダム / 拡張)に分けて並べる。
// どのタブにどのメニューを入れるかは menu-tabs.js の MENU_TABS で決める(タブの増減はそちらだけを変える)。
// 一覧の見た目は、テスト選択画面と同じ目次リスト形式(既存の .test-list などのスタイルを使う)。
// タブは WAI-ARIA のタブの作法に従う(role="tablist"・"tab"・"tabpanel"、矢印キー・Home・End で移動)。
// 画面は最初に1回だけ作り、タブの切り替えでは表示・非表示だけを書き換える。描き直すと、外枠 .panel の
// フェードイン(styles.css)が毎回やり直され、ちらついて見えるため(回答画面と同じ対処)。
import { escapeHtml } from "../shared/escape-html.js";
import { MENU_TABS, groupMenusByTab, resolveSelectedTabId } from "./menu-tabs.js";

export const MENU_SCREEN_TEXT = {
  title: "訓練メニューを選んでください",
  tabListLabel: "メニューの種類",
  back: "テスト選択へ戻る",
  history: "履歴・CSVを見る",
  scoreChart: "得点の推移を見る",
};

// 1メニューの説明(出題数とKey)。
function describe(menu) {
  const key = menu.keyPolicy.mode === "fixed" ? `Key ${menu.keyPolicy.keyCode}` : "Key はランダム(C/Es/Fis/A)";
  return `${menu.generation.questionCount}問・${key}`;
}

function menuListHtml(menus) {
  return `
        <ul class="test-list">
          ${menus.map((menu) => `
            <li class="test-item">
              <button type="button" class="test-button" data-menu-id="${escapeHtml(menu.menuId)}">
                <span class="test-title">${escapeHtml(menu.name)}</span>
              </button>
              <p class="test-description">${escapeHtml(describe(menu))}</p>
            </li>`).join("")}
        </ul>`;
}

const tabIdAttr = (tab) => `training-tab-${escapeHtml(tab.tabId)}`;
const panelIdAttr = (tab) => `training-tabpanel-${escapeHtml(tab.tabId)}`;

function tabListHtml(groups, selectedTabId) {
  return `
      <div class="training-tabs" role="tablist" aria-label="${MENU_SCREEN_TEXT.tabListLabel}" data-role="tablist">
        ${groups.map(({ tab }) => {
          const selected = tab.tabId === selectedTabId;
          return `<button type="button" class="training-tab" role="tab" id="${tabIdAttr(tab)}" aria-controls="${panelIdAttr(tab)}" aria-selected="${selected}" tabindex="${selected ? 0 : -1}" data-tab-id="${escapeHtml(tab.tabId)}">${escapeHtml(tab.label)}</button>`;
        }).join("")}
      </div>`;
}

// タブが1つだけのときは、タブの列を出さず、一覧だけを出す(役割 tabpanel も付けない)。
function panelHtml({ tab, menus }, { withTabs, selected }) {
  const roleAttrs = withTabs ? ` role="tabpanel" id="${panelIdAttr(tab)}" aria-labelledby="${tabIdAttr(tab)}"` : "";
  const note = tab.note ? `
        <p class="note training-tab-note">${escapeHtml(tab.note)}</p>` : "";
  return `
      <div class="training-tabpanel"${roleAttrs} data-role="tab-panel" data-panel-id="${escapeHtml(tab.tabId)}"${selected ? "" : " hidden"}>${note}${menuListHtml(menus)}
      </div>`;
}

// tabs: タブの定義(省略時 MENU_TABS)。selectedTabId: 開いておくタブ(省略・見つからないときは最初のタブ)。
export function buildMenuScreenHtml(menus, { tabs = MENU_TABS, selectedTabId = null } = {}) {
  const groups = groupMenusByTab(menus, tabs);
  const selected = resolveSelectedTabId(groups, selectedTabId);
  const withTabs = groups.length > 1;
  return `
    <div class="panel">
      <h2 tabindex="-1">${MENU_SCREEN_TEXT.title}</h2>${withTabs ? tabListHtml(groups, selected) : ""}${groups.map((group) => panelHtml(group, { withTabs, selected: group.tab.tabId === selected })).join("")}
      <div class="actions">
        <button type="button" class="secondary" data-role="score-chart">${MENU_SCREEN_TEXT.scoreChart}</button>
        <button type="button" class="secondary" data-role="history">${MENU_SCREEN_TEXT.history}</button>
        <button type="button" class="secondary" data-role="back">${MENU_SCREEN_TEXT.back}</button>
      </div>
    </div>`;
}

// 矢印キー・Home・End で移る先のタブの位置。対象外のキーなら null。端では反対の端へ回る。
export function nextTabIndex(key, index, count) {
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

// onSelect(menu): メニューを押したとき(参加者のクリックの中で呼ぶので、音声の有効化に使える)。
// onShowHistory(): 「履歴・CSVを見る」を押したとき。onShowScoreChart(): 「得点の推移を見る」を押したとき。
// onBack(): 「テスト選択へ戻る」を押したとき。
// tabs: タブの定義(省略時 MENU_TABS)。initialTabId: 最初に開くタブ(訓練から戻ったときに、前のタブを開くのに使う)。
// onTabChange(tabId): タブを切り替えたとき(最後に開いていたタブを、呼び出し側が覚えておくのに使う)。
export function showTrainingMenuScreen({
  screenEl,
  menus,
  tabs = MENU_TABS,
  initialTabId = null,
  onTabChange = () => {},
  onSelect,
  onShowHistory = () => {},
  onShowScoreChart = () => {},
  onBack,
}) {
  let currentTabId = resolveSelectedTabId(groupMenusByTab(menus, tabs), initialTabId);
  screenEl.innerHTML = buildMenuScreenHtml(menus, { tabs, selectedTabId: currentTabId });
  screenEl.querySelector("h2")?.focus();

  const tabButtons = [...screenEl.querySelectorAll("[data-tab-id]")];
  const panels = [...screenEl.querySelectorAll("[data-panel-id]")];

  function selectTab(tabId, { focus = false } = {}) {
    for (const tab of tabButtons) {
      const selected = tab.dataset.tabId === tabId;
      tab.setAttribute("aria-selected", String(selected));
      tab.setAttribute("tabindex", selected ? "0" : "-1");
      if (selected && focus) tab.focus();
    }
    for (const panel of panels) panel.hidden = panel.dataset.panelId !== tabId;
    if (tabId !== currentTabId) {
      currentTabId = tabId;
      onTabChange(tabId);
    }
  }

  tabButtons.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab.dataset.tabId));
    tab.addEventListener("keydown", (event) => {
      const next = nextTabIndex(event.key, index, tabButtons.length);
      if (next === null) return;
      event.preventDefault();
      selectTab(tabButtons[next].dataset.tabId, { focus: true });
    });
  });

  for (const button of screenEl.querySelectorAll("[data-menu-id]")) {
    button.addEventListener("click", () => {
      const menu = menus.find((item) => item.menuId === button.dataset.menuId);
      if (menu) onSelect(menu);
    });
  }
  screenEl.querySelector('[data-role="history"]')?.addEventListener("click", onShowHistory);
  screenEl.querySelector('[data-role="score-chart"]')?.addEventListener("click", onShowScoreChart);
  screenEl.querySelector('[data-role="back"]')?.addEventListener("click", onBack);
}
