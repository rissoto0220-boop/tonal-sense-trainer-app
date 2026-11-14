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
