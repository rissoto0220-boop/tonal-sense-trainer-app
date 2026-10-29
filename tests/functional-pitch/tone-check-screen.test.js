import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildToneCheckHtml,
  PART_LABEL,
  PART_STATE_TEXT,
  TONE_CHECK_ERROR_TEXT,
} from "../../src/functional-pitch/tone-check-screen.js";

const html = buildToneCheckHtml();

test("リコーダーとピアノの「聴く」ボタンが1つずつある", () => {
  const buttons = [...html.matchAll(/<button type="button" class="secondary" data-role="play" data-part="(\w+)">([^<]+)<\/button>/g)];
  assert.deepEqual(buttons.map((m) => m[1]), ["recorder", "piano"]);
  assert.deepEqual(buttons.map((m) => m[2]), ["リコーダーの音を聴く", "ピアノの音を聴く"]);
});

test("初期状態は、どちらも未再生", () => {
  assert.equal(html.split('data-state="idle"').length - 1, 2);
  assert.equal(html.split(`>${PART_STATE_TEXT.idle}<`).length - 1, 2);
});

test("「練習へ進む」は初期状態で無効", () => {
  assert.match(html, /<button type="button" class="primary" data-role="proceed" disabled>練習へ進む<\/button>/);
});

test("読み上げ専用の領域(role=status)が1つあり、エラー用の要素もある", () => {
  assert.equal(html.split(' role="status"').length - 1, 1);
  assert.match(html, /<p class="error" data-role="error"><\/p>/);
});

test("状態の文言は 未再生/再生中/再生済み(✓などの印は使わない)", () => {
  assert.deepEqual(PART_STATE_TEXT, { idle: "未再生", playing: "再生中", played: "再生済み" });
  assert.equal(html.includes("✓"), false);
  assert.deepEqual(PART_LABEL, { recorder: "リコーダー", piano: "ピアノ" });
});

test("再生回数に上限がないことを案内している", () => {
  assert.match(html, /何度でも聴けます/);
});

test("エラー文言は ページの再読み込みを案内する", () => {
  assert.match(TONE_CHECK_ERROR_TEXT, /ページを再読み込みしてください/);
});

test("正解・不正解を連想させる語が含まれない", () => {
  for (const word of ["正解", "不正解", "正しい", "間違", "誤り"]) {
    assert.equal(html.includes(word), false, word);
  }
});

test("document が無い環境でも tone-check-screen.js のimportで例外にならない", async () => {
  await assert.doesNotReject(import("../../src/functional-pitch/tone-check-screen.js"));
});

test("音色確認・練習の画面はユーザー・保存・CSV・サーバーに依存しない(importしていない)", () => {
  const allowed = /^(\.\/(audio-clock|tone-check-controller|stimuli|phrase-audio|practice-session|trial-screen)\.js|\.\.\/shared\/(escape-html|audio-buffer-player)\.js)$/;
  for (const file of ["audio-clock.js", "tone-check-controller.js", "tone-check-screen.js", "practice-session.js", "practice-flow.js"]) {
    const source = readFileSync(new URL(`../../src/functional-pitch/${file}`, import.meta.url), "utf8");
    for (const [, path] of source.matchAll(/from "(.*)";/g)) {
      assert.match(path, allowed, `${file} が ${path} をimportしている`);
    }
  }
});
