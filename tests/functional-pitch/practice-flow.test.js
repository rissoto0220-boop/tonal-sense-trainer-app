import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPracticeEndHtml, runPracticeFlow } from "../../src/functional-pitch/practice-flow.js";

// DOMの代わりに、終了画面の2つのボタンだけを持つ最小の偽物。
function createFakeScreen() {
  const buttons = {
    "start-main": { disabled: false, listener: null, addEventListener(type, fn) { this.listener = fn; } },
    retry: { disabled: false, listener: null, addEventListener(type, fn) { this.listener = fn; } },
  };
  return {
    html: "",
    buttons,
    set innerHTML(value) {
      this.html = value;
      Object.values(buttons).forEach((b) => { b.disabled = false; });
    },
    get innerHTML() { return this.html; },
    querySelector(selector) {
      if (selector === "h2") return { focus() {} };
      const role = selector.match(/data-role="([^"]+)"/)?.[1];
      return buttons[role] ?? null;
    },
    querySelectorAll() { return Object.values(buttons); },
  };
}

// 試行画面の代わりに、start の呼び出しを記録するだけの controller。
function createFakeMount() {
  const mounts = [];
  const fn = (screenEl) => {
    const controller = {
      starts: [],
      destroyed: false,
      start(args) { controller.starts.push(args); },
      destroy() { controller.destroyed = true; },
    };
    mounts.push({ screenEl, controller });
    return controller;
  };
  fn.mounts = mounts;
  fn.allStarts = () => mounts.flatMap((m) => m.controller.starts);
  return fn;
}

const CONFIRMED = (n) => ({
  melody_change_rating: n, harmony_change_rating: n, overall_change_rating: n,
  response_enabled_at: "E", response_confirmed_at: "C", response_time_ms: 100,
});

async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

function setup() {
  const screenEl = createFakeScreen();
  const mount = createFakeMount();
  const finished = [];
  let resumeCalls = 0;
  const flow = runPracticeFlow({
    screenEl,
    onFinished: (result) => finished.push(result),
    mountTrialScreenFn: mount,
    resumeAudioContextFn: () => { resumeCalls += 1; return Promise.resolve(); },
  });
  const confirmCurrent = (n = 1) => {
    const starts = mount.allStarts();
    starts[starts.length - 1].onConfirmed(CONFIRMED(n));
  };
  return { screenEl, mount, finished, flow, confirmCurrent, resumeCalls: () => resumeCalls };
}

test("終了画面のHTML: 「本番を開始する」と「練習をもう一度行う」の2つのボタン", () => {
  const html = buildPracticeEndHtml();
  assert.match(html, /data-role="start-main">本番を開始する<\/button>/);
  assert.match(html, /data-role="retry">練習をもう一度行う<\/button>/);
  assert.equal(html.split("<button").length - 1, 2);
});

test("終了画面に、条件名や正解・不正解を連想させる語は含まれない", () => {
  const html = buildPracticeEndHtml();
  for (const word of ["melody-change", "chord-change", "both-change", "正解", "不正解", "間違", "誤り"]) {
    assert.equal(html.includes(word), false, word);
  }
});

test("開始時に AudioContext の有効化を待ってから、練習1を始める", async () => {
  const { mount, resumeCalls } = setup();
  assert.equal(resumeCalls(), 1);
  assert.equal(mount.mounts.length, 0); // resume 完了前は始めない
  await flush();
  const [first] = mount.allStarts();
  assert.deepEqual(first.trial, { keyCode: "Es", firstStimulusId: "ch-n1-maj-mel-n1", secondStimulusId: "ch-n1-maj-mel-n3" });
  assert.equal(first.progressLabel, "練習 1 / 3");
  assert.equal(first.nextLabel, "次の問題へ");
});

test("3試行が固定順に進み、毎回「次の問題へ」と練習の進捗が渡る", async () => {
  const { mount, confirmCurrent } = setup();
  await flush();
  confirmCurrent();
  confirmCurrent();
  const starts = mount.allStarts();
  assert.deepEqual(starts.map((s) => s.progressLabel), ["練習 1 / 3", "練習 2 / 3", "練習 3 / 3"]);
  assert.deepEqual(starts.map((s) => s.nextLabel), ["次の問題へ", "次の問題へ", "次の問題へ"]);
  assert.equal(starts[1].trial.secondStimulusId, "ch-n4-maj-mel-n1");
  assert.equal(starts[2].trial.secondStimulusId, "ch-n5-dom7-mel-n7");
});

test("3試行が終わると終了画面になり、試行画面は破棄される", async () => {
  const { screenEl, mount, confirmCurrent } = setup();
  await flush();
  confirmCurrent();
  confirmCurrent();
  confirmCurrent();
  assert.match(screenEl.html, /練習が終わりました/);
  assert.equal(mount.mounts[0].controller.destroyed, true);
});

test("「本番を開始する」: 全ラウンドの practice_results を渡し、ボタンを無効にする", async () => {
  const { screenEl, finished, confirmCurrent } = setup();
  await flush();
  confirmCurrent(1); confirmCurrent(2); confirmCurrent(3);
  screenEl.buttons["start-main"].listener();
  screenEl.buttons["start-main"].listener?.(); // 続けて押しても、ボタンは無効になっている(画面上は押せない)
  assert.equal(screenEl.buttons["start-main"].disabled, true);
  assert.equal(screenEl.buttons.retry.disabled, true);
  assert.equal(finished[0].practice_results.length, 3);
  assert.deepEqual(finished[0].practice_results.map((r) => r.practice_round), [1, 1, 1]);
});

test("「練習をもう一度行う」: 音色確認へは戻らず、練習1から再開し、practice_round が増える", async () => {
  const { screenEl, mount, finished, confirmCurrent, resumeCalls } = setup();
  await flush();
  confirmCurrent(1); confirmCurrent(1); confirmCurrent(1);
  screenEl.buttons.retry.listener();
  await flush();
  assert.equal(resumeCalls(), 2); // 再開時も AudioContext の有効化を待つ
  const starts = mount.allStarts();
  assert.equal(starts[3].progressLabel, "練習 1 / 3");
  assert.deepEqual(starts[3].trial, starts[0].trial);
  confirmCurrent(5); confirmCurrent(5); confirmCurrent(5);
  screenEl.buttons["start-main"].listener();
  const rounds = finished[0].practice_results.map((r) => r.practice_round);
  assert.deepEqual(rounds, [1, 1, 1, 2, 2, 2]);
  assert.equal(finished[0].practice_results[0].melody_change_rating, 1); // 前回の回答が残っている
  assert.equal(finished[0].practice_results[3].melody_change_rating, 5);
});

test("destroy: 試行画面を破棄し、以後は練習を始めない", async () => {
  const { mount, flow } = setup();
  await flush();
  flow.destroy();
  assert.equal(mount.mounts[0].controller.destroyed, true);
});

test("resume の完了前に destroy すると、練習を始めない", async () => {
  const screenEl = createFakeScreen();
  const mount = createFakeMount();
  const flow = runPracticeFlow({
    screenEl,
    onFinished: () => {},
    mountTrialScreenFn: mount,
    resumeAudioContextFn: () => Promise.resolve(),
  });
  flow.destroy();
  await flush();
  assert.equal(mount.mounts.length, 0);
});

test("document が無い環境でも practice-flow.js のimportで例外にならない", async () => {
  await assert.doesNotReject(import("../../src/functional-pitch/practice-flow.js"));
});
