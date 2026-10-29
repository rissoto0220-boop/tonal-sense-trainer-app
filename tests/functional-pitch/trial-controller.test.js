import { test } from "node:test";
import assert from "node:assert/strict";
import { createTrialController } from "../../src/functional-pitch/trial-controller.js";

const TRIAL = { keyCode: "C", firstStimulusId: "ch-n1-maj-mel-n1", secondStimulusId: "ch-n1-maj-mel-n3" };

// 画面の代わりに、呼ばれた操作を記録するだけの view。
function createFakeView() {
  const calls = [];
  const record = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    names: () => calls.map((c) => c[0]),
    reset: record("reset"),
    setPhase: record("setPhase"),
    setRatingsEnabled: record("setRatingsEnabled"),
    setNextEnabled: record("setNextEnabled"),
    announceAnswerable: record("announceAnswerable"),
    lockAll: record("lockAll"),
    showError: record("showError"),
    lastNextEnabled: () => [...calls].reverse().find((c) => c[0] === "setNextEnabled")?.[1],
  };
}

// 音声タイムラインの代わりに、段階の通知を手動で起こせる偽物。
function createFakeTimeline() {
  const runs = [];
  const run = (trial, options) => {
    let enabled = false;
    let confirmed = false;
    const handle = {
      cancelled: false,
      confirm: () => {
        if (!enabled || confirmed || handle.cancelled) return null;
        confirmed = true;
        return { responseEnabledAt: "ENABLED", responseConfirmedAt: "CONFIRMED", responseTimeMs: 1234 };
      },
      cancel: () => { handle.cancelled = true; },
    };
    runs.push({
      trial, options, handle,
      becomeAnswerable() { enabled = true; options.onAnswerable({ responseEnabledAt: "ENABLED" }); },
    });
    return handle;
  };
  return { run, runs, last: () => runs[runs.length - 1] };
}

function setup() {
  const view = createFakeView();
  const timeline = createFakeTimeline();
  const controller = createTrialController({ view, runTrialTimelineFn: timeline.run });
  const confirmed = [];
  const errors = [];
  const start = (overrides = {}) => controller.start({
    trial: TRIAL,
    progressLabel: "1 / 90",
    onConfirmed: (result) => confirmed.push(result),
    onError: (error) => errors.push(error),
    ...overrides,
  });
  return { view, timeline, controller, confirmed, errors, start };
}

function selectAll(controller, values = [3, 4, 5]) {
  controller.select("melody", values[0]);
  controller.select("harmony", values[1]);
  controller.select("overall", values[2]);
}

test("start: 画面を初期化し、試行の刺激を音声タイムラインへ渡す", () => {
  const { view, timeline, start } = setup();
  start({ progressLabel: "21 / 90", nextLabel: "測定を終える" });
  assert.deepEqual(view.calls[0], ["reset", { progressLabel: "21 / 90", nextLabel: "測定を終える" }]);
  assert.deepEqual(timeline.last().trial, TRIAL);
});

test("start: 「次の問題へ」の文言は省略すると「次の問題へ」", () => {
  const { view, start } = setup();
  start();
  assert.equal(view.calls[0][1].nextLabel, "次の問題へ");
});

test("段階の通知は view へそのまま伝わる", () => {
  const { view, timeline, start } = setup();
  start();
  for (const phase of ["preparing", "phrase1", "gap", "phrase2"]) timeline.last().options.onPhase(phase);
  const phases = view.calls.filter((c) => c[0] === "setPhase").map((c) => c[1]);
  assert.deepEqual(phases, ["preparing", "phrase1", "gap", "phrase2"]);
});

test("回答可能になるまでラジオは有効にならず、選んでも何も起きない", () => {
  const { view, controller, confirmed, start } = setup();
  start();
  const before = view.calls.length;
  selectAll(controller);
  controller.next();
  assert.equal(view.calls.length, before);
  assert.equal(confirmed.length, 0);
});

test("回答可能になると、ラジオを有効化し、読み上げを通知する。「次の問題へ」はまだ無効", () => {
  const { view, timeline, start } = setup();
  start();
  timeline.last().becomeAnswerable();
  assert.ok(view.calls.some((c) => c[0] === "setPhase" && c[1] === "answerable"));
  assert.deepEqual(view.calls.find((c) => c[0] === "setRatingsEnabled"), ["setRatingsEnabled", true]);
  assert.ok(view.names().includes("announceAnswerable"));
  assert.equal(view.lastNextEnabled(), false);
});

test("3項目すべて選ぶまで「次の問題へ」は有効にならず、押しても確定しない", () => {
  const { view, timeline, controller, confirmed, start } = setup();
  start();
  timeline.last().becomeAnswerable();
  controller.select("melody", 3);
  controller.select("harmony", 4);
  assert.equal(view.lastNextEnabled(), false);
  controller.next();
  assert.equal(confirmed.length, 0);
  controller.select("overall", 5);
  assert.equal(view.lastNextEnabled(), true);
});

test("next: 確定値(6項目)を1度だけ返し、画面を無効にする", () => {
  const { view, timeline, controller, confirmed, start } = setup();
  start();
  timeline.last().becomeAnswerable();
  selectAll(controller, [1, 4, 7]);
  controller.next();
  assert.deepEqual(confirmed, [{
    melody_change_rating: 1,
    harmony_change_rating: 4,
    overall_change_rating: 7,
    response_enabled_at: "ENABLED",
    response_confirmed_at: "CONFIRMED",
    response_time_ms: 1234,
  }]);
  assert.ok(view.names().includes("lockAll"));
});

test("next を続けて押しても、確定は1回だけ(二重押しで次の試行を飛ばさない)", () => {
  const { timeline, controller, confirmed, start } = setup();
  start();
  timeline.last().becomeAnswerable();
  selectAll(controller);
  controller.next();
  controller.next();
  controller.next();
  assert.equal(confirmed.length, 1);
});

test("確定前の選び直しが最終値になり、確定後の選択は無視される", () => {
  const { timeline, controller, confirmed, start } = setup();
  start();
  timeline.last().becomeAnswerable();
  selectAll(controller, [1, 1, 1]);
  controller.select("melody", 6);
  controller.next();
  controller.select("melody", 2);
  controller.next();
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0].melody_change_rating, 6);
});

test("次の試行を start すると、前の試行は中止され、選択も引き継がれない", () => {
  const { timeline, controller, confirmed, start } = setup();
  start();
  timeline.last().becomeAnswerable();
  selectAll(controller, [2, 2, 2]);
  start({ progressLabel: "2 / 90" });
  assert.equal(timeline.runs[0].handle.cancelled, true);
  timeline.last().becomeAnswerable();
  controller.select("melody", 5);
  controller.select("harmony", 5);
  controller.next(); // overall が未選択なので確定しない
  assert.equal(confirmed.length, 0);
});

test("前の試行の通知(中止後)が来ても、現在の試行に影響しない", () => {
  const { view, timeline, controller, confirmed, errors, start } = setup();
  start();
  const old = timeline.last();
  start({ progressLabel: "2 / 90" });
  const callsBefore = view.calls.length;
  // 中止済みの試行からの通知(実際のタイムラインでは起きないが、防御として確認する)
  old.options.onPhase("phrase2");
  old.becomeAnswerable();
  old.options.onError({ kind: "load", error: new Error("late") });
  assert.equal(view.calls.length, callsBefore);
  assert.equal(errors.length, 0);
  selectAll(controller);
  controller.next();
  assert.equal(confirmed.length, 0);
});

test("destroy: タイムラインを中止し、以後の操作は何も起こさない", () => {
  const { timeline, controller, confirmed, start } = setup();
  start();
  timeline.last().becomeAnswerable();
  selectAll(controller);
  controller.destroy();
  assert.equal(timeline.last().handle.cancelled, true);
  controller.next();
  assert.equal(confirmed.length, 0);
});

test("音声エラー: view にエラーを表示し、全て無効にして、onError を呼ぶ。onConfirmed は呼ばれない", () => {
  const { view, timeline, controller, confirmed, errors, start } = setup();
  start();
  const failure = new Error("404");
  timeline.last().options.onError({ kind: "load", error: failure });
  assert.deepEqual(view.calls.filter((c) => c[0] === "showError"), [["showError", "load"]]);
  assert.equal(view.lastNextEnabled(), false);
  assert.deepEqual(errors, [{ kind: "load", error: failure }]);
  selectAll(controller);
  controller.next();
  assert.equal(confirmed.length, 0);
});
