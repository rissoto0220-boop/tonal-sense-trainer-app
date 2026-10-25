import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildKeySelectHtml,
  buildLoadingHtml,
  buildCompletionHtml,
  buildLoadErrorHtml,
  buildInterruptedHtml,
  buildInternalErrorHtml,
  showKeySelectScreen,
  showBackScreen,
} from "../../src/functional-pitch/measurement-screens.js";
import { createFakeScreen } from "./helpers/fake-screen.js";

const FORBIDDEN = ["正解", "不正解", "正答", "得点", "平均", "スコア", "点数", "%"];
function assertNoScoreWords(html) {
  for (const word of FORBIDDEN) assert.equal(html.includes(word), false, word);
}

test("Key選択: 「Key C」「Key Fis」の2つのボタンが、同じクラスで並ぶ", () => {
  const html = buildKeySelectHtml();
  const buttons = [...html.matchAll(/<button type="button" class="([^"]+)" data-key="(\w+)">([^<]+)<\/button>/g)];
  assert.deepEqual(buttons.map((m) => m[2]), ["C", "Fis"]);
  assert.deepEqual(buttons.map((m) => m[3]), ["Key C", "Key Fis"]);
  assert.equal(buttons[0][1], buttons[1][1]); // 見た目が同じ(どちらかへ誘導しない)
  assert.match(html, /実施するKeyを選択してください/);
});

test("Key選択: 常に両方選べる(無効のボタンがない)。完了済みの表示もない", () => {
  const html = buildKeySelectHtml();
  assert.equal(html.includes("disabled"), false);
  assert.equal(html.includes("完了"), false);
});

test("Key選択: 「テスト選択へ戻る」は、指定したときだけ表示する", () => {
  assert.equal(buildKeySelectHtml().includes("テスト選択へ戻る"), false);
  assert.match(buildKeySelectHtml({ showExit: true }), /data-role="exit">テスト選択へ戻る<\/button>/);
});

test("完了画面: 仕様どおりの文言(Key C / Key Fis)と、Key選択へ戻るボタン", () => {
  const c = buildCompletionHtml("C");
  assert.match(c, /Key Cの測定が終了しました。/);
  assert.match(c, /ご回答ありがとうございました。/);
  assert.match(c, /data-role="back">Key選択へ戻る<\/button>/);
  assert.match(buildCompletionHtml("Fis"), /Key Fisの測定が終了しました。/);
});

test("完了画面: 得点・正答率・評定の平均などを表示しない", () => {
  assertNoScoreWords(buildCompletionHtml("C"));
  assertNoScoreWords(buildCompletionHtml("Fis"));
});

test("読み込み中の画面", () => {
  assert.match(buildLoadingHtml(), /音声を準備しています…/);
});

test("音源の読み込みエラー: 件数と失敗したファイル名(研究者向け)を表示し、Key選択へ戻れる", () => {
  const html = buildLoadErrorHtml([
    { src: "public/sounds/functional-pitch/c-phr-ch-n1-maj-mel-n1-v01.wav", reason: "load" },
    { src: "public/sounds/functional-pitch/c-phr-ch-n4-maj-mel-n4-v01.wav", reason: "duration", durationSeconds: 2 },
  ]);
  assert.match(html, /2件/);
  assert.match(html, /c-phr-ch-n1-maj-mel-n1-v01\.wav\(読み込めません\)/);
  assert.match(html, /c-phr-ch-n4-maj-mel-n4-v01\.wav\(長さが想定と異なります\)/);
  assert.equal(html.includes("public/sounds"), false); // フォルダーは出さずファイル名だけ
  assert.match(html, /ページを再読み込み/);
  assert.match(html, /data-role="back">Key選択へ戻る<\/button>/);
});

test("音源の読み込みエラー: ファイル名にHTMLの特殊文字があっても安全に表示する", () => {
  const html = buildLoadErrorHtml([{ src: "a/<script>.wav", reason: "load" }]);
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /&lt;script&gt;/);
});

test("中断画面: 回答済みの試行数を表示し、Key選択へ戻れる", () => {
  const html = buildInterruptedHtml(37);
  assert.match(html, /音声エラーのため、測定を中断しました。\(37 試行まで回答済み\)/);
  assert.match(html, /data-role="back">Key選択へ戻る<\/button>/);
});

test("内部エラー画面: Key選択へ戻れる", () => {
  assert.match(buildInternalErrorHtml(), /data-role="back">Key選択へ戻る<\/button>/);
});

test("エラー画面にも、得点・正解などの語を含まない", () => {
  assertNoScoreWords(buildLoadErrorHtml([{ src: "x.wav", reason: "load" }]));
  assertNoScoreWords(buildInterruptedHtml(0));
  assertNoScoreWords(buildInternalErrorHtml());
});

test("showKeySelectScreen: Keyを押すと onSelect にKeyが渡り、全ボタンが無効になる", () => {
  const screenEl = createFakeScreen();
  const selected = [];
  showKeySelectScreen({ screenEl, onSelect: (key) => selected.push(key), onExit: () => {} });
  assert.equal(screenEl.querySelector("h2").focused, true);
  screenEl.button('[data-key="Fis"]').click();
  screenEl.button('[data-key="C"]').click(); // 無効になっているので受け付けない
  assert.deepEqual(selected, ["Fis"]);
  assert.ok(screenEl.querySelectorAll("button").every((b) => b.disabled));
});

test("showKeySelectScreen: 「テスト選択へ戻る」で onExit が呼ばれる(onExit が無ければボタンもない)", () => {
  const exits = [];
  const withExit = createFakeScreen();
  showKeySelectScreen({ screenEl: withExit, onSelect: () => {}, onExit: () => exits.push("exit") });
  withExit.button('[data-role="exit"]').click();
  assert.deepEqual(exits, ["exit"]);

  const withoutExit = createFakeScreen();
  showKeySelectScreen({ screenEl: withoutExit, onSelect: () => {} });
  assert.equal(withoutExit.button('[data-role="exit"]'), undefined);
});

test("showBackScreen: 「Key選択へ戻る」を押すと onBack が1回だけ呼ばれる", () => {
  const screenEl = createFakeScreen();
  let backs = 0;
  showBackScreen({ screenEl, html: buildCompletionHtml("C"), onBack: () => { backs += 1; } });
  assert.equal(screenEl.querySelector("h2").focused, true);
  const back = screenEl.button('[data-role="back"]');
  back.click();
  back.click(); // 二重押し(ボタンは無効になっている)
  assert.equal(backs, 1);
});

test("document が無い環境でも measurement-screens.js のimportで例外にならない", async () => {
  await assert.doesNotReject(import("../../src/functional-pitch/measurement-screens.js"));
});
