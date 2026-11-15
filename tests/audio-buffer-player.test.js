import { test } from "node:test";
import assert from "node:assert/strict";

// fetch と AudioContext をテスト用の偽物に差し替えてから読み込む(モジュールは AudioContext を1つだけ作る)。
const fetched = [];
let failNext = new Set();
globalThis.fetch = async (src) => {
  fetched.push(src);
  return { arrayBuffer: async () => ({ src }) };
};
globalThis.window = {
  AudioContext: class {
    constructor() { this.state = "running"; this.currentTime = 0; }
    async decodeAudioData(data) {
      if (failNext.has(data.src)) {
        failNext.delete(data.src);
        throw new Error("decode failed");
      }
      return { duration: 1, src: data.src };
    }
  },
};
const { loadAudioBuffer } = await import("../src/shared/audio-buffer-player.js");

test("成功した読み込みは使い回す(2回目は読みに行かない)", async () => {
  const first = await loadAudioBuffer("ok.wav");
  const second = await loadAudioBuffer("ok.wav");
  assert.equal(first, second);
  assert.equal(fetched.filter((src) => src === "ok.wav").length, 1);
});

test("失敗した読み込みはキャッシュに残さず、やり直すともう一度読みに行く", async () => {
  failNext.add("broken.wav");
  await assert.rejects(loadAudioBuffer("broken.wav"), /decode failed/);
  const buffer = await loadAudioBuffer("broken.wav");
  assert.equal(buffer.src, "broken.wav");
  assert.equal(fetched.filter((src) => src === "broken.wav").length, 2);
});

test("同時に読み込みを頼まれたときは、1回だけ読みに行く", async () => {
  const [a, b] = await Promise.all([loadAudioBuffer("same.wav"), loadAudioBuffer("same.wav")]);
  assert.equal(a, b);
  assert.equal(fetched.filter((src) => src === "same.wav").length, 1);
});

// --- 音声の起動(2026-11-15 エラーの見せ方の統一 フェーズ5-B) ---
// モジュールは AudioContext を1つだけ作って使い回すので、場面ごとに、別のインスタンスとして読み込み直す。
const { AudioStartError, AUDIO_START_TIMEOUT_MS } = await import("../src/shared/audio-buffer-player.js");

async function freshModule(label, makeWindow) {
  globalThis.window = makeWindow();
  return import(`../src/shared/audio-buffer-player.js?${label}`);
}

function contextClass({ state, resume }) {
  const calls = { resume: 0 };
  const Class = class {
    constructor() { this.state = state; this.currentTime = 0; }
    resume() { calls.resume += 1; return resume.call(this); }
  };
  return { Class, calls };
}

test("起動の待ち時間は5秒、AudioStartError は理由(reason)を持つ", () => {
  assert.equal(AUDIO_START_TIMEOUT_MS, 5000);
  const error = new AudioStartError("timeout");
  assert.ok(error instanceof Error);
  assert.equal(error.name, "AudioStartError");
  assert.equal(error.reason, "timeout");
  const cause = new Error("x");
  assert.equal(new AudioStartError("unsupported", { cause }).cause, cause);
});

test("起動: すでに動いていれば(running)、resume() を呼ばずにすぐ成功する", async () => {
  const { Class, calls } = contextClass({ state: "running", resume: () => Promise.resolve() });
  const { resumeAudioContext } = await freshModule("running", () => ({ AudioContext: Class }));
  await resumeAudioContext();
  assert.equal(calls.resume, 0);
});

test("起動: suspended でも interrupted でも、resume() を呼んで成功を待つ", async () => {
  for (const state of ["suspended", "interrupted"]) {
    const { Class, calls } = contextClass({ state, resume: function resume() { this.state = "running"; return Promise.resolve(); } });
    const { resumeAudioContext } = await freshModule(`resume-${state}`, () => ({ AudioContext: Class }));
    await resumeAudioContext();
    assert.equal(calls.resume, 1, state);
  }
});

test("起動: AudioContext を作れなければ(使えない・コンストラクターが例外)、unsupported で失敗する(同期的には投げない)", async () => {
  const none = await freshModule("none", () => ({}));
  const rejected = none.resumeAudioContext();
  assert.ok(rejected instanceof Promise);
  await assert.rejects(rejected, (error) => error.name === "AudioStartError" && error.reason === "unsupported" && error.cause instanceof Error);
  const throwing = await freshModule("throwing", () => ({ AudioContext: class { constructor() { throw new Error("not allowed"); } } }));
  await assert.rejects(throwing.resumeAudioContext(), (error) => error.reason === "unsupported" && error.cause.message === "not allowed");
});

test("起動: resume() が失敗したら resume-failed(resume() が同期的に例外を投げても同じ)", async () => {
  const failed = contextClass({ state: "suspended", resume: () => Promise.reject(new Error("blocked")) });
  const m1 = await freshModule("resume-rejects", () => ({ AudioContext: failed.Class }));
  await assert.rejects(m1.resumeAudioContext(), (error) => error.reason === "resume-failed" && error.cause.message === "blocked");
  const threw = contextClass({ state: "suspended", resume: () => { throw new Error("sync"); } });
  const m2 = await freshModule("resume-throws", () => ({ AudioContext: threw.Class }));
  await assert.rejects(m2.resumeAudioContext(), (error) => error.reason === "resume-failed" && error.cause.message === "sync");
});

test("起動: 返事が来なければ、timeoutMs の後に timeout で失敗する", async () => {
  const { Class } = contextClass({ state: "suspended", resume: () => new Promise(() => {}) });
  const { resumeAudioContext } = await freshModule("hang", () => ({ AudioContext: Class }));
  const started = Date.now();
  await assert.rejects(resumeAudioContext({ timeoutMs: 30 }), (error) => error.reason === "timeout");
  assert.ok(Date.now() - started >= 25, "待ってから失敗する");
});

test("起動: 時間内に成功したら、時間切れのタイマーを止める(残さない)", async () => {
  const { Class } = contextClass({ state: "suspended", resume: () => new Promise((resolve) => setTimeout(resolve, 5)) });
  const { resumeAudioContext } = await freshModule("late-ok", () => ({ AudioContext: Class }));
  // 動いているタイマーを数える(setTimeout / clearTimeout を、呼ばれた回数がわかる形に包む)
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const active = new Set();
  globalThis.setTimeout = (fn, ms, ...args) => {
    const id = realSet(() => { active.delete(id); fn(...args); }, ms);
    active.add(id);
    return id;
  };
  globalThis.clearTimeout = (id) => { active.delete(id); realClear(id); };
  try {
    await resumeAudioContext({ timeoutMs: 1000 });
    assert.equal(active.size, 0, "成功したら、1000ミリ秒の時間切れのタイマーは残らない");
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
});
