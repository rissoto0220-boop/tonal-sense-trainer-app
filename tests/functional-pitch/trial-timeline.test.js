import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runTrialTimeline } from "../../src/functional-pitch/trial-timeline.js";

// 実際のAudioContext・setTimeoutを使わず、時計とタイマーを自分で進められる疑似環境。
// 壁時計(タイマー用、ミリ秒)と音声時計(秒)を別々に進められるので、
// 「タイマーが早く発火した」「音声時計が止まっている」などの状況も再現できる。
function createFakeEnv({ durations = [4.8, 4.8], startAudioSeconds = 10 } = {}) {
  let wallMs = 0;
  let audioMs = startAudioSeconds * 1000;
  let nextId = 1;
  const timers = new Map();
  const loadedSrcs = [];
  const scheduled = []; // { src, when }
  const stopped = [];
  let isoCounter = 0;

  function runDueTimers(targetWallMs, audioFollowsWall) {
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
      timers.set(id, { at: Math.round((wallMs + delayMs) * 1000) / 1000, fn }); // 浮動小数点の誤差を丸める
      return id;
    },
    clearTimeoutFn: (id) => { timers.delete(id); },
    loadAudioBufferFn: (src) => {
      loadedSrcs.push(src);
      return Promise.resolve({ src, duration: durations[loadedSrcs.length - 1] });
    },
    scheduleAudioBufferFn: (buffer, when) => {
      scheduled.push({ src: buffer.src, when });
      return { source: { stop: () => stopped.push(buffer.src) }, startedAt: when };
    },
    nowIsoFn: () => `T${++isoCounter}`,
    tick(seconds) { runDueTimers(wallMs + seconds * 1000, true); },          // 両方の時計が進む
    tickWallOnly(seconds) { runDueTimers(wallMs + seconds * 1000, false); },  // 音声時計は止まったまま
    advanceAudioOnly(seconds) { audioMs += seconds * 1000; },                 // タイマーは発火しない
    fireEarliestNow() {                                                       // 時刻を無視して最も早いタイマーを発火
      const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      timers.delete(id);
      timer.fn();
    },
    pendingTimers: () => timers.size,
    loadedSrcs,
    scheduled,
    stopped,
  };
}

async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

const TRIAL = { keyCode: "C", firstStimulusId: "ch-n1-maj-mel-n1", secondStimulusId: "ch-n1-maj-mel-n3" };

function setup(envOptions, overrides = {}) {
  const env = createFakeEnv(envOptions);
  const log = { phases: [], answerable: [], errors: [] };
  const handle = runTrialTimeline(TRIAL, {
    onPhase: (phase) => log.phases.push({ phase, at: env.audioContextTimeFn() }),
    onAnswerable: (info) => log.answerable.push({ ...info, at: env.audioContextTimeFn() }),
    onError: (error) => log.errors.push(error),
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    loadAudioBufferFn: env.loadAudioBufferFn,
    scheduleAudioBufferFn: env.scheduleAudioBufferFn,
    audioContextTimeFn: env.audioContextTimeFn,
    nowIsoFn: env.nowIsoFn,
    ...overrides,
  });
  return { env, log, handle };
}

function approx(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, message ?? `expected ~${expected}, got ${actual}`);
}

// 読み込み完了時点の音声時計は10秒。基準時刻 base = 10 + 0.5(COLD_START_LEAD_SECONDS)= 10.5。
const BASE = 10.5;
// 読み込み完了から、回答有効化(base+10.6)の瞬間までの時間。
const ANSWERABLE_TICK_SECONDS = 0.5 + 10.6;

test("2つのフレーズを、試行の第1・第2刺激のファイル名で読み込む", async () => {
  const { env } = setup();
  await flushMicrotasks();
  assert.deepEqual(env.loadedSrcs, [
    "public/sounds/functional-pitch/c-phr-ch-n1-maj-mel-n1-v01.wav",
    "public/sounds/functional-pitch/c-phr-ch-n1-maj-mel-n3-v01.wav",
  ]);
});

test("開始直後は preparing を通知し、読み込み完了前は何も予約しない", () => {
  const { env, log } = setup();
  assert.deepEqual(log.phases.map((p) => p.phase), ["preparing"]);
  assert.equal(env.scheduled.length, 0);
});

test("2つのフレーズを一度に予約する: 第1は base、第2は base+5.8秒", async () => {
  const { env } = setup();
  await flushMicrotasks();
  assert.equal(env.scheduled.length, 2);
  approx(env.scheduled[0].when, BASE);
  approx(env.scheduled[1].when, BASE + 5.8);
  assert.ok(env.scheduled[0].src.includes("mel-n1"));
  assert.ok(env.scheduled[1].src.includes("mel-n3"));
});

test("段階は base+0 / 4.8 / 5.8 / 10.6 秒に切り替わる", async () => {
  const { env, log } = setup();
  await flushMicrotasks();
  env.tick(30);
  assert.deepEqual(log.phases.map((p) => p.phase), ["preparing", "phrase1", "gap", "phrase2"]);
  approx(log.phases[1].at, BASE);
  approx(log.phases[2].at, BASE + 4.8);
  approx(log.phases[3].at, BASE + 5.8);
  assert.equal(log.answerable.length, 1);
  approx(log.answerable[0].at, BASE + 10.6);
});

test("第2フレーズが終わるまで回答可能にならず、confirmもnull", async () => {
  const { env, log, handle } = setup();
  await flushMicrotasks();
  env.tick(0.5 + 10.5); // base+10.5 まで
  assert.equal(log.answerable.length, 0);
  assert.equal(handle.confirm(), null);
  env.tick(0.2); // base+10.7(10.6を過ぎる)
  assert.equal(log.answerable.length, 1);
});

test("フレーズの長さは読み込んだ音源から決める(4.82秒なら第2フレーズは5.82秒後)", async () => {
  const { env, log } = setup({ durations: [4.82, 4.82] });
  await flushMicrotasks();
  approx(env.scheduled[1].when, BASE + 4.82 + 1.0);
  env.tick(30);
  approx(log.answerable[0].at, BASE + 4.82 + 1.0 + 4.82);
});

test("タイマーが予定より早く発火しても、音声時計が追いつくまで進めない", async () => {
  const { env, log } = setup();
  await flushMicrotasks();
  const timersBefore = env.pendingTimers();
  env.fireEarliestNow(); // 音声時計は10秒のまま(phrase1は10.5秒の予定)
  assert.deepEqual(log.phases.map((p) => p.phase), ["preparing"]);
  assert.equal(env.pendingTimers(), timersBefore); // 再予約されている
  env.tick(0.6);
  assert.deepEqual(log.phases.map((p) => p.phase), ["preparing", "phrase1"]);
});

test("音声時計が止まっている間は進まず、再開すると予定どおりに進む", async () => {
  const { env, log } = setup();
  await flushMicrotasks();
  env.tickWallOnly(60); // 壁時計だけ60秒進む(AudioContextが一時停止している状況)
  assert.deepEqual(log.phases.map((p) => p.phase), ["preparing"]);
  assert.equal(log.answerable.length, 0);
  env.tick(30);
  assert.equal(log.answerable.length, 1);
});

test("回答有効化は予定時刻ではなく、実際に有効化した時点を起点にする", async () => {
  const { env, log, handle } = setup();
  await flushMicrotasks();
  env.advanceAudioOnly(5); // 音声時計だけ先に進む(タイマーの発火が遅れた状況)
  env.tick(ANSWERABLE_TICK_SECONDS);
  assert.equal(log.answerable.length, 1);
  const result = handle.confirm();
  assert.equal(result.responseTimeMs, 0);
});

test("confirm: response_time_ms は 確定時刻 − 有効化時刻(ミリ秒)で、時刻文字列も返す", async () => {
  const { env, handle } = setup();
  await flushMicrotasks();
  env.tick(ANSWERABLE_TICK_SECONDS);
  env.advanceAudioOnly(1.2344);
  assert.deepEqual(handle.confirm(), {
    responseEnabledAt: "T1",   // 有効化時にnowIsoFnが1回目に呼ばれる
    responseConfirmedAt: "T2", // 確定時に2回目
    responseTimeMs: 1234,
  });
});

test("confirm: 2回目以降はnull(二重押しで進まない)", async () => {
  const { env, handle } = setup();
  await flushMicrotasks();
  env.tick(30);
  assert.notEqual(handle.confirm(), null);
  assert.equal(handle.confirm(), null);
  assert.equal(handle.confirm(), null);
});

test("フレーズの長さが想定外なら、1音も鳴らさずに duration エラー", async () => {
  const { env, log } = setup({ durations: [4.8, 2.0] });
  await flushMicrotasks();
  assert.equal(env.scheduled.length, 0);
  assert.equal(log.errors.length, 1);
  assert.equal(log.errors[0].kind, "duration");
  env.tick(30);
  assert.deepEqual(log.phases.map((p) => p.phase), ["preparing"]);
  assert.equal(log.answerable.length, 0);
});

test("読み込みに失敗したらloadエラーを1回だけ通知し、何も予約しない", async () => {
  const failure = new Error("404");
  const { env, log } = setup({}, { loadAudioBufferFn: () => Promise.reject(failure) });
  await flushMicrotasks();
  assert.equal(log.errors.length, 1);
  assert.equal(log.errors[0].kind, "load");
  assert.equal(log.errors[0].error, failure);
  assert.equal(env.scheduled.length, 0);
  assert.equal(env.pendingTimers(), 0);
});

test("予約中に例外が起きたらscheduleエラーを通知し、予約済みの音を止める", async () => {
  let calls = 0;
  const env = createFakeEnv();
  const { log } = setup({}, {
    loadAudioBufferFn: env.loadAudioBufferFn,
    audioContextTimeFn: env.audioContextTimeFn,
    scheduleAudioBufferFn: (buffer, when) => {
      calls += 1;
      if (calls === 2) throw new Error("schedule failed");
      return { source: { stop: () => env.stopped.push(buffer.src) }, startedAt: when };
    },
  });
  await flushMicrotasks();
  assert.equal(log.errors.length, 1);
  assert.equal(log.errors[0].kind, "schedule");
  assert.equal(env.stopped.length, 1); // 1本目だけ予約済みだったので止める
});

test("エラー後は onAnswerable が呼ばれず、confirm も null", async () => {
  const { env, log, handle } = setup({ durations: [4.8, 9] });
  await flushMicrotasks();
  env.tick(60);
  assert.equal(log.answerable.length, 0);
  assert.equal(handle.confirm(), null);
});

test("読み込み中に cancel すると、読み込み完了後も予約しない", async () => {
  const { env, log, handle } = setup();
  handle.cancel();
  await flushMicrotasks();
  assert.equal(env.scheduled.length, 0);
  env.tick(60);
  assert.deepEqual(log.phases.map((p) => p.phase), ["preparing"]);
});

test("再生中に cancel すると、音源を止め、タイマーを消し、以後コールバックが呼ばれない", async () => {
  const { env, log, handle } = setup();
  await flushMicrotasks();
  env.tick(2); // phrase1 まで
  handle.cancel();
  assert.equal(env.stopped.length, 2);
  assert.equal(env.pendingTimers(), 0);
  env.tick(60);
  assert.deepEqual(log.phases.map((p) => p.phase), ["preparing", "phrase1"]);
  assert.equal(log.answerable.length, 0);
});

test("回答可能になった後に cancel すると、confirm は null になる", async () => {
  const { env, handle } = setup();
  await flushMicrotasks();
  env.tick(30);
  handle.cancel();
  assert.equal(handle.confirm(), null);
});

test("cancel は何度呼んでも安全", async () => {
  const { env, handle } = setup();
  await flushMicrotasks();
  handle.cancel();
  assert.doesNotThrow(() => handle.cancel());
  assert.equal(env.stopped.length, 2); // 2回目で止め直さない
});

test("2つの試行を続けて走らせても、互いに干渉しない", async () => {
  const first = setup();
  await flushMicrotasks();
  first.env.tick(30);
  assert.notEqual(first.handle.confirm(), null);
  first.handle.cancel();
  const second = setup();
  await flushMicrotasks();
  second.env.tick(30);
  assert.equal(second.log.answerable.length, 1);
  assert.notEqual(second.handle.confirm(), null);
});

test("測定本体はユーザー・保存・CSV・サーバーに依存しない(importしていない)", () => {
  for (const file of ["phrase-audio.js", "trial-timeline.js"]) {
    const source = readFileSync(new URL(`../../src/functional-pitch/${file}`, import.meta.url), "utf8");
    const imports = [...source.matchAll(/from "(.*)";/g)].map((m) => m[1]);
    for (const path of imports) {
      assert.match(
        path,
        /^(\.\/(stimuli|phrase-audio|audio-clock)\.js|\.\.\/shared\/(audio-buffer-player|answer-lock|iso-time)\.js)$/,
        `${file} が ${path} をimportしている`,
      );
    }
  }
});
