import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildToneCheckHtml,
  PART_LABEL,
  PART_STATE_TEXT,
  PART_MARK,
  PLAY_BUTTON_TEXT,
  PLAYING_BUTTON_TEXT,
  BACK_BUTTON_TEXT,
  TONE_CHECK_ERROR_TEXT,
} from "../../src/functional-pitch/tone-check-screen.js";

const html = buildToneCheckHtml();

test("リコーダーとピアノの「聴く」ボタンが1つずつある", () => {
  const buttons = [...html.matchAll(/<button type="button" class="secondary" data-role="play" data-part="(\w+)">([^<]+)<\/button>/g)];
  assert.deepEqual(buttons.map((m) => m[1]), ["recorder", "piano"]);
  assert.deepEqual(buttons.map((m) => m[2]), ["リコーダーの音を聴く", "ピアノの音を聴く"]);
});

test("初期状態は、どちらも空の丸(印なし)。画面読み上げ向けに「未再生」の見えない文字がある", () => {
  assert.equal(html.split('data-state="idle"').length - 1, 2);
  assert.equal(html.split('<span class="functional-tone-mark" data-role="mark" aria-hidden="true"></span>').length - 1, 2);
  assert.equal(html.split(`<span class="functional-visually-hidden" data-role="state-text">${PART_STATE_TEXT.idle}</span>`).length - 1, 2);
});

test("「練習へ進む」は初期状態で無効", () => {
  assert.match(html, /<button type="button" class="primary" data-role="proceed" disabled>練習へ進む<\/button>/);
});

test("読み上げ専用の領域(role=status)が1つあり、エラー用の要素もある", () => {
  assert.equal(html.split(' role="status"').length - 1, 1);
  assert.match(html, /<p class="error" data-role="error"><\/p>/);
});

// 2026-11-15 研究者の決定: 見える文字(未再生/再生済み)をやめ、ボタンの横の丸い印にした。
test("状態の印は、聴き終えた丸だけに✓が付く。見えない文字は 未再生/再生中/再生済み", () => {
  assert.deepEqual(PART_STATE_TEXT, { idle: "未再生", playing: "再生中", played: "再生済み" });
  assert.deepEqual(PART_MARK, { idle: "", playing: "", played: "✓" });
  assert.equal(html.includes("✓"), false); // 初期状態では、どこにも✓は出ない
  assert.deepEqual(PART_LABEL, { recorder: "リコーダー", piano: "ピアノ" });
});

test("印は画面読み上げから隠し(aria-hidden)、見える位置に状態の文字を置かない", () => {
  assert.equal(html.split('data-role="mark" aria-hidden="true"').length - 1, 2);
  const withoutHidden = html.replace(/<span class="functional-visually-hidden"[^>]*>[^<]*<\/span>/g, "");
  assert.equal(withoutHidden.includes("未再生"), false);
});

test("ボタンの文字: 聴く前は「〜の音を聴く」、再生中は「〜の音を再生中…」", () => {
  assert.equal(PLAY_BUTTON_TEXT("recorder"), "リコーダーの音を聴く");
  assert.equal(PLAYING_BUTTON_TEXT("piano"), "ピアノの音を再生中…");
});

test("再生回数に上限がないことを案内している", () => {
  assert.match(html, /何度でも聴けます/);
});

// 2026-11-14: エラー時はテスト選択へ戻れるエラー画面に切り替わるため(functional-session.js)、画面の中の文では再読み込みを促さない。
test("エラー文言は 読み込めなかったことを伝え、再読み込みは促さない", () => {
  assert.equal(TONE_CHECK_ERROR_TEXT, "音声を読み込めませんでした。");
});

test("正解・不正解を連想させる語が含まれない", () => {
  for (const word of ["正解", "不正解", "正しい", "間違", "誤り"]) {
    assert.equal(html.includes(word), false, word);
  }
});

// 2026-11-15 研究者の決定: 音色の確認から、説明画面へ「戻る」。onBack を渡したときだけ出す。
test("「戻る」は、showBack のときだけ出す(既定は出さない)。「練習へ進む」と同じ行の、控えめなボタン", () => {
  assert.equal(BACK_BUTTON_TEXT, "戻る");
  assert.equal(html.includes('data-role="back"'), false);
  const withBack = buildToneCheckHtml({ showBack: true });
  assert.match(withBack, /<button type="button" class="secondary" data-role="back">戻る<\/button>/);
  assert.ok(withBack.indexOf('data-role="proceed"') < withBack.indexOf('data-role="back"'));
});
