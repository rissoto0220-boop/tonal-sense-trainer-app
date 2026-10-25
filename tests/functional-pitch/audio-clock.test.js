import { test } from "node:test";
import assert from "node:assert/strict";
import { createClockScheduler } from "../../src/functional-pitch/audio-clock.js";

// 壁時計(タイマー用、ミリ秒)と音声時計(秒)を別々に進められる疑似環境。
function createFakeClock({ startAudioSeconds = 10 } = {}) {
  let wallMs = 0;
  let audioMs = startAudioSeconds * 1000;
  let nextId = 1;
  const timers = new Map();

  function run(targetWallMs, audioFollowsWall) {
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= targetWallMs).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      timers.delete(id);
      if (audioFollowsWall) audioMs += timer.at - wallMs;
      wallMs = timer.at;
      timer.fn();
    }
    if (audioFollowsWall) audioMs += targetWallMs - wallMs;
    wallMs = targetWallMs;
  }

  return {
    audioContextTimeFn: () => audioMs / 1000,
    setTimeoutFn: (fn, delayMs) => {
      const id = nextId++;
      timers.set(id, { at: Math.round((wallMs + delayMs) * 1000) / 1000, fn });
      return id;
    },
    clearTimeoutFn: (id) => { timers.delete(id); },
    tick: (seconds) => run(wallMs + seconds * 1000, true),
    tickWallOnly: (seconds) => run(wallMs + seconds * 1000, false),
    fireEarliestNow() {
      const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      timers.delete(id);
      timer.fn();
    },
    pending: () => timers.size,
  };
}

function setup() {
  const env = createFakeClock();
  const scheduler = createClockScheduler({
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    audioContextTimeFn: env.audioContextTimeFn,
  });
  return { env, scheduler };
}

test("指定した音声時刻になったら関数を1回だけ呼ぶ", () => {
  const { env, scheduler } = setup();
  const calls = [];
  scheduler.runAt(12, () => calls.push(env.audioContextTimeFn()));
  env.tick(1.9);
  assert.deepEqual(calls, []);
  env.tick(0.2);
  assert.equal(calls.length, 1);
  assert.ok(Math.abs(calls[0] - 12) < 1e-6);
  env.tick(10);
  assert.equal(calls.length, 1);
});

test("複数の予約は時刻の順に呼ばれる", () => {
  const { env, scheduler } = setup();
  const order = [];
  scheduler.runAt(15, () => order.push("c"));
  scheduler.runAt(11, () => order.push("a"));
  scheduler.runAt(13, () => order.push("b"));
  env.tick(10);
  assert.deepEqual(order, ["a", "b", "c"]);
});

test("タイマーが予定より早く発火しても、音声時計が追いつくまで呼ばない(再予約する)", () => {
  const { env, scheduler } = setup();
  const calls = [];
  scheduler.runAt(12, () => calls.push("called"));
  env.fireEarliestNow(); // 音声時計は10秒のまま
  assert.deepEqual(calls, []);
  assert.equal(env.pending(), 1);
  env.tick(2.1);
  assert.deepEqual(calls, ["called"]);
});

test("音声時計が止まっている間は呼ばず、再開すると呼ぶ", () => {
  const { env, scheduler } = setup();
  const calls = [];
  scheduler.runAt(12, () => calls.push("called"));
  env.tickWallOnly(60);
  assert.deepEqual(calls, []);
  env.tick(5);
  assert.deepEqual(calls, ["called"]);
});

test("すでに過ぎた時刻の予約は、すぐ呼ばれる", () => {
  const { env, scheduler } = setup();
  const calls = [];
  scheduler.runAt(5, () => calls.push("called"));
  env.tick(0.001);
  assert.deepEqual(calls, ["called"]);
});

test("cancelAll: 予約を消し、以後は呼ばれず、新しい予約も受け付けない", () => {
  const { env, scheduler } = setup();
  const calls = [];
  scheduler.runAt(12, () => calls.push("a"));
  scheduler.cancelAll();
  assert.equal(env.pending(), 0);
  scheduler.runAt(13, () => calls.push("b"));
  assert.equal(env.pending(), 0);
  env.tick(10);
  assert.deepEqual(calls, []);
});

test("cancelAll は何度呼んでも安全", () => {
  const { scheduler } = setup();
  scheduler.cancelAll();
  assert.doesNotThrow(() => scheduler.cancelAll());
});
