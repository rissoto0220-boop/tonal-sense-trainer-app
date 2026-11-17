import { test } from "node:test";
import assert from "node:assert/strict";
import { enableUnloadGuard } from "../src/shared/unload-guard.js";

function createFakeWindow() {
  const listeners = new Set();
  return {
    addEventListener: (type, fn) => { if (type === "beforeunload") listeners.add(fn); },
    removeEventListener: (type, fn) => { if (type === "beforeunload") listeners.delete(fn); },
    // ページを閉じようとした操作。確認が出る(=キャンセルされる)なら true。
    tryClose() {
      const event = { defaultPrevented: false, returnValue: undefined, preventDefault() { this.defaultPrevented = true; } };
      listeners.forEach((fn) => fn(event));
      return event.defaultPrevented;
    },
    count: () => listeners.size,
  };
}

test("有効化すると、ページを閉じるときにブラウザの確認が出る", () => {
  const win = createFakeWindow();
  enableUnloadGuard(win);
  assert.equal(win.tryClose(), true);
});

test("有効化する前と、解除した後は、確認が出ない", () => {
  const win = createFakeWindow();
  assert.equal(win.tryClose(), false);
  const disable = enableUnloadGuard(win);
  disable();
  assert.equal(win.tryClose(), false);
  assert.equal(win.count(), 0);
});

test("解除は何度呼んでも安全で、別の有効化を巻き込まない", () => {
  const win = createFakeWindow();
  const first = enableUnloadGuard(win);
  const second = enableUnloadGuard(win);
  first();
  first();
  assert.equal(win.count(), 1);
  second();
  assert.equal(win.count(), 0);
});

test("window が無い環境(Node)でも例外にならず、解除関数を返す", () => {
  const disable = enableUnloadGuard(null);
  assert.doesNotThrow(() => disable());
});

test("releaseAllUnloadGuards: 有効な確認をすべて解除する。個別の解除をあとから呼んでも安全で、そのあとの有効化は効く", async () => {
  const { releaseAllUnloadGuards } = await import("../src/shared/unload-guard.js");
  const win = createFakeWindow();
  const first = enableUnloadGuard(win);
  const second = enableUnloadGuard(win);
  assert.equal(win.count(), 2);
  releaseAllUnloadGuards();
  assert.equal(win.count(), 0);
  assert.equal(win.tryClose(), false);
  assert.doesNotThrow(() => { first(); second(); });
  enableUnloadGuard(win);
  assert.equal(win.tryClose(), true);
  releaseAllUnloadGuards();
});
