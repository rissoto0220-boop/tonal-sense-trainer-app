import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTrialHtml, PHASE_TEXT, ERROR_TEXT, PHRASE_STATE_TEXT, phraseStates } from "../../src/functional-pitch/trial-screen.js";
import { RATING_ITEMS } from "../../src/functional-pitch/rating-state.js";

const html = buildTrialHtml();

test("ラジオボタンは21個で、3つのグループ×7個(値は1〜7)", () => {
  const radios = [...html.matchAll(/<input type="radio" name="([^"]+)" value="(\d+)">/g)];
  assert.equal(radios.length, 21);
  for (const item of RATING_ITEMS) {
    const values = radios.filter((m) => m[1] === `rating-${item.key}`).map((m) => Number(m[2]));
    assert.deepEqual(values, [1, 2, 3, 4, 5, 6, 7], item.key);
  }
});

test("質問文は旋律→和音→全体の順で、仕様の文言どおり", () => {
  const positions = RATING_ITEMS.map((item) => html.indexOf(item.question));
  assert.ok(positions.every((p) => p >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(html, /<legend class="rating-question">フレーズ1とフレーズ2では、リコーダー音の印象が変化したように感じた。<\/legend>/);
});

test("両端のラベルが3項目それぞれにあり、中央(4)に追加ラベルはない", () => {
  assert.equal(html.split("全くそう思わない").length - 1, 3);
  assert.equal(html.split("とてもそう思う").length - 1, 3);
  assert.match(html, /<span class="rating-option__face">4<\/span>/);
});

test("各項目は fieldset(初期状態は無効)で、端のラベルと aria-describedby で結び付く", () => {
  const fieldsets = [...html.matchAll(/<fieldset class="rating-item" data-item="(\w+)" aria-describedby="([^"]+)" disabled>/g)];
  assert.equal(fieldsets.length, 3);
  for (const [, key, describedBy] of fieldsets) {
    assert.equal(describedBy, `rating-ends-${key}`);
    assert.ok(html.includes(`id="rating-ends-${key}"`));
  }
});

test("「次の問題へ」は初期状態で無効", () => {
  assert.match(html, /<button type="button" class="primary" data-role="next" disabled>次の問題へ<\/button>/);
});

test("再生状態の文言は aria-live=off で、別に読み上げ専用の領域(role=status)がある", () => {
  assert.match(html, /data-role="status" aria-live="off"/);
  assert.match(html, /role="status" data-role="announcer"/);
});

test("再生状態・エラーの文言は仕様どおり", () => {
  assert.deepEqual(PHASE_TEXT, {
    preparing: "音声を準備しています…",
    phrase1: "フレーズ1を再生しています",
    gap: "次のフレーズを再生します",
    phrase2: "フレーズ2を再生しています",
    answerable: "それぞれの印象の変化を回答してください",
  });
  assert.match(ERROR_TEXT.load, /ページを再読み込みしてください/);
});

test("正解・不正解を連想させる語が画面に含まれない", () => {
  const visible = html + JSON.stringify(PHASE_TEXT);
  for (const word of ["正解", "不正解", "正しい", "間違", "誤り", "correct", "wrong"]) {
    assert.equal(visible.includes(word), false, word);
  }
});

test("再生中アニメーション用の印(functional-trial--animated)と、2つの枠それぞれの点3つが含まれる", () => {
  assert.match(html, /functional-trial--animated/);
  assert.equal(html.split("<i></i>").length - 1, 6);
});

test("図: フレーズ1・フレーズ2の2つの枠と矢印があり、初期状態はどちらも待機中", () => {
  assert.match(html, /data-phrase="1" data-state="waiting"/);
  assert.match(html, /data-phrase="2" data-state="waiting"/);
  assert.ok(html.indexOf('data-phrase="1"') < html.indexOf("→") && html.indexOf("→") < html.indexOf('data-phrase="2"'));
  assert.match(html, /<span class="functional-phrase__name">フレーズ1<\/span>/);
  assert.match(html, /<span class="functional-phrase__name">フレーズ2<\/span>/);
  assert.equal(html.split(`>${PHRASE_STATE_TEXT.waiting}<`).length - 1, 2);
});

test("図は読み上げの対象外(aria-hidden)で、状態の読み上げは従来の領域だけが担う", () => {
  assert.match(html, /<div class="functional-phrases" aria-hidden="true">/);
  assert.equal(html.split(' role="status"').length - 1, 1); // data-role="status" は数えない
});

test("phraseStates: 段階ごとの2つの枠の状態", () => {
  assert.deepEqual(phraseStates("preparing"), { phrase1: "waiting", phrase2: "waiting" });
  assert.deepEqual(phraseStates("phrase1"), { phrase1: "playing", phrase2: "waiting" });
  assert.deepEqual(phraseStates("gap"), { phrase1: "played", phrase2: "waiting" });
  assert.deepEqual(phraseStates("phrase2"), { phrase1: "played", phrase2: "playing" });
  assert.deepEqual(phraseStates("answerable"), { phrase1: "played", phrase2: "played" });
  assert.deepEqual(phraseStates("error"), { phrase1: "waiting", phrase2: "waiting" });
});

test("phraseStates: 再生中の枠が同時に2つになることはない", () => {
  for (const phase of ["preparing", "phrase1", "gap", "phrase2", "answerable", "error"]) {
    const playing = Object.values(phraseStates(phase)).filter((state) => state === "playing");
    assert.ok(playing.length <= 1, phase);
  }
});

test("枠の状態の文字は 待機中/再生中/再生済み", () => {
  assert.deepEqual(PHRASE_STATE_TEXT, { waiting: "待機中", playing: "再生中", played: "再生済み" });
});

test("document が無い環境でも trial-screen.js のimportで例外にならない", async () => {
  await assert.doesNotReject(import("../../src/functional-pitch/trial-screen.js"));
});

test("styles.css: 動きを減らす設定で、再生中アニメーションが止まる", () => {
  const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.functional-playing i \{ animation: none; \}/);
});

test("測定本体の画面はユーザー・保存・CSV・サーバーに依存しない(importしていない)", () => {
  for (const file of ["rating-state.js", "trial-controller.js", "trial-screen.js"]) {
    const source = readFileSync(new URL(`../../src/functional-pitch/${file}`, import.meta.url), "utf8");
    const imports = [...source.matchAll(/from "(.*)";/g)].map((m) => m[1]);
    for (const path of imports) {
      assert.match(
        path,
        /^(\.\/(rating-state|trial-controller|trial-timeline)\.js|\.\.\/shared\/escape-html\.js)$/,
        `${file} が ${path} をimportしている`,
      );
    }
  }
});
