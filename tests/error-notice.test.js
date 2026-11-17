import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./training/helpers/fake-dom.js";
import { installErrorNotice, buildErrorNoticeHtml } from "../src/shared/error-notice.js";
import { ERROR_KINDS } from "../src/shared/error-kinds.js";

// 偽の window・document・画面。帯は #screen の直前に挿入される。
function setup() {
  const listeners = new Map();
  const target = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); },
    fire: (type, event = {}) => listeners.get(type)?.({ type, ...event }),
    count: () => listeners.size,
  };
  const inserted = [];
  const anchorEl = { parentNode: { insertBefore: (el, before) => inserted.push({ el, before }) } };
  const doc = {
    createElement() {
      const el = createFakeDom();
      el.className = "";
      el.removed = false;
      el.remove = () => {
        el.removed = true;
        const i = inserted.findIndex((item) => item.el === el);
        if (i >= 0) inserted.splice(i, 1);
      };
      return el;
    },
  };
  let restarts = 0;
  const uninstall = installErrorNotice({ target, doc, anchorEl, onRestart: () => { restarts += 1; } });
  return { target, inserted, anchorEl, uninstall, restarts: () => restarts };
}

test("帯の文言は、エラーの種類の表(unexpected)から作る。role=alert、詳細は出さない", () => {
  const html = buildErrorNoticeHtml();
  assert.ok(html.includes(ERROR_KINDS.unexpected.title));
  assert.ok(html.includes(ERROR_KINDS.unexpected.cause));
  assert.ok(html.includes("最初からやり直す」を押してください"));
  assert.match(html, /role="alert"/);
  assert.equal(html.includes("error-details"), false);
});

test("error で、画面(#screen)の直前に帯が1つ出る", () => {
  const { target, inserted, anchorEl } = setup();
  assert.equal(inserted.length, 0);
  target.fire("error", { message: "boom" });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].before, anchorEl);
  assert.equal(inserted[0].el.className, "error-notice");
});

test("unhandledrejection でも出る(理由が何でも)。続けて起きても帯は1つのまま", () => {
  const { target, inserted } = setup();
  target.fire("unhandledrejection", { reason: new Error("x") });
  target.fire("unhandledrejection", { reason: undefined });
  target.fire("error", { message: "again" });
  assert.equal(inserted.length, 1);
});

test("「閉じる」で消え、その後に起きれば、また出る", () => {
  const { target, inserted } = setup();
  target.fire("error", { message: "a" });
  inserted[0].el.querySelector('[data-role="close"]').click();
  assert.equal(inserted.length, 0);
  target.fire("error", { message: "b" });
  assert.equal(inserted.length, 1);
});

test("「最初からやり直す」は onRestart を呼ぶ。二重押しでは1回だけ", () => {
  const { target, inserted, restarts } = setup();
  target.fire("error", { message: "a" });
  const button = inserted[0].el.querySelector('[data-role="restart"]');
  button.click();
  button.click();
  assert.equal(restarts(), 1);
  assert.equal(button.disabled, true);
});

test("画面に影響しない通知は無視する(ResizeObserver、メッセージのない読み込み失敗)", () => {
  const { target, inserted } = setup();
  target.fire("error", { message: "ResizeObserver loop completed with undelivered notifications." });
  target.fire("error", { message: "ResizeObserver loop limit exceeded" });
  target.fire("error", {});
  target.fire("error", { message: "" });
  assert.equal(inserted.length, 0);
});

test("取り外すと、リスナーが外れ、帯も消える。何度呼んでも安全", () => {
  const { target, inserted, uninstall } = setup();
  target.fire("error", { message: "a" });
  uninstall();
  uninstall();
  assert.equal(target.count(), 0);
  assert.equal(inserted.length, 0);
});

test("window や document が無い環境(Node)では、何もせず、取り外す関数を返す", () => {
  const off = installErrorNotice({ target: null, doc: null, anchorEl: null, onRestart() {} });
  assert.doesNotThrow(() => off());
});
