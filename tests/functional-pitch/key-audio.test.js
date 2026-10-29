import { test } from "node:test";
import assert from "node:assert/strict";
import { loadKeyPhrases } from "../../src/functional-pitch/key-audio.js";
import { STIMULI } from "../../src/functional-pitch/stimuli.js";

const okBuffer = (src, duration = 4.8) => Promise.resolve({ src, duration });

test("Key C: 10刺激分の c-phr-…wav を読み込む", async () => {
  const loaded = [];
  const result = await loadKeyPhrases("C", { loadAudioBufferFn: (src) => { loaded.push(src); return okBuffer(src); } });
  assert.deepEqual(result, { ok: true, failures: [] });
  assert.equal(loaded.length, 10);
  assert.deepEqual(
    [...loaded].sort(),
    STIMULI.map((s) => `public/sounds/functional-pitch/c-phr-${s.stimulusId}-v01.wav`).sort(),
  );
});

test("Key Fis: fis-phr-…wav を読み込む(Key C のファイルは読み込まない)", async () => {
  const loaded = [];
  await loadKeyPhrases("Fis", { loadAudioBufferFn: (src) => { loaded.push(src); return okBuffer(src); } });
  assert.equal(loaded.length, 10);
  assert.ok(loaded.every((src) => src.includes("/fis-phr-")));
});

test("10個を並行して読み込む(1個ずつ待たない)", async () => {
  let started = 0;
  let maxStartedBeforeFirstResolve = 0;
  const pending = [];
  const promise = loadKeyPhrases("C", {
    loadAudioBufferFn: (src) => new Promise((resolve) => {
      started += 1;
      pending.push(() => resolve({ src, duration: 4.8 }));
    }),
  });
  await Promise.resolve();
  await Promise.resolve();
  maxStartedBeforeFirstResolve = started;
  pending.forEach((resolve) => resolve());
  await promise;
  assert.equal(maxStartedBeforeFirstResolve, 10);
});

test("読み込みに失敗したファイルは、失敗一覧に入る", async () => {
  const failure = new Error("404");
  const result = await loadKeyPhrases("C", {
    loadAudioBufferFn: (src) => (src.includes("mel-n7") ? Promise.reject(failure) : okBuffer(src)),
  });
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].reason, "load");
  assert.equal(result.failures[0].error, failure);
  assert.ok(result.failures[0].src.endsWith("c-phr-ch-n5-dom7-mel-n7-v01.wav"));
});

test("長さが4.8秒±0.05秒の範囲外のファイルは、失敗一覧に入る", async () => {
  const result = await loadKeyPhrases("Fis", {
    loadAudioBufferFn: (src) => okBuffer(src, src.includes("mel-n1-v01") ? 2.0 : 4.8),
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.length >= 1);
  assert.ok(result.failures.every((f) => f.reason === "duration" && f.durationSeconds === 2.0));
});

test("複数の失敗がすべて一覧に入る", async () => {
  const result = await loadKeyPhrases("C", { loadAudioBufferFn: (src) => Promise.reject(new Error(src)) });
  assert.equal(result.failures.length, 10);
});

test("未対応のKeyはエラー(存在しないファイル名を作らない)", async () => {
  await assert.rejects(loadKeyPhrases("A", { loadAudioBufferFn: okBuffer }));
});

test("フォルダーを外から指定できる", async () => {
  const loaded = [];
  await loadKeyPhrases("C", { soundsBasePath: "../x/", loadAudioBufferFn: (src) => { loaded.push(src); return okBuffer(src); } });
  assert.ok(loaded.every((src) => src.startsWith("../x/c-phr-")));
});
