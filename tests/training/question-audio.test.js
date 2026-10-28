import { test } from "node:test";
import assert from "node:assert/strict";
import { createQuestionAudio, SETUP_TO_QUESTION_GAP_SECONDS, AUDIO_EDGE_SILENCE_SECONDS, AUTO_NEXT_DELAY_SECONDS } from "../../src/training/question-audio.js";
import { createFakeAudioEnv, flushMicrotasks, approx } from "./helpers/fake-audio-env.js";

const QUESTION = { stimulusId: "st-n7-ch-n5-dom7", keyCode: "C" };

async function setup(envOptions) {
  const env = createFakeAudioEnv(envOptions);
  const audio = createQuestionAudio(QUESTION, env.audioOptions());
  return { env, audio };
}

test("定数: 調セットアップと出題音の間隔は1秒、WAVの前後の無音0.5秒、自動で次へは0.5秒後", () => {
  assert.equal(SETUP_TO_QUESTION_GAP_SECONDS, 1.0);
  assert.equal(AUDIO_EDGE_SILENCE_SECONDS, 0.5);
  assert.equal(AUTO_NEXT_DELAY_SECONDS, 0.5);
});

test("読み込む音源は、調セットアップ・出題音・フィードバックの3つ(Keyと刺激から決まる)", async () => {
  const { env, audio } = await setup();
  await audio.load();
  assert.deepEqual(env.loaded, ["S/c-setup-v01.wav", "S/c-q-st-n7-ch-n5-dom7-v01.wav", "S/c-fb-st-n7-ch-n5-dom7-v01.wav"]);
});

test("最初の再生: 調セットアップ → 音が終わってから1秒 → 出題音。出題音が鳴り始める時刻に通知", async () => {
  const { env, audio } = await setup();
  await audio.load();
  const log = [];
  audio.playQuestion({ withSetup: true, first: true, onQuestionOnset: (t) => log.push(["onset", t]), onEnd: () => log.push(["end", env.audioContextTimeFn()]) });
  // 基準 = 10 + 0.5(コールドスタート対策)= 10.5。調セットアップ(5.0秒)の音は 10.5+4.5=15.0 に終わる。
  approx(env.scheduled[0].when, 10.5);
  assert.equal(env.scheduled[0].src, "S/c-setup-v01.wav");
  // 出題音のWAVは15.5に始まり、音は16.0(=15.0+1秒)に鳴り始める。
  approx(env.scheduled[1].when, 15.5);
  env.tick(10);
  approx(log[0][1], 16.0);
  approx(log[0][1] - (10.5 + 5.0 - AUDIO_EDGE_SILENCE_SECONDS), SETUP_TO_QUESTION_GAP_SECONDS);
  assert.equal(log[1][0], "end");
  approx(log[1][1], 18.5); // 出題音(3.0秒)のWAVの終わり
});

test("出題音の音が鳴り終わる時刻(WAVの終わり − 後ろの無音)に onQuestionSoundEnd", async () => {
  const { env, audio } = await setup();
  await audio.load();
  const log = [];
  audio.playQuestion({ withSetup: true, first: true, onQuestionSoundEnd: (t) => log.push(["soundEnd", t, env.audioContextTimeFn()]), onEnd: () => log.push(["end"]) });
  env.tick(10);
  assert.deepEqual(log.map((item) => item[0]), ["soundEnd", "end"]);
  approx(log[0][1], 18.0); // 出題音のWAV 15.5 + 3.0 − 0.5
  approx(log[0][2], 18.0);
});

test("リプレイ(出題音だけ): 調セットアップは鳴らさない", async () => {
  const { env, audio } = await setup();
  await audio.load();
  audio.playQuestion({ withSetup: false });
  assert.deepEqual(env.scheduled.map((item) => item.src), ["S/c-q-st-n7-ch-n5-dom7-v01.wav"]);
  approx(env.scheduled[0].when, 10.05);
});

test("リプレイ(調セットアップから): 最初の再生と同じ並び", async () => {
  const { env, audio } = await setup();
  await audio.load();
  audio.playQuestion({ withSetup: true });
  assert.deepEqual(env.scheduled.map((item) => item.src), ["S/c-setup-v01.wav", "S/c-q-st-n7-ch-n5-dom7-v01.wav"]);
  approx(env.scheduled[1].when - env.scheduled[0].when, 5.0);
});

test("フィードバック: 音が鳴り始める時刻に onOnset、フレーズが終わって0.5秒後に onAutoNext", async () => {
  const { env, audio } = await setup();
  await audio.load();
  const log = [];
  audio.playFeedback({ onOnset: (t) => log.push(["onset", t]), onEnd: () => log.push(["end"]), onAutoNext: () => log.push(["next", env.audioContextTimeFn()]) });
  approx(env.scheduled[0].when, 10.05);
  env.tick(10);
  approx(log[0][1], 10.55);
  // フレーズ(3.0秒のWAV)の音は 10.05+2.5=12.55 に終わり、その0.5秒後に次へ。
  const next = log.find((entry) => entry[0] === "next");
  approx(next[1], 13.05);
});

test("新しい再生の前に、鳴っている音と予約を止める。stop で止まる", async () => {
  const { env, audio } = await setup();
  await audio.load();
  const log = [];
  audio.playQuestion({ withSetup: true, first: true, onQuestionOnset: () => log.push("onset") });
  audio.playFeedback({});
  assert.deepEqual(env.stopped, ["S/c-setup-v01.wav", "S/c-q-st-n7-ch-n5-dom7-v01.wav"]);
  env.tick(10);
  assert.deepEqual(log, [], "止めた再生の通知は来ない");
  audio.stop();
  assert.ok(env.stopped.includes("S/c-fb-st-n7-ch-n5-dom7-v01.wav"));
});

test("destroy の後は再生しない。読み込み前の再生は例外", async () => {
  const { env, audio } = await setup();
  assert.throws(() => audio.playQuestion({ withSetup: true }), /まだ読み込まれていません/);
  await audio.load();
  audio.destroy();
  audio.playQuestion({ withSetup: true });
  assert.equal(env.scheduled.length, 0);
});

test("読み込みに失敗すると load が失敗する", async () => {
  const { audio } = await setup({ failSrc: "-fb-" });
  await assert.rejects(audio.load(), /読み込めません/);
  await flushMicrotasks();
});
