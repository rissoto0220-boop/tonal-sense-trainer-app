import { test } from "node:test";
import assert from "node:assert/strict";
import { showRelativeAudioError, RELATIVE_AUDIO_ERROR_TEXT } from "../../src/relative-pitch/audio-error-screen.js";
import { createFakeDom } from "../training/helpers/fake-dom.js";

// 相対音感の練習・本番の音声エラー(2026-11-14: 状態の文だけでなく、テスト選択へ戻れるエラー画面にした)。
test("見出し・本文・「テスト選択へ戻る」。押すと onBack", () => {
  assert.deepEqual(RELATIVE_AUDIO_ERROR_TEXT, {
    title: "音声を読み込めませんでした",
    message: "このテストは中断として記録しました。テスト選択へ戻って、最初からやり直してください。",
    backLabel: "テスト選択へ戻る",
  });
  const screenEl = createFakeDom();
  let backs = 0;
  showRelativeAudioError({ screenEl, onBack: () => { backs += 1; } });
  assert.equal(screenEl.text("h2"), "音声を読み込めませんでした");
  assert.equal(screenEl.el("h2").focused, true);
  screenEl.el('[data-role="back"]').click();
  assert.equal(backs, 1);
});
