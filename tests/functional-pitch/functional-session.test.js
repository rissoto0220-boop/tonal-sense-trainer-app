import { test } from "node:test";
import assert from "node:assert/strict";
import { runFunctionalPitchSession } from "../../src/functional-pitch/functional-session.js";
import { runKeyMeasurement } from "../../src/functional-pitch/key-measurement.js";
import { createFakeScreen } from "./helpers/fake-screen.js";

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

test("document が無い環境でも functional-session.js のimportで例外にならない", async () => {
  await assert.doesNotReject(import("../../src/functional-pitch/functional-session.js"));
});
