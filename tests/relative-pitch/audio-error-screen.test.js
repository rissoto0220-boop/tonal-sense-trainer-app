import { test } from "node:test";
import assert from "node:assert/strict";
import { showRelativeAudioError } from "../../src/relative-pitch/audio-error-screen.js";
import { createFakeDom } from "../training/helpers/fake-dom.js";

// 相対音感の練習・本番の音声エラー(2026-11-14: テスト選択へ戻れるエラー画面。2026-11-15: エラーの種類の表へ統一)。
test("見出し・何が起きたか・データへの影響(中断として記録)・次にすべきこと・「テスト選択へ戻る」。押すと onBack", () => {
  const screenEl = createFakeDom();
  let backs = 0;
  showRelativeAudioError({ screenEl, onBack: () => { backs += 1; } });
  assert.equal(screenEl.text("h2"), "音声を読み込めませんでした");
  assert.equal(screenEl.el("h2").focused, true);
  assert.match(screenEl.innerHTML, /音声ファイルを読み込めませんでした。/);
  assert.match(screenEl.innerHTML, /ここまでの回答は、中断として記録しました。/);
  assert.match(screenEl.innerHTML, /テスト選択へ戻って、やり直してください。/);
  assert.equal(screenEl.text('[data-role="back"]'), "テスト選択へ戻る");
  screenEl.el('[data-role="back"]').click();
  assert.equal(backs, 1);
});
