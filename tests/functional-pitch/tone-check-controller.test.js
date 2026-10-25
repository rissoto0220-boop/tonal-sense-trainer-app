import { test } from "node:test";
import assert from "node:assert/strict";
import { createToneCheckController } from "../../src/functional-pitch/tone-check-controller.js";

// 音声時計と壁時計を持つ疑似環境(audio-clock.test.js と同じ作り)。
function createFakeEnv({ durations = { recorder: 4.8, piano: 4.8 }, startAudioSeconds = 10 } = {}) {
  let wallMs = 0;
  let audioMs = startAudioSeconds * 1000;
  let nextId = 1;
  const timers = new Map();
  const loadedSrcs = [];
  const scheduled = []; // { src, when }
  const stopped = [];
  let activeSources = 0;
  let maxActiveSources = 0;

  return {
    audioContextTimeFn: () => audioMs / 1000,
    setTimeoutFn: (fn, delayMs) => {
      const id = nextId++;
      timers.set(id, { at: Math.round((wallMs + delayMs) * 1000) / 1000, fn });
      return id;
    },
    clearTimeoutFn: (id) => { timers.delete(id); },
    resumeAudioContextFn: () => Promise.resolve(),
    loadAudioBufferFn: (src) => {
      loadedSrcs.push(src);
      const part = src.includes("recorder") ? "recorder" : "piano";
      return Promise.resolve({ src, duration: durations[part] });
    },
    scheduleAudioBufferFn: (buffer, when) => {
      scheduled.push({ src: buffer.src, when });
      activeSources += 1;
      maxActiveSources = Math.max(maxActiveSources, activeSources);
      return { source: { stop: () => { stopped.push(buffer.src); activeSources -= 1; } }, startedAt: when };
    },
    // 再生が自然に終わった扱いにする(音源の数を減らす)
    finishSource: () => { activeSources -= 1; },
    tick(seconds) {
      const target = wallMs + seconds * 1000;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, timer] = due;
        timers.delete(id);
        audioMs += timer.at - wallMs;
        wallMs = timer.at;
        timer.fn();
      }
      audioMs += target - wallMs;
      wallMs = target;
    },
    pending: () => timers.size,
    loadedSrcs,
    scheduled,
    stopped,
    maxActiveSources: () => maxActiveSources,
  };
}

function createFakeView() {
  const calls = [];
  const last = (name) => [...calls].reverse().find((c) => c[0] === name);
  return {
    calls,
    setPartState: (part, state) => calls.push(["setPartState", part, state]),
    setPlayEnabled: (enabled) => calls.push(["setPlayEnabled", enabled]),
    setProceedEnabled: (enabled) => calls.push(["setProceedEnabled", enabled]),
    showError: (kind) => calls.push(["showError", kind]),
    lastPlayEnabled: () => last("setPlayEnabled")?.[1],
    lastProceedEnabled: () => last("setProceedEnabled")?.[1],
    stateOf: (part) => [...calls].reverse().find((c) => c[0] === "setPartState" && c[1] === part)?.[2],
  };
}

async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

function setup(envOptions, overrides = {}) {
  const env = createFakeEnv(envOptions);
  const view = createFakeView();
  const errors = [];
  const controller = createToneCheckController({
    view,
    onError: (error) => errors.push(error),
    setTimeoutFn: env.setTimeoutFn,
    clearTimeoutFn: env.clearTimeoutFn,
    resumeAudioContextFn: env.resumeAudioContextFn,
    loadAudioBufferFn: env.loadAudioBufferFn,
    scheduleAudioBufferFn: env.scheduleAudioBufferFn,
    audioContextTimeFn: env.audioContextTimeFn,
    ...overrides,
  });
  return { env, view, errors, controller };
}

test("recorder: 音色確認用のWAV(es-practice-recorder-only-v01.wav)を読み込む", async () => {
  const { env, controller } = setup();
  controller.play("recorder");
  await flush();
  assert.deepEqual(env.loadedSrcs, ["public/sounds/functional-pitch/es-practice-recorder-only-v01.wav"]);
});

test("piano: 音色確認用のWAV(es-practice-piano-only-v01.wav)を読み込む", async () => {
  const { env, controller } = setup();
  controller.play("piano");
  await flush();
  assert.deepEqual(env.loadedSrcs, ["public/sounds/functional-pitch/es-practice-piano-only-v01.wav"]);
});

test("再生時刻は、コールドスタート対策の0.5秒後", async () => {
  const { env, controller } = setup();
  controller.play("recorder");
  await flush();
  assert.ok(Math.abs(env.scheduled[0].when - 10.5) < 1e-6);
});

test("再生を押した直後に、全ボタンを無効にして、そのパートを再生中にする", () => {
  const { view, controller } = setup();
  controller.play("recorder");
  assert.equal(view.lastPlayEnabled(), false);
  assert.equal(view.stateOf("recorder"), "playing");
  assert.equal(controller.isPlaying(), true);
});

test("再生を始めた時点では「聴いた」と数えない。最後まで再生し終えた時点で数える", async () => {
  const { env, view, controller } = setup();
  controller.play("recorder");
  await flush();
  env.tick(4.5); // 現在14.5秒(開始10.5秒+4.8秒=終了15.3秒より前)
  assert.equal(view.stateOf("recorder"), "playing");
  controller.play("piano"); // 再生中なので無視される
  env.tick(1); // 現在15.5秒(終了を過ぎる)
  assert.equal(view.stateOf("recorder"), "played");
  assert.equal(view.lastPlayEnabled(), true);
  assert.equal(controller.isPlaying(), false);
});

test("再生中は他の再生を受け付けず、音源は同時に1つだけ", async () => {
  const { env, controller } = setup();
  controller.play("recorder");
  controller.play("piano");
  controller.play("recorder");
  await flush();
  assert.equal(env.loadedSrcs.length, 1);
  assert.equal(env.scheduled.length, 1);
  assert.equal(env.maxActiveSources(), 1);
});

test("両方を最後まで聴くまで「練習へ進む」は有効にならない", async () => {
  const { env, view, controller } = setup();
  assert.equal(controller.hasHeardBoth(), false);
  controller.play("recorder");
  await flush();
  env.tick(6);
  assert.equal(view.lastProceedEnabled(), false);
  assert.equal(controller.hasHeardBoth(), false);
  controller.play("piano");
  await flush();
  env.tick(6);
  assert.equal(view.lastProceedEnabled(), true);
  assert.equal(controller.hasHeardBoth(), true);
});

test("順序は問わない(ピアノ→リコーダーでも、両方聴けば進める)", async () => {
  const { env, view, controller } = setup();
  controller.play("piano");
  await flush();
  env.tick(6);
  controller.play("recorder");
  await flush();
  env.tick(6);
  assert.equal(view.lastProceedEnabled(), true);
});

test("同じパートだけを何度聴いても、両方聴いたことにはならない", async () => {
  const { env, view, controller } = setup();
  for (let i = 0; i < 3; i += 1) {
    controller.play("recorder");
    await flush();
    env.tick(6);
  }
  assert.equal(controller.hasHeardBoth(), false);
  assert.notEqual(view.lastProceedEnabled(), true);
});

test("聴き直しは何度でもでき、聴いた記録は消えない", async () => {
  const { env, view, controller } = setup();
  controller.play("recorder");
  await flush();
  env.tick(6);
  controller.play("piano");
  await flush();
  env.tick(6);
  for (let i = 0; i < 3; i += 1) {
    controller.play("recorder");
    await flush();
    env.tick(6);
    assert.equal(view.stateOf("recorder"), "played");
  }
  assert.equal(controller.hasHeardBoth(), true);
  assert.equal(view.lastProceedEnabled(), true);
});

test("未知のパートは何も起こさない", async () => {
  const { env, view, controller } = setup();
  controller.play("violin");
  await flush();
  assert.equal(env.loadedSrcs.length, 0);
  assert.equal(view.calls.length, 0);
});

test("destroy: 再生中の音を止め、タイマーを消し、以後の通知がない", async () => {
  const { env, view, controller } = setup();
  controller.play("recorder");
  await flush();
  controller.destroy();
  assert.equal(env.stopped.length, 1);
  assert.equal(env.pending(), 0);
  const callsBefore = view.calls.length;
  env.tick(30);
  assert.equal(view.calls.length, callsBefore);
  controller.play("piano");
  await flush();
  assert.equal(env.loadedSrcs.length, 1);
});

test("読み込み中に destroy すると、読み込み完了後も再生を予約しない", async () => {
  const { env, controller } = setup();
  controller.play("recorder");
  controller.destroy();
  await flush();
  assert.equal(env.scheduled.length, 0);
});

test("destroy は何度呼んでも安全", async () => {
  const { controller } = setup();
  controller.destroy();
  assert.doesNotThrow(() => controller.destroy());
});

test("読み込み失敗: エラー表示と onError、全て無効のまま、「聴いた」にならない", async () => {
  const failure = new Error("404");
  const { view, errors, controller } = setup({}, { loadAudioBufferFn: () => Promise.reject(failure) });
  controller.play("recorder");
  await flush();
  assert.deepEqual(view.calls.filter((c) => c[0] === "showError"), [["showError", "load"]]);
  assert.deepEqual(errors, [{ kind: "load", error: failure }]);
  assert.equal(view.lastPlayEnabled(), false);
  assert.equal(view.lastProceedEnabled(), false);
  assert.equal(view.stateOf("recorder"), "idle");
  assert.equal(controller.hasHeardBoth(), false);
  controller.play("piano"); // エラー後は何も受け付けない
  await flush();
  assert.equal(errors.length, 1);
});

test("予約時の例外もエラーとして扱い、鳴らさない", async () => {
  const { view, errors, controller } = setup({}, { scheduleAudioBufferFn: () => { throw new Error("boom"); } });
  controller.play("piano");
  await flush();
  assert.equal(errors.length, 1);
  assert.equal(view.stateOf("piano"), "idle");
});

test("音源の長さは読み込んだ音源から決める(長さの検査はしない)", async () => {
  const { env, view, controller } = setup({ durations: { recorder: 2.0, piano: 3.2 } });
  controller.play("recorder");
  await flush();
  env.tick(2.6); // 開始10.5 + 2.0 = 12.5秒 を過ぎる
  assert.equal(view.stateOf("recorder"), "played");
});
