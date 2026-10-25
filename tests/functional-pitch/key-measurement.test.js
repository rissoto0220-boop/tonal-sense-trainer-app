import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runKeyMeasurement } from "../../src/functional-pitch/key-measurement.js";
import { generateTrialOrder } from "../../src/functional-pitch/trial-generator.js";
import { createFakeScreen } from "./helpers/fake-screen.js";

// 固定の疑似乱数(mulberry32)
function seededRandom(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 試行画面の代わりに、start の呼び出しを記録するだけの偽物。
function createFakeMount() {
  const mounts = [];
  const fn = (screenEl, options) => {
    const controller = {
      options,
      starts: [],
      destroyed: false,
      start(args) { controller.starts.push(args); },
      destroy() { controller.destroyed = true; },
    };
    mounts.push(controller);
    return controller;
  };
  fn.mounts = mounts;
  fn.allStarts = () => mounts.flatMap((m) => m.starts);
  fn.current = () => fn.allStarts().at(-1);
  return fn;
}

const CONFIRMED = (n) => ({
  melody_change_rating: (n % 7) + 1,
  harmony_change_rating: ((n + 1) % 7) + 1,
  overall_change_rating: ((n + 2) % 7) + 1,
  response_enabled_at: `E${n}`,
  response_confirmed_at: `C${n}`,
  response_time_ms: n,
});

async function flush() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

function setup(overrides = {}) {
  const screenEl = createFakeScreen();
  const mount = createFakeMount();
  const measured = [];
  const backs = [];
  const guard = { enabled: 0, disabled: 0 };
  const loaded = [];
  const flow = runKeyMeasurement({
    screenEl,
    keyCode: "C",
    onMeasured: (result) => measured.push(result),
    onBack: () => backs.push("back"),
    randomFn: seededRandom(1),
    resumeAudioContextFn: () => Promise.resolve(),
    loadKeyPhrasesFn: (key) => { loaded.push(key); return Promise.resolve({ ok: true, failures: [] }); },
    mountTrialScreenFn: mount,
    enableUnloadGuardFn: () => { guard.enabled += 1; return () => { guard.disabled += 1; }; },
    ...overrides,
  });
  const confirmCurrent = (n = 1) => mount.current().onConfirmed(CONFIRMED(n));
  return { screenEl, mount, measured, backs, guard, loaded, flow, confirmCurrent };
}

async function runAll(env, count = 90) {
  await flush();
  for (let i = 1; i <= count; i += 1) env.confirmCurrent(i);
}

test("開始直後は「音声を準備しています…」を表示し、音源の読み込みが成功してから試行を始める", async () => {
  const env = setup();
  assert.match(env.screenEl.innerHTML, /音声を準備しています/);
  assert.equal(env.mount.mounts.length, 0);
  await flush();
  assert.deepEqual(env.loaded, ["C"]);
  assert.equal(env.mount.mounts.length, 1);
  assert.equal(env.mount.allStarts().length, 1);
});

test("90試行がすべて実行され、進捗ラベルは 1 / 90 〜 90 / 90", async () => {
  const env = setup();
  await runAll(env);
  const starts = env.mount.allStarts();
  assert.equal(starts.length, 90);
  assert.deepEqual(starts.map((s) => s.progressLabel), Array.from({ length: 90 }, (_, i) => `${i + 1} / 90`));
});

test("最後の試行のボタンだけが「測定を終える」で、他は「次の問題へ」", async () => {
  const env = setup();
  await runAll(env);
  const labels = env.mount.allStarts().map((s) => s.nextLabel);
  assert.equal(labels[89], "測定を終える");
  assert.ok(labels.slice(0, 89).every((l) => l === "次の問題へ"));
});

test("試行には Key と刺激だけを渡す(条件名は渡さない)", async () => {
  const env = setup({ keyCode: "Fis" });
  await flush();
  const trial = env.mount.current().trial;
  assert.deepEqual(Object.keys(trial).sort(), ["firstStimulusId", "keyCode", "secondStimulusId"]);
  assert.equal(trial.keyCode, "Fis");
});

test("90試行の結果が揃い、onMeasured は最後の確定の時点で1回だけ呼ばれる", async () => {
  const env = setup();
  await runAll(env, 89);
  assert.equal(env.measured.length, 0);
  env.confirmCurrent(90);
  assert.equal(env.measured.length, 1);
  const result = env.measured[0];
  assert.equal(result.measurement_key_code, "C");
  assert.equal(result.measurement_status, "completed");
  assert.equal(result.completed_trials.length, 90);
  assert.equal(result.generated_trial_order.length, 90);
});

test("completed_trials の各要素: 試行番号・刺激・条件・評定3つ・時刻と反応時間が揃う", async () => {
  const env = setup();
  await runAll(env);
  const [first, second] = env.measured[0].completed_trials;
  assert.deepEqual(Object.keys(first), [
    "trial_number", "first_stimulus_id", "second_stimulus_id", "change_condition",
    "melody_change_rating", "harmony_change_rating", "overall_change_rating",
    "response_enabled_at", "response_confirmed_at", "response_time_ms",
  ]);
  assert.equal(first.trial_number, 1);
  assert.equal(second.trial_number, 2);
  assert.equal(first.response_enabled_at, "E1");
  assert.equal(first.response_time_ms, 1);
});

test("実行した順序は生成した順序と同じで、90ペアが1回ずつ、検査(各刺激が第1・第2で9回)にも合格する", async () => {
  const env = setup();
  await runAll(env);
  const { completed_trials: done, generated_trial_order: order } = env.measured[0];
  assert.deepEqual(
    done.map((t) => [t.first_stimulus_id, t.second_stimulus_id]),
    order.map((t) => [t.first_stimulus_id, t.second_stimulus_id]),
  );
  assert.equal(new Set(done.map((t) => `${t.first_stimulus_id}>${t.second_stimulus_id}`)).size, 90);
  assert.ok(done.every((t) => t.first_stimulus_id !== t.second_stimulus_id));
  const asFirst = {};
  const asSecond = {};
  done.forEach((t) => {
    asFirst[t.first_stimulus_id] = (asFirst[t.first_stimulus_id] ?? 0) + 1;
    asSecond[t.second_stimulus_id] = (asSecond[t.second_stimulus_id] ?? 0) + 1;
  });
  assert.ok(Object.values(asFirst).every((n) => n === 9) && Object.keys(asFirst).length === 10);
  assert.ok(Object.values(asSecond).every((n) => n === 9) && Object.keys(asSecond).length === 10);
});

test("generated_trial_order は、固定の乱数なら再現でき、乱数が違えば順序も変わる", async () => {
  const a = setup({ randomFn: seededRandom(7) });
  const b = setup({ randomFn: seededRandom(7) });
  const c = setup({ randomFn: seededRandom(8) });
  for (const env of [a, b, c]) await runAll(env);
  const ids = (env) => env.measured[0].generated_trial_order.map((t) => `${t.first_stimulus_id}>${t.second_stimulus_id}`);
  assert.deepEqual(ids(a), ids(b));
  assert.notDeepEqual(ids(a), ids(c));
  assert.deepEqual(
    ids(a),
    generateTrialOrder(seededRandom(7)).map((t) => `${t.firstStimulusId}>${t.secondStimulusId}`),
  );
});

test("測定の途中で再シャッフルしない(最初に決めた順序のまま進む)", async () => {
  const env = setup();
  await flush();
  const seen = [];
  for (let i = 1; i <= 90; i += 1) {
    const { trial } = env.mount.current();
    seen.push(`${trial.firstStimulusId}>${trial.secondStimulusId}`);
    env.confirmCurrent(i);
  }
  const order = env.measured[0].generated_trial_order.map((t) => `${t.first_stimulus_id}>${t.second_stimulus_id}`);
  assert.deepEqual(seen, order);
});

test("完了画面: 仕様どおりの文言と「Key選択へ戻る」。ボタンを押す前に onMeasured は呼ばれている", async () => {
  const env = setup();
  await runAll(env);
  assert.match(env.screenEl.innerHTML, /Key Cの測定が終了しました。/);
  assert.match(env.screenEl.innerHTML, /ご回答ありがとうございました。/);
  assert.equal(env.measured.length, 1);
  assert.equal(env.backs.length, 0);
  env.screenEl.button('[data-role="back"]').click();
  assert.deepEqual(env.backs, ["back"]);
  assert.equal(env.measured.length, 1);
});

test("完了画面に、得点・正答率・評定の平均などを表示しない", async () => {
  const env = setup();
  await runAll(env);
  for (const word of ["正解", "正答", "得点", "平均", "スコア", "点数"]) {
    assert.equal(env.screenEl.innerHTML.includes(word), false, word);
  }
});

test("Key Fis の完了画面", async () => {
  const env = setup({ keyCode: "Fis" });
  await runAll(env);
  assert.match(env.screenEl.innerHTML, /Key Fisの測定が終了しました。/);
  assert.equal(env.measured[0].measurement_key_code, "Fis");
});

test("trialLimit: 試行数を短縮しても、generated_trial_order は生成した全90件のまま", async () => {
  const env = setup({ trialLimit: 3 });
  await runAll(env, 3);
  const starts = env.mount.allStarts();
  assert.deepEqual(starts.map((s) => s.progressLabel), ["1 / 3", "2 / 3", "3 / 3"]);
  assert.deepEqual(starts.map((s) => s.nextLabel), ["次の問題へ", "次の問題へ", "測定を終える"]);
  assert.equal(env.measured[0].completed_trials.length, 3);
  assert.equal(env.measured[0].generated_trial_order.length, 90);
  assert.equal(env.measured[0].measurement_status, "completed");
});

test("音源の読み込みに失敗したら、測定を始めず、失敗したファイルを表示し、Key選択へ戻れる", async () => {
  const failures = [{ src: "public/sounds/functional-pitch/c-phr-ch-n1-maj-mel-n1-v01.wav", reason: "load" }];
  const env = setup({ loadKeyPhrasesFn: () => Promise.resolve({ ok: false, failures }) });
  await flush();
  assert.equal(env.mount.mounts.length, 0);
  assert.equal(env.measured.length, 0);
  assert.equal(env.guard.enabled, 0);
  assert.match(env.screenEl.innerHTML, /音源を読み込めませんでした/);
  assert.match(env.screenEl.innerHTML, /c-phr-ch-n1-maj-mel-n1-v01\.wav/);
  env.screenEl.button('[data-role="back"]').click();
  assert.deepEqual(env.backs, ["back"]);
});

test("AudioContextの有効化・読み込み処理そのものが失敗しても、エラー画面になる", async () => {
  const env = setup({ resumeAudioContextFn: () => Promise.reject(new Error("blocked")) });
  await flush();
  assert.equal(env.mount.mounts.length, 0);
  assert.match(env.screenEl.innerHTML, /音源を読み込めませんでした/);
  assert.ok(env.screenEl.button('[data-role="back"]'));
});

test("試行順の検査に通らなければ、測定を始めず内部エラー画面にする", async () => {
  const env = setup({ generateTrialOrderFn: () => generateTrialOrder(seededRandom(1)).slice(0, 89) });
  await flush();
  assert.equal(env.mount.mounts.length, 0);
  assert.equal(env.measured.length, 0);
  assert.match(env.screenEl.innerHTML, /測定を開始できませんでした/);
  env.screenEl.button('[data-role="back"]').click();
  assert.deepEqual(env.backs, ["back"]);
});

test("途中で音声エラーが起きたら、そこまでの結果を audio_error で渡し、中断画面を表示する", async () => {
  const env = setup();
  await flush();
  for (let i = 1; i <= 4; i += 1) env.confirmCurrent(i);
  env.mount.current().onError({ kind: "load", error: new Error("lost") });
  assert.equal(env.measured.length, 1);
  assert.equal(env.measured[0].measurement_status, "audio_error");
  assert.equal(env.measured[0].completed_trials.length, 4);
  assert.equal(env.measured[0].generated_trial_order.length, 90);
  assert.match(env.screenEl.innerHTML, /4 試行まで回答済み/);
  assert.equal(env.mount.mounts[0].destroyed, true);
  env.screenEl.button('[data-role="back"]').click();
  assert.deepEqual(env.backs, ["back"]);
});

test("beforeunload の確認: 試行を始めるときに有効にし、完了時に外す(読み込み前は有効にしない)", async () => {
  const env = setup();
  assert.equal(env.guard.enabled, 0);
  await flush();
  assert.equal(env.guard.enabled, 1);
  assert.equal(env.guard.disabled, 0);
  await runAll(env);
  assert.equal(env.guard.disabled, 1);
});

test("beforeunload の確認: 音声エラーの中断でも外れる", async () => {
  const env = setup();
  await flush();
  env.mount.current().onError({ kind: "load", error: new Error("x") });
  assert.equal(env.guard.disabled, 1);
});

test("destroy: 読み込み中なら、読み込み完了後も試行を始めない", async () => {
  const env = setup();
  env.flow.destroy();
  await flush();
  assert.equal(env.mount.mounts.length, 0);
  assert.equal(env.guard.enabled, 0);
});

test("destroy: 試行の最中なら、試行画面を止め、beforeunload を外し、結果を渡さない", async () => {
  const env = setup();
  await flush();
  env.confirmCurrent(1);
  env.flow.destroy();
  assert.equal(env.mount.mounts[0].destroyed, true);
  assert.equal(env.guard.disabled, 1);
  assert.equal(env.measured.length, 0);
});

test("destroy は何度呼んでも安全", async () => {
  const env = setup();
  await flush();
  env.flow.destroy();
  assert.doesNotThrow(() => env.flow.destroy());
});

test("Keyごとの測定はユーザー・保存・CSV・サーバーに依存しない(importの許可リスト)", () => {
  const allowed = /^(\.\/[\w-]+\.js|\.\.\/shared\/(audio-buffer-player|escape-html|answer-lock|iso-time)\.js)$/;
  for (const file of ["key-measurement.js", "functional-session.js", "measurement-screens.js", "key-audio.js", "unload-guard.js", "dev-flag.js"]) {
    const source = readFileSync(new URL(`../../src/functional-pitch/${file}`, import.meta.url), "utf8");
    for (const [, path] of source.matchAll(/from "(.*)";/g)) {
      assert.match(path, allowed, `${file} が ${path} をimportしている`);
      assert.equal(/participant|session-store|session-uploader|storage|csv|server-config/.test(path), false, `${file}: ${path}`);
    }
  }
});

test("document が無い環境でも key-measurement.js のimportで例外にならない", async () => {
  await assert.doesNotReject(import("../../src/functional-pitch/key-measurement.js"));
});
