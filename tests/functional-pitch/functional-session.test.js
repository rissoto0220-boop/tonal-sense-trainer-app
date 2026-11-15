import { test } from "node:test";
import assert from "node:assert/strict";
import { runFunctionalPitchSession } from "../../src/functional-pitch/functional-session.js";
import { runKeyMeasurement } from "../../src/functional-pitch/key-measurement.js";
import { createFakeScreen } from "./helpers/fake-screen.js";
import { ERROR_KINDS } from "../../src/shared/error-kinds.js";

// 各段階(音色確認・練習・Keyごとの測定)の代わりに、呼び出しと破棄を記録するだけの偽物。
function createFakeStages() {
  const calls = { toneCheck: [], practice: [], key: [] };
  const destroyed = { toneCheck: 0, practice: 0, key: 0 };
  return {
    calls,
    destroyed,
    runToneCheckFn: (args) => { calls.toneCheck.push(args); return { destroy: () => { destroyed.toneCheck += 1; } }; },
    runPracticeFlowFn: (args) => { calls.practice.push(args); return { destroy: () => { destroyed.practice += 1; } }; },
    runKeyMeasurementFn: (args) => { calls.key.push(args); return { destroy: () => { destroyed.key += 1; } }; },
  };
}

function setup(options = {}) {
  const screenEl = createFakeScreen();
  const stages = createFakeStages();
  const measured = [];
  const exits = [];
  const session = runFunctionalPitchSession({
    screenEl,
    onKeyMeasured: (result) => measured.push(result),
    runToneCheckFn: stages.runToneCheckFn,
    runPracticeFlowFn: stages.runPracticeFlowFn,
    runKeyMeasurementFn: stages.runKeyMeasurementFn,
    ...options,
  });
  return { screenEl, stages, measured, exits, session };
}

const PRACTICE_RESULTS = [{ practice_round: 1, practice_number: 1, melody_change_rating: 3 }];

test("practiceRequired が真(既定): 音色確認から始まり、Key選択はまだ出ない", () => {
  const { screenEl, stages } = setup();
  assert.equal(stages.calls.toneCheck.length, 1);
  assert.equal(stages.calls.practice.length, 0);
  assert.equal(screenEl.querySelector("[data-key]"), null);
});

test("音色確認 → 練習 → Key選択の順に進む", () => {
  const { screenEl, stages } = setup();
  stages.calls.toneCheck[0].onProceed();
  assert.equal(stages.calls.practice.length, 1);
  assert.equal(screenEl.querySelector("[data-key]"), null);
  stages.calls.practice[0].onFinished({ practice_results: PRACTICE_RESULTS });
  assert.deepEqual(screenEl.querySelectorAll("[data-key]").map((b) => b.dataset.key), ["C", "Fis"]);
  assert.match(screenEl.innerHTML, /実施するKeyを選択してください/);
});

test("practiceRequired が偽: 音色確認と練習を飛ばして、Key選択から始まる", () => {
  const { screenEl, stages } = setup({ practiceRequired: false });
  assert.equal(stages.calls.toneCheck.length, 0);
  assert.equal(stages.calls.practice.length, 0);
  assert.equal(screenEl.querySelectorAll("[data-key]").length, 2);
});

test("練習へ進んだ時点で音色確認が、Key選択へ進んだ時点で練習が、それぞれ破棄される", () => {
  const { stages } = setup();
  stages.calls.toneCheck[0].onProceed();
  assert.equal(stages.destroyed.toneCheck, 1);
  stages.calls.practice[0].onFinished({ practice_results: PRACTICE_RESULTS });
  assert.equal(stages.destroyed.practice, 1);
});

test("Key C を選ぶと、Key C の測定が始まる(短縮設定・追加の引数も渡る)", () => {
  const { screenEl, stages } = setup({
    practiceRequired: false,
    trialLimit: 5,
    keyMeasurementOptions: { trialControllerOptions: { marker: 1 } },
  });
  screenEl.button('[data-key="C"]').click();
  const [call] = stages.calls.key;
  assert.equal(call.keyCode, "C");
  assert.equal(call.trialLimit, 5);
  assert.deepEqual(call.trialControllerOptions, { marker: 1 });
  assert.equal(call.screenEl, screenEl);
});

test("Key を押した直後に、2つのボタンが無効になる(二重押しで2回始まらない)", () => {
  const { screenEl, stages } = setup({ practiceRequired: false });
  screenEl.button('[data-key="C"]').click();
  screenEl.button('[data-key="Fis"]').click();
  assert.equal(stages.calls.key.length, 1);
});

test("測定結果には、これまでの練習結果(practice_results)が付いて onKeyMeasured へ渡る", () => {
  const { stages, measured } = setup();
  stages.calls.toneCheck[0].onProceed();
  stages.calls.practice[0].onFinished({ practice_results: PRACTICE_RESULTS });
  const { screenEl } = { screenEl: stages.calls.practice[0].screenEl };
  screenEl.button('[data-key="Fis"]').click();
  stages.calls.key[0].onMeasured({
    measurement_key_code: "Fis",
    measurement_status: "completed",
    completed_trials: [],
    generated_trial_order: [],
  });
  assert.equal(measured.length, 1);
  assert.deepEqual(Object.keys(measured[0]).sort(), [
    "completed_trials", "generated_trial_order", "measurement_key_code", "measurement_status", "practice_results",
  ]);
  assert.deepEqual(measured[0].practice_results, PRACTICE_RESULTS);
  measured[0].practice_results[0].melody_change_rating = 99; // 渡した複製を変えても内部は変わらない
  stages.calls.key[0].onMeasured({ measurement_key_code: "Fis", measurement_status: "completed", completed_trials: [], generated_trial_order: [] });
  assert.equal(measured[1].practice_results[0].melody_change_rating, 3);
});

test("練習をしていないときの practice_results は空配列", () => {
  const { screenEl, stages, measured } = setup({ practiceRequired: false });
  screenEl.button('[data-key="C"]').click();
  stages.calls.key[0].onMeasured({ measurement_key_code: "C", measurement_status: "completed", completed_trials: [], generated_trial_order: [] });
  assert.deepEqual(measured[0].practice_results, []);
});

test("測定の完了後、「Key選択へ戻る」でKey選択に戻り、同じKeyも別のKeyも選べる", () => {
  const { screenEl, stages } = setup({ practiceRequired: false });
  screenEl.button('[data-key="C"]').click();
  stages.calls.key[0].onBack();
  assert.equal(stages.destroyed.key, 1); // 前のKeyの測定は破棄される
  assert.equal(screenEl.querySelectorAll("[data-key]").length, 2);
  screenEl.button('[data-key="C"]').click(); // 同じKey
  stages.calls.key[1].onBack();
  screenEl.button('[data-key="Fis"]').click(); // 別のKey
  assert.deepEqual(stages.calls.key.map((c) => c.keyCode), ["C", "C", "Fis"]);
});

test("Keyの選択に順序や回数の制限がない(同じKeyを何度でも選べる)", () => {
  const { screenEl, stages } = setup({ practiceRequired: false });
  for (let i = 0; i < 4; i += 1) {
    screenEl.button('[data-key="Fis"]').click();
    stages.calls.key[i].onBack();
  }
  assert.equal(stages.calls.key.length, 4);
});

test("onExit を渡すと「テスト選択へ戻る」が出て、押すと破棄してから onExit を呼ぶ", () => {
  const exits = [];
  const { screenEl, stages } = setup({ practiceRequired: false, onExit: () => exits.push("exit") });
  screenEl.button('[data-role="exit"]').click();
  assert.deepEqual(exits, ["exit"]);
  assert.equal(stages.calls.key.length, 0);
});

test("onExit を渡さないと「テスト選択へ戻る」は出ない", () => {
  const { screenEl } = setup({ practiceRequired: false });
  assert.equal(screenEl.button('[data-role="exit"]'), undefined);
});

test("onSessionStarted には練習結果が加わり、onTrialStarted / onTrialConfirmed はそのまま測定へ渡る", () => {
  const started = [];
  const onTrialStarted = () => {};
  const onTrialConfirmed = () => {};
  const { stages } = setup({ onSessionStarted: (info) => started.push(info), onTrialStarted, onTrialConfirmed });
  stages.calls.toneCheck[0].onProceed();
  stages.calls.practice[0].onFinished({ practice_results: PRACTICE_RESULTS });
  stages.calls.practice[0].screenEl.button('[data-key="C"]').click();
  const [call] = stages.calls.key;
  assert.equal(call.onTrialStarted, onTrialStarted);
  assert.equal(call.onTrialConfirmed, onTrialConfirmed);
  call.onSessionStarted({ measurement_key_code: "C", generated_trial_order: [], total_trial_count: 90 });
  assert.deepEqual(started, [{ measurement_key_code: "C", generated_trial_order: [], total_trial_count: 90, practice_results: PRACTICE_RESULTS }]);
});

test("onShowHistory を渡すと「履歴・CSVを見る」が出て、渡された関数でKey選択へ戻れる", () => {
  const backs = [];
  const { screenEl, stages } = setup({ practiceRequired: false, onShowHistory: (back) => backs.push(back) });
  screenEl.button('[data-role="history"]').click();
  assert.equal(backs.length, 1);
  screenEl.innerHTML = "<h2>履歴</h2>"; // 履歴画面に切り替わった代わり
  backs[0]();
  assert.equal(screenEl.querySelectorAll("[data-key]").length, 2);
  assert.equal(stages.calls.key.length, 0);
});

test("onShowHistory を渡さないと「履歴・CSVを見る」は出ない", () => {
  const { screenEl } = setup({ practiceRequired: false });
  assert.equal(screenEl.button('[data-role="history"]'), undefined);
});

test("音色確認・練習への追加の引数が渡る", () => {
  const { stages } = setup({ toneCheckOptions: { controllerOptions: { a: 1 } }, practiceFlowOptions: { trialControllerOptions: { b: 2 } } });
  assert.deepEqual(stages.calls.toneCheck[0].controllerOptions, { a: 1 });
  stages.calls.toneCheck[0].onProceed();
  assert.deepEqual(stages.calls.practice[0].trialControllerOptions, { b: 2 });
});

test("destroy: 現在の段階を破棄し、以後 Key選択へ戻る操作が来ても画面を描き直さない", () => {
  const { screenEl, stages, session } = setup({ practiceRequired: false });
  screenEl.button('[data-key]').click();
  session.destroy();
  assert.equal(stages.destroyed.key, 1);
  const htmlBefore = screenEl.innerHTML;
  stages.calls.key[0].onBack();
  assert.equal(screenEl.innerHTML, htmlBefore);
});

test("destroy は何度呼んでも安全", () => {
  const { session } = setup();
  session.destroy();
  assert.doesNotThrow(() => session.destroy());
});

test("結合: 本物の runKeyMeasurement とつなぐと、練習結果つきの完全な結果が1回渡る", async () => {
  const screenEl = createFakeScreen();
  const trialStarts = [];
  const measured = [];
  let guardEnabled = 0;
  runFunctionalPitchSession({
    screenEl,
    practiceRequired: false,
    trialLimit: 2,
    onKeyMeasured: (result) => measured.push(result),
    keyMeasurementOptions: {
      resumeAudioContextFn: () => Promise.resolve(),
      loadKeyPhrasesFn: () => Promise.resolve({ ok: true, failures: [] }),
      enableUnloadGuardFn: () => { guardEnabled += 1; return () => {}; },
      mountTrialScreenFn: () => ({ start: (args) => trialStarts.push(args), destroy() {} }),
    },
    runKeyMeasurementFn: runKeyMeasurement,
  });
  screenEl.button('[data-key="Fis"]').click();
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  const confirmed = (n) => ({
    melody_change_rating: n, harmony_change_rating: n, overall_change_rating: n,
    response_enabled_at: "E", response_confirmed_at: "C", response_time_ms: n,
  });
  trialStarts.at(-1).onConfirmed(confirmed(1));
  trialStarts.at(-1).onConfirmed(confirmed(2));
  assert.equal(guardEnabled, 1);
  assert.equal(measured.length, 1);
  assert.equal(measured[0].measurement_key_code, "Fis");
  assert.equal(measured[0].measurement_status, "completed");
  assert.equal(measured[0].completed_trials.length, 2);
  assert.equal(measured[0].generated_trial_order.length, 90);
  assert.deepEqual(measured[0].practice_results, []);
  assert.deepEqual(trialStarts.map((s) => s.trial.keyCode), ["Fis", "Fis"]);
});

// --- 音色確認・練習の音声エラー(2026-11-14: テスト選択へ戻れるエラー画面) ---

test("音色確認のエラー: 音色確認を破棄し、見出し付きのエラー画面。「テスト選択へ戻る」で onExit", () => {
  const exits = [];
  const { screenEl, stages } = setup({ onExit: () => exits.push("exit") });
  stages.calls.toneCheck[0].onError({ kind: "load" });
  assert.equal(stages.destroyed.toneCheck, 1);
  assert.match(screenEl.innerHTML, /<h2 tabindex="-1">音声を読み込めませんでした<\/h2>/);
  // 文言はエラーの種類の表(src/shared/error-kinds.js)。まだセッションは始まっていないので、記録はない
  assert.match(screenEl.innerHTML, /音声ファイルを読み込めませんでした。/);
  assert.match(screenEl.innerHTML, /まだ記録は残っていません。/);
  assert.match(screenEl.innerHTML, /テスト選択へ戻って、やり直してください。/);
  screenEl.button('[data-role="back"]').click();
  assert.deepEqual(exits, ["exit"]);
});

test("練習のエラー: 練習を破棄し、エラーの種類ごとの見出し。長さの不一致は研究者への連絡も促す", () => {
  const { screenEl, stages } = setup({ onExit: () => {} });
  stages.calls.toneCheck[0].onProceed();
  stages.calls.practice[0].onError({ kind: "duration" });
  assert.equal(stages.destroyed.practice, 1);
  assert.match(screenEl.innerHTML, new RegExp(ERROR_KINDS["audio-duration"].title));
  assert.match(screenEl.innerHTML, /研究者へお知らせください。テスト選択へ戻って/);
  assert.ok(screenEl.button('[data-role="back"]'));
});

test("エラーの見出し: load / duration / schedule / start は、表の audio-load / audio-duration / audio-play / audio-start。不明な種類は load と同じ", () => {
  const titleOf = (notice) => {
    const { screenEl, stages } = setup({ onExit: () => {} });
    stages.calls.toneCheck[0].onError({ kind: notice });
    return screenEl.innerHTML.match(/<h2[^>]*>([^<]+)<\/h2>/)[1];
  };
  assert.equal(titleOf("load"), ERROR_KINDS["audio-load"].title);
  assert.equal(titleOf("duration"), ERROR_KINDS["audio-duration"].title);
  assert.equal(titleOf("schedule"), ERROR_KINDS["audio-play"].title);
  assert.equal(titleOf("start"), ERROR_KINDS["audio-start"].title);
  assert.equal(titleOf("unknown"), ERROR_KINDS["audio-load"].title);
});

test("onExit を渡さないと、エラー画面に戻るボタンを出さない(開発用ページ)", () => {
  const { screenEl, stages } = setup();
  stages.calls.toneCheck[0].onError({ kind: "load" });
  assert.equal(screenEl.button('[data-role="back"]'), undefined);
});

// --- ページを閉じる前の確認(2026-11-14: 練習の開始から結果まで) ---

function createFakeGuard() {
  const guard = { enabled: 0, released: 0, active: () => guard.enabled - guard.released };
  guard.fn = () => {
    guard.enabled += 1;
    let done = false;
    return () => { if (!done) { done = true; guard.released += 1; } };
  };
  return guard;
}

test("確認: 音色確認の開始で有効、練習の間も続き、Key選択で解除する", () => {
  const guard = createFakeGuard();
  const { stages } = setup({ enableUnloadGuardFn: guard.fn });
  assert.equal(guard.active(), 1, "音色確認の開始で有効");
  stages.calls.toneCheck[0].onProceed();
  assert.equal(guard.active(), 1, "練習の間も有効のまま");
  stages.calls.practice[0].onFinished({ practice_results: PRACTICE_RESULTS });
  assert.equal(guard.active(), 0, "Key選択で解除");
  assert.equal(guard.enabled, 1, "途中で付け直さない");
});

test("確認: 音色確認・練習のエラー画面で解除する", () => {
  const toneGuard = createFakeGuard();
  setup({ enableUnloadGuardFn: toneGuard.fn, onExit: () => {} }).stages.calls.toneCheck[0].onError({ kind: "load" });
  assert.equal(toneGuard.active(), 0);
  const practiceGuard = createFakeGuard();
  const { stages } = setup({ enableUnloadGuardFn: practiceGuard.fn, onExit: () => {} });
  stages.calls.toneCheck[0].onProceed();
  stages.calls.practice[0].onError({ kind: "load" });
  assert.equal(practiceGuard.active(), 0);
});

test("確認: destroy で解除する。practiceRequired が偽(Key選択から始める)なら有効にしない", () => {
  const guard = createFakeGuard();
  const { session } = setup({ enableUnloadGuardFn: guard.fn });
  session.destroy();
  assert.equal(guard.active(), 0);
  const skipGuard = createFakeGuard();
  setup({ practiceRequired: false, enableUnloadGuardFn: skipGuard.fn });
  assert.equal(skipGuard.enabled, 0);
});

// 2026-11-15 研究者の決定: 音色の確認の「戻る」は、説明画面へ戻る。まだセッションがないので記録は残らない。
test("音色確認に onBack を渡す。押すと、音色確認を破棄(音とページを閉じる前の確認も止める)してから onBackToIntro", () => {
  const log = [];
  const { stages } = setup({ onBackToIntro: () => log.push("intro"), enableUnloadGuardFn: () => () => log.push("guard-off") });
  assert.equal(typeof stages.calls.toneCheck[0].onBack, "function");
  stages.calls.toneCheck[0].onBack();
  assert.deepEqual(log, ["guard-off", "intro"]);
  assert.equal(stages.destroyed.toneCheck, 1);
  assert.equal(stages.calls.practice.length, 0, "練習へは進まない");
  assert.equal(stages.calls.key.length, 0, "測定は始まらない");
});

test("onBackToIntro がなければ、音色確認に onBack を渡さない(「戻る」を出さない)", () => {
  const { stages } = setup();
  assert.equal(stages.calls.toneCheck[0].onBack, null);
});
