import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  DEFINITIONS_SCHEMA_VERSION,
  DEFAULT_QUESTION_COUNT,
  ANSWER_FEATURES,
  DEGREE_CODES,
  CHORD_QUALITIES,
  CHORDS,
  OPTION_SETS,
  TASK_TEMPLATES,
} from "../../src/training/definitions.js";

test("出題数の既定値は15", () => {
  assert.equal(DEFAULT_QUESTION_COUNT, 15);
});

test("音度コード: n・s・b の各1〜7(21個)", () => {
  assert.equal(DEGREE_CODES.length, 21);
  assert.ok(["n1", "n7", "s1", "s7", "b1", "b7"].every((code) => DEGREE_CODES.includes(code)));
});

test("回答の種類(answerFeature)の許容値は degree と chordRootDegree", () => {
  assert.deepEqual(ANSWER_FEATURES, ["degree", "chordRootDegree"]);
});

test("和音: 品質は機能的音感テストと同じ maj / dom7、根音度は有効な音度コード", () => {
  assert.deepEqual(CHORD_QUALITIES, ["maj", "dom7"]);
  assert.deepEqual(Object.keys(CHORDS), ["ch-n1-maj", "ch-n4-maj", "ch-n5-dom7"]);
  for (const [chordRef, chord] of Object.entries(CHORDS)) {
    assert.ok(DEGREE_CODES.includes(chord.rootDegree), `${chordRef} の根音度が不正`);
    assert.ok(CHORD_QUALITIES.includes(chord.quality), `${chordRef} の品質が不正`);
    assert.equal(chordRef, `ch-${chord.rootDegree}-${chord.quality}`, "和音コードは ch-<根音度>-<品質>");
  }
});

test("回答候補: answerFeature が許容値で、コードもラベルも重複しない", () => {
  for (const [name, optionSet] of Object.entries(OPTION_SETS)) {
    assert.ok(ANSWER_FEATURES.includes(optionSet.answerFeature), `${name} の answerFeature が不正`);
    const codes = optionSet.options.map((option) => option.code);
    const labels = optionSet.options.map((option) => option.label);
    assert.equal(new Set(codes).size, codes.length, `${name} のコードが重複`);
    assert.equal(new Set(labels).size, labels.length, `${name} のラベルが重複`);
    assert.ok(codes.every((code) => DEGREE_CODES.includes(code)), `${name} に無効な音度コード`);
  }
});

test("回答候補: 単音の階名鍵盤は ソ ラ シ ド レ ミ ファ の並び(内部コードと表示は別)", () => {
  const { options } = OPTION_SETS["melody-keyboard"];
  assert.deepEqual(options.map((option) => option.label), ["ソ", "ラ", "シ", "ド", "レ", "ミ", "ファ"]);
  assert.deepEqual(options.map((option) => option.code), ["n5", "n6", "n7", "n1", "n2", "n3", "n4"]);
});

test("回答候補: 和音の鍵盤は Ⅲ Ⅵ Ⅱ Ⅴ Ⅰ Ⅳ の並び(資料の 3→6→2→5→1→4)", () => {
  const { options } = OPTION_SETS["chord-root-degrees"];
  assert.deepEqual(options.map((option) => option.label), ["Ⅲ", "Ⅵ", "Ⅱ", "Ⅴ", "Ⅰ", "Ⅳ"]);
  assert.deepEqual(options.map((option) => option.code), ["n3", "n6", "n2", "n5", "n1", "n4"]);
});

test("課題テンプレート: 2種類。回答対象は配列で、partId と eventId で指す", () => {
  assert.deepEqual(Object.keys(TASK_TEMPLATES), ["tt-melody-first", "tt-chord-first"]);
  for (const [name, template] of Object.entries(TASK_TEMPLATES)) {
    assert.equal(template.taskTemplateId, name);
    assert.equal(template.schemaVersion, DEFINITIONS_SCHEMA_VERSION);
    assert.ok(Array.isArray(template.answerTargets) && template.answerTargets.length >= 1);
    for (const target of template.answerTargets) {
      assert.ok(target.partId && target.eventId, "partId と eventId の組で指す");
      assert.equal("eventIndex" in target, false, "eventIndex は正式な参照に使わない");
      assert.ok(ANSWER_FEATURES.includes(target.answerFeature));
      const optionSet = OPTION_SETS[target.optionSetRef];
      assert.ok(optionSet, `${target.optionSetRef} が辞書にない`);
      assert.equal(optionSet.answerFeature, target.answerFeature, "課題と回答候補の answerFeature が一致");
    }
  }
});

test("課題テンプレート: 刺激の中身(正解)を持たない", () => {
  for (const template of Object.values(TASK_TEMPLATES)) {
    const text = JSON.stringify(template);
    assert.equal(/correct|degree":"n\d/.test(text), false, "正解や音度の値を書かない");
  }
});

test("src/training は定義・解決だけ。DOM・保存・サーバー・音声に依存しない(importの許可リスト)", () => {
  // src/training/ 内のファイル同士と、共通の小さな部品(HTMLの無害化・1回だけ受付・音声の再生・時刻表記)、
  // 機能的音感の音声時計タイマーだけを許可する(保存・送信・サーバーには依存しない)。
  const allowed = /^(\.\/[a-z-]+\.js|\.\.\/shared\/(escape-html|answer-lock|audio-buffer-player|iso-time)\.js|\.\.\/functional-pitch\/audio-clock\.js)$/;
  const files = readdirSync(new URL("../../src/training/", import.meta.url)).filter((name) => name.endsWith(".js"));
  assert.ok(files.length >= 2);
  for (const file of files) {
    const source = readFileSync(new URL(`../../src/training/${file}`, import.meta.url), "utf8");
    for (const [, path] of source.matchAll(/from "(.*)";/g)) {
      assert.match(path, allowed, `${file} が ${path} をimportしている`);
    }
    assert.equal(/\b(document|localStorage|sessionStorage|fetch|AudioContext)\b/.test(source.replace(/\/\/.*$/gm, "")), false, `${file} がブラウザのAPIを使っている`);
  }
});
