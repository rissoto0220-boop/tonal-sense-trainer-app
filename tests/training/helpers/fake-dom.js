// 訓練の画面のテスト用の、最小の偽の画面要素。
// innerHTML に代入された文字列から、<button>・<h2>・<p>・data-role 付きの <div> を見つけて、
// 後から部分的に書き換えられる要素(disabled・hidden・classList・textContent・innerHTML)にする。
// 画面を作り直した回数(innerHTML への代入の回数)も数えられる。
// 入れ子の同じタグ(div の中の div など)は扱わない(訓練の画面では、data-role 付きの div は入れ子にならない)。
// 対応するセレクター: "h2" / "button" / "[data-code]" / '[data-role="x"]'
function decode(text) {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

function createElement(tag, attrs, inner) {
  const dataset = {};
  for (const [, name, value] of attrs.matchAll(/data-([\w-]+)="([^"]*)"/g)) dataset[name] = value;
  const classes = new Set((attrs.match(/class="([^"]*)"/)?.[1] ?? "").split(" ").filter(Boolean));
  let innerHtml = inner;
  return {
    tag,
    dataset,
    disabled: /\sdisabled(\s|$)/.test(` ${attrs}`),
    hidden: /\shidden(\s|$)/.test(` ${attrs}`),
    focused: false,
    listeners: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, force) => { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); },
    },
    get className() { return [...classes].join(" "); },
    get innerHTML() { return innerHtml; },
    set innerHTML(value) { innerHtml = value; },
    get textContent() { return decode(innerHtml.replace(/<[^>]*>/g, "")); },
    set textContent(value) { innerHtml = String(value); },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    focus() { this.focused = true; },
    // 無効なボタンは、ブラウザと同じくクリックを受け付けない
    click() { if (!this.disabled) this.listeners.click?.(); },
  };
}

export function createFakeDom() {
  let html = "";
  let elements = [];
  let renders = 0;

  function parse(source) {
    const found = [];
    for (const match of source.matchAll(/<(button|h2|p|div)\b([^>]*)>/g)) {
      const [whole, tag, attrs] = match;
      if (tag === "div" && !/data-role="/.test(attrs)) continue;
      const start = match.index + whole.length;
      const end = source.indexOf(`</${tag}>`, start);
      found.push(createElement(tag, attrs, source.slice(start, end < 0 ? start : end)));
    }
    return found;
  }

  function matches(element, selector) {
    if (["h2", "button", "p"].includes(selector)) return element.tag === selector;
    const dataKey = selector.match(/^\[data-([\w-]+)\]$/);
    if (dataKey) return dataKey[1] in element.dataset;
    const dataValue = selector.match(/^\[data-([\w-]+)="([^"]+)"\]$/);
    if (dataValue) return element.dataset[dataValue[1]] === dataValue[2];
    return false;
  }

  return {
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; elements = parse(value); renders += 1; },
    querySelectorAll: (selector) => elements.filter((element) => matches(element, selector)),
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; },
    // テスト用の補助
    renders: () => renders,
    el(selector) { return this.querySelector(selector); },
    text(selector) { return this.querySelector(selector)?.textContent ?? null; },
  };
}
