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
  assert.match(buildLoadingHtml(), /<h2>音声の準備<\/h2>/);
});

test("音源の読み込みエラー: 件数と失敗したファイル名(研究者向け)を表示し、Key選択へ戻れる", () => {
  const html = buildLoadErrorHtml([
    { src: "public/sounds/functional-pitch/c-phr-ch-n1-maj-mel-n1-v01.wav", reason: "load" },
    { src: "public/sounds/functional-pitch/c-phr-ch-n4-maj-mel-n4-v01.wav", reason: "duration", durationSeconds: 2 },
  ]);
  // 見出し・文言はエラーの種類の表(src/shared/error-kinds.js)。読み込めないファイルがあるので「読み込めませんでした」
  assert.match(html, /<h2 tabindex="-1">音声を読み込めませんでした<\/h2>/);
  assert.match(html, /2件の音声ファイルに問題があります。/);
  assert.match(html, /c-phr-ch-n1-maj-mel-n1-v01\.wav\(読み込めません\)/);
  assert.match(html, /c-phr-ch-n4-maj-mel-n4-v01\.wav\(長さが想定と異なります\)/);
  assert.equal(html.includes("public/sounds"), false); // フォルダーは出さずファイル名だけ
  assert.match(html, /もう一方のKeyは選べます。/);
  assert.match(html, /まだ記録は残っていません。/);
  assert.match(html, /Key選択へ戻って、やり直してください。/);
  assert.match(html, /data-role="back">Key選択へ戻る<\/button>/);
});

test("音源の読み込みエラー: 長さの不一致だけなら、見出しは「長さが想定と異なります」。研究者への連絡も添える", () => {
  const html = buildLoadErrorHtml([{ src: "a/x.wav", reason: "duration" }]);
  assert.match(html, /<h2 tabindex="-1">音源の長さが想定と異なります<\/h2>/);
  assert.match(html, /研究者へお知らせください。Key選択へ戻って、やり直してください。/);
});

test("音源の読み込みエラー: ファイル名のない失敗(起動の失敗など)は、件数だけ数え、ファイル名の行を出さない", () => {
  const html = buildLoadErrorHtml([{ src: "", reason: "load" }]);
  assert.match(html, /1件の音声ファイルに問題があります。/);
  assert.equal(html.includes("()"), false);
});

test("音源の読み込みエラー: ファイル名にHTMLの特殊文字があっても安全に表示する", () => {
  const html = buildLoadErrorHtml([{ src: "a/<script>.wav", reason: "load" }]);
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /&lt;script&gt;/);
});

test("中断画面: 回答済みの試行数を表示し、Key選択へ戻れる", () => {
  const html = buildInterruptedHtml(37);
  assert.match(html, /37試行まで回答済み/);
  assert.match(html, /ここまでの回答は、中断として記録しました。/);
  assert.match(html, /data-role="back">Key選択へ戻る<\/button>/);
  // エラーの種類(音の時計が通知した種類を表の種類に直したもの)で、見出しが変わる
  assert.match(buildInterruptedHtml(1, "audio-play"), /<h2 tabindex="-1">音声を再生できませんでした<\/h2>/);
  assert.match(buildInterruptedHtml(1, "audio-duration"), /<h2 tabindex="-1">音源の長さが想定と異なります<\/h2>/);
});

test("内部エラー画面: Key選択へ戻れる。まだ記録は残っていない", () => {
  const html = buildInternalErrorHtml();
  assert.match(html, /<h2 tabindex="-1">開始できませんでした<\/h2>/);
  assert.match(html, /試行の順序を正しく作れませんでした。/);
  assert.match(html, /まだ記録は残っていません。/);
  assert.match(html, /data-role="back">Key選択へ戻る<\/button>/);
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

test("showKeySelectScreen: 「履歴・CSVを見る」で onShowHistory が呼ばれ、全ボタンが無効になる(無ければボタンもない)", () => {
  const shown = [];
  const withHistory = createFakeScreen();
  showKeySelectScreen({ screenEl: withHistory, onSelect: () => {}, onExit: () => {}, onShowHistory: () => shown.push("history") });
  assert.match(withHistory.innerHTML, /data-role="history">履歴・CSVを見る<\/button>/);
  withHistory.button('[data-role="history"]').click();
  assert.deepEqual(shown, ["history"]);
  assert.ok(withHistory.querySelectorAll("button").every((b) => b.disabled));

  const withoutHistory = createFakeScreen();
  showKeySelectScreen({ screenEl: withoutHistory, onSelect: () => {} });
  assert.equal(withoutHistory.button('[data-role="history"]'), undefined);
  assert.equal(buildKeySelectHtml().includes('class="actions"'), false);
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
