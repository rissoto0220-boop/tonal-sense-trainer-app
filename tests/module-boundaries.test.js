import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findForbiddenImports, findForbiddenWords, importedPaths, listModules, readModule,
} from "./helpers/module-boundaries.js";

// 測定・訓練の本体が、保存・参加者ID・CSV・送信の部品に依存しないこと。
// 「許可リスト」ではなく「禁止リスト」で調べる(共通の部品を足すたびに、許可リストを直さなくて済む)。
// 保存・履歴・CSV をする側のファイル(各フォルダの session-store・reports・history-screen など)は、対象から外す。

// 保存・履歴・CSVの部品(同じフォルダ内のもの)と、共通の保存・送信・参加者IDの部品
const STORAGE_SIDE_IMPORTS = [
  /^\.\/(session-store|reports|history-screen|score-chart-screen)\.js$/,
  /^\.\.\/functional-pitch\/(session-store|reports|history-screen)\.js$/,
  /^\.\.\/shared\/(participant-id|storage|csv|session-uploader|server-config|display-format)\.js$/,
];
const SEND_IMPORTS = [/session-uploader|server-config|participant-id/];
const BROWSER_WORDS = /\b(document|localStorage|sessionStorage|fetch|AudioContext)\b/;
const STORAGE_OR_SEND_WORDS = /\b(localStorage|sessionStorage|fetch|XMLHttpRequest)\b/;

// 機能的音感: 測定・練習・音色確認の本体(保存・履歴・CSVをするファイルを除く、すべて)
const FUNCTIONAL_STORAGE_FILES = ["session-store.js", "reports.js", "history-screen.js"];
// 音感訓練: 保存・履歴・CSV・得点推移画面の4ファイル。ブラウザ保存・CSV・日時の表示整形までは使ってよい
const TRAINING_STORAGE_FILES = ["session-store.js", "reports.js", "history-screen.js", "score-chart-screen.js"];

test("機能的音感の測定・練習・音色確認の本体は、保存・履歴・CSV・参加者ID・送信の部品を import しない", () => {
  const files = listModules("functional-pitch", FUNCTIONAL_STORAGE_FILES);
  assert.ok(files.length >= 10, `調べるファイルが少なすぎる: ${files.length}`);
  for (const file of files) {
    assert.deepEqual(findForbiddenImports(readModule("functional-pitch", file), STORAGE_SIDE_IMPORTS), [], file);
  }
});

test("音感訓練の本体(保存・履歴・得点推移画面を除く)は、保存・CSV・参加者ID・送信の部品を import せず、ブラウザの機能を直接使わない", () => {
  const files = listModules("training", TRAINING_STORAGE_FILES);
  assert.ok(files.length >= 10, `調べるファイルが少なすぎる: ${files.length}`);
  for (const file of files) {
    const source = readModule("training", file);
    assert.deepEqual(findForbiddenImports(source, STORAGE_SIDE_IMPORTS), [], file);
    assert.deepEqual(findForbiddenWords(source, BROWSER_WORDS), [], `${file} がブラウザの機能を使っている`);
  }
});

test("音感訓練の保存・履歴・得点推移画面の4ファイルは、ブラウザ保存とCSVまで。送信・参加者ID・通信には触れない", () => {
  for (const file of TRAINING_STORAGE_FILES) {
    const source = readModule("training", file);
    assert.deepEqual(findForbiddenImports(source, SEND_IMPORTS), [], file);
    assert.deepEqual(findForbiddenWords(source, STORAGE_OR_SEND_WORDS), [], `${file} が保存先・通信を直接使っている`);
  }
});

test("判定の部品: 禁止の import・語を見つけ、許可のもの・コメントの中のものは見つけない", () => {
  const source = [
    'import { a } from "./stimuli.js";',
    'import { b } from "./session-store.js"; // 保存',
    'import "../shared/csv.js";',
    '// import { c } from "../shared/storage.js";',
    'const m = await import("../shared/session-uploader.js");',
    "const x = document.title; // fetch は書かない",
  ].join("\n");
  assert.deepEqual(importedPaths(source), ["./stimuli.js", "./session-store.js", "../shared/csv.js", "../shared/session-uploader.js"]);
  assert.deepEqual(findForbiddenImports(source, STORAGE_SIDE_IMPORTS), ["./session-store.js", "../shared/csv.js", "../shared/session-uploader.js"]);
  assert.deepEqual(findForbiddenWords(source, BROWSER_WORDS), ["document"]);
  assert.deepEqual(findForbiddenImports('import { a } from "./stimuli.js";', STORAGE_SIDE_IMPORTS), []);
});
