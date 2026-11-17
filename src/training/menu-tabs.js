// 音感訓練のメニュー選択画面のタブ。どのタブに、どのメニューを入れるかを1か所にまとめる。DOMに依存しない。
// タブを増やす・減らす・並べ替えるときは、MENU_TABS の行を変えるだけでよい(メニューのデータは変えない)。
//   tabId: タブの識別子(画面の id や、最後に開いていたタブの記憶に使う)。英小文字・数字・ハイフンだけ。
//   label: タブに出す名前。
//   note:  省略可。そのタブの一覧の先頭に出す注意書き。
//   matches(menu): そのタブに入れるメニューなら真。上の行から順に調べ、最初に当てはまったタブだけに入れる。
export const MENU_TABS = [
  { tabId: "key-c", label: "Key C", matches: (menu) => !menu.sample && menu.keyPolicy.mode === "fixed" },
  { tabId: "key-random", label: "Key ランダム", matches: (menu) => !menu.sample && menu.keyPolicy.mode !== "fixed" },
  { tabId: "samples", label: "拡張", note: "開発確認用・保存しません", matches: (menu) => Boolean(menu.sample) },
];

// どのタブにも当てはまらないメニューを入れるタブ(タブの定義を変えたときに、メニューが画面から消えないように)。
export const OTHER_TAB = { tabId: "other", label: "その他", matches: () => true };

// メニューをタブに振り分ける。戻り値: [{ tab, menus }](タブの定義の順)。
// メニューが0個のタブは返さない(例: ?samples=on がないときは「拡張」のタブが出ない)。
export function groupMenusByTab(menus, tabs = MENU_TABS) {
  const groups = tabs.map((tab) => ({ tab, menus: [] }));
  const others = [];
  for (const menu of menus) {
    const group = groups.find(({ tab }) => tab.matches(menu));
    if (group) group.menus.push(menu);
    else others.push(menu);
  }
  if (others.length > 0) groups.push({ tab: OTHER_TAB, menus: others });
  return groups.filter((group) => group.menus.length > 0);
}

// 最初に開くタブの tabId。指定がない・見つからないときは、最初のタブ。タブが1つもなければ null。
export function resolveSelectedTabId(groups, tabId) {
  return groups.find((group) => group.tab.tabId === tabId)?.tab.tabId ?? groups[0]?.tab.tabId ?? null;
}
