// DOMの代わりに使う、最小の偽の画面要素(テスト用)。
// innerHTML に代入された文字列から <button>・<h2> を見つけて、クリック・フォーカスを記録できる要素にする。
// 対応するセレクター: "h2" / "button" / "[data-key]" / '[data-role="x"]'
export function createFakeScreen() {
  let html = "";
  let elements = [];

  function parse(source) {
    return [...source.matchAll(/<(button|h2)\b([^>]*)>/g)].map(([, tag, attrs]) => {
      const dataset = {};
      for (const [, name, value] of attrs.matchAll(/data-([\w-]+)="([^"]*)"/g)) dataset[name] = value;
      return {
        tag,
        dataset,
        disabled: /\sdisabled(\s|$)/.test(` ${attrs}`),
        focused: false,
        listeners: {},
        addEventListener(type, fn) { this.listeners[type] = fn; },
        focus() { this.focused = true; },
        // 無効なボタンは、ブラウザと同じくクリックを受け付けない
        click() { if (!this.disabled) this.listeners.click?.(); },
      };
    });
  }

  function matches(element, selector) {
    if (selector === "h2" || selector === "button") return element.tag === selector;
    const dataKey = selector.match(/^\[data-([\w-]+)\]$/);
    if (dataKey) return dataKey[1] in element.dataset;
    const dataValue = selector.match(/^\[data-([\w-]+)="([^"]+)"\]$/);
    if (dataValue) return element.dataset[dataValue[1]] === dataValue[2];
    return false;
  }

  return {
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; elements = parse(value); },
    querySelectorAll: (selector) => elements.filter((e) => matches(e, selector)),
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; },
    // テスト用の補助
    button: (selector) => elements.find((e) => e.tag === "button" && matches(e, selector)),
  };
}
