import { test } from "node:test";
import assert from "node:assert/strict";
import { buildErrorScreenHtml, showErrorScreen } from "../src/shared/error-screen.js";
import { createFakeDom } from "./training/helpers/fake-dom.js";

// 見出し・文言は、エラーの種類の表(src/shared/error-kinds.js)から作る(2026-11-15 に統一した)。
test("画面の順: 見出し → 何が起きたか → 詳細 → データへの影響 → 次にすべきこと → 戻るボタン", () => {
  const html = buildErrorScreenHtml({ kind: "audio-load", impact: "recorded-interrupted", backTo: "メニュー選択", details: ["a.wav(読み込めません)"] });
  const order = [
    "<h2 tabindex=\"-1\">音声を読み込めませんでした</h2>",
    "<p class=\"error\" role=\"alert\">音声ファイルを読み込めませんでした。</p>",
    "<li>a.wav(読み込めません)</li>",
    "<p class=\"error-impact\">ここまでの回答は、中断として記録しました。</p>",
    "<p class=\"note error-next\">メニュー選択へ戻って、やり直してください。</p>",
    "data-role=\"back\">メニュー選択へ戻る</button>",
  ].map((part) => html.indexOf(part));
  assert.ok(order.every((at) => at >= 0), `すべて含む: ${order}`);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "この順に並ぶ");
});

test("詳細・影響を渡さなければ、その行を出さない。詳細の文字は無害化する", () => {
  const plain = buildErrorScreenHtml({ kind: "setup", backTo: "Key選択" });
  assert.equal(plain.includes("error-details"), false);
  assert.equal(plain.includes("error-impact"), false);
  assert.match(buildErrorScreenHtml({ kind: "setup", backTo: "Key選択", details: ["<script>"] }), /<li>&lt;script&gt;<\/li>/);
});

test("戻るボタンは withBack が偽、または戻り先がなければ出さない", () => {
  assert.equal(buildErrorScreenHtml({ kind: "setup", backTo: "Key選択", withBack: false }).includes("data-role=\"back\""), false);
  assert.equal(buildErrorScreenHtml({ kind: "setup" }).includes("data-role=\"back\""), false);
});

test("showErrorScreen: 見出しにフォーカス。戻るボタンで onBack を1回だけ呼ぶ(二重押しを防ぐ)", () => {
  const screenEl = createFakeDom();
  let backs = 0;
  showErrorScreen({ screenEl, kind: "audio-load", backTo: "メニュー選択", onBack: () => { backs += 1; } });
  assert.equal(screenEl.el("h2").focused, true);
  assert.equal(screenEl.text("h2"), "音声を読み込めませんでした");
  assert.equal(screenEl.text('[data-role="back"]'), "メニュー選択へ戻る");
  screenEl.el('[data-role="back"]').click();
  screenEl.el('[data-role="back"]').click();
  assert.equal(backs, 1);
});

test("showErrorScreen: onBack がなければ、戻るボタンを出さず、次にすべきことは再読み込みの案内", () => {
  const screenEl = createFakeDom();
  showErrorScreen({ screenEl, kind: "audio-load", backTo: "テスト選択" });
  assert.equal(screenEl.el('[data-role="back"]'), null);
  assert.match(screenEl.innerHTML, /ページを再読み込みして、やり直してください。/);
});

test("未対応の種類は例外", () => {
  assert.throws(() => buildErrorScreenHtml({ kind: "nope" }), /未対応のエラーの種類です/);
});
