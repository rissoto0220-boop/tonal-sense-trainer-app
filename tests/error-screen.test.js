import { test } from "node:test";
import assert from "node:assert/strict";
import { buildErrorScreenHtml, showErrorScreen } from "../src/shared/error-screen.js";
import { createFakeDom } from "./training/helpers/fake-dom.js";

test("見出し・本文・戻るボタン。文字は無害化する", () => {
  const html = buildErrorScreenHtml({ title: "音声を<読み込め>ませんでした", message: "戻って & やり直す", backLabel: "テスト選択へ戻る" });
  assert.match(html, /<h2 tabindex="-1">音声を&lt;読み込め&gt;ませんでした<\/h2>/);
  assert.match(html, /<p class="error" role="alert">戻って &amp; やり直す<\/p>/);
  assert.match(html, /data-role="back">テスト選択へ戻る<\/button>/);
});

test("戻るボタンの文字を渡さなければ、ボタンを出さない", () => {
  assert.equal(buildErrorScreenHtml({ title: "t", message: "m" }).includes("data-role=\"back\""), false);
});

test("showErrorScreen: 見出しにフォーカス。戻るボタンで onBack を1回だけ呼ぶ(二重押しを防ぐ)", () => {
  const screenEl = createFakeDom();
  let backs = 0;
  showErrorScreen({ screenEl, title: "音声を読み込めませんでした", message: "m", backLabel: "メニュー選択へ戻る", onBack: () => { backs += 1; } });
  assert.equal(screenEl.el("h2").focused, true);
  assert.equal(screenEl.text("h2"), "音声を読み込めませんでした");
  screenEl.el('[data-role="back"]').click();
  screenEl.el('[data-role="back"]').click();
  assert.equal(backs, 1);
});

test("showErrorScreen: onBack がなければ、戻るボタンを出さない", () => {
  const screenEl = createFakeDom();
  showErrorScreen({ screenEl, title: "t", message: "m", backLabel: "戻る" });
  assert.equal(screenEl.el('[data-role="back"]'), null);
});
