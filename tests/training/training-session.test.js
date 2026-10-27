import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./helpers/fake-dom.js";
import { runTrainingSession, SESSION_TEXT, REPLAY_MODES } from "../../src/training/training-session.js";
import { TRAINING_MENUS } from "../../src/training/menus.js";
import { createFakeAudioEnv, flushMicrotasks, approx } from "./helpers/fake-audio-env.js";

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const MELODY_MENU = TRAINING_MENUS[0]; // ① 単音 シドレ(Key C)
const CHORD_MENU = TRAINING_MENUS[1]; // ② 和音 ⅠⅤ(Key C)

async function start({ menu = MELODY_MENU, questionCount = 3, replayMode, envOptions } = {}) {
  const env = createFakeAudioEnv(envOptions);
  const screenEl = createFakeDom();
  const log = { finished: null, exits: 0 };
  let isoCounter = 0;
  const session = runTrainingSession({
    screenEl,
    menu,
    questionCount,
    replayMode,
    randomFn: seededRandom(7),
    onFinished: (results) => { log.finished = results; },
    onExit: () => { log.exits += 1; },
    audioOptions: env.audioOptions(),
    audioContextTimeFn: env.audioContextTimeFn,
    nowIsoFn: () => `T${++isoCounter}`,
  });
  await flushMicrotasks();
  return { env, screenEl, session, log };
}

const correctCode = (session, index) => session.questions[index].resolvedAnswerTargets[0].correctAnswerCode;
const wrongCode = (menu, code) => menu.activeOptionCodes.find((item) => item !== code);
const keyButtons = (screenEl) => screenEl.querySelectorAll("[data-code]");

// 最初の再生では、出題音は基準(10.5)から6.0秒後(16.5)に鳴り始める。読み込み後すぐの時点からの経過で進める。
const UNTIL_QUESTION_ONSET = 6.0;

test("リプレイの方式は2つ。未対応の方式は例外", () => {
  assert.deepEqual(REPLAY_MODES, ["question-only", "with-setup"]);
  assert.throws(() => runTrainingSession({ screenEl: createFakeDom(), menu: MELODY_MENU, replayMode: "loop" }), /未対応のリプレイの方式です/);
});

test("既定の出題数は15", async () => {
  const { session } = await start({ questionCount: null }); // null = 指定しない(メニューの既定を使う)
  assert.equal(session.questions.length, 15);
  session.destroy();
});

test("最初は押せない。調セットアップ → 出題音が鳴り始めたら押せる", async () => {
  const { env, screenEl, session } = await start();
  assert.deepEqual(env.scheduled.map((item) => item.src.replace(/^S\//, "")), ["c-setup-v01.wav", `c-q-${session.questions[0].stimulusId}-v01.wav`]);
  assert.ok(keyButtons(screenEl).every((button) => button.disabled));
  env.tick(UNTIL_QUESTION_ONSET - 0.01);
  assert.ok(keyButtons(screenEl).every((button) => button.disabled));
  env.tick(0.02);
  const activeEnabled = keyButtons(screenEl).filter((button) => !button.disabled).map((button) => button.dataset.code);
  assert.deepEqual(new Set(activeEnabled), new Set(MELODY_MENU.activeOptionCodes));
  assert.match(screenEl.innerHTML, /1 \/ 3/);
  session.destroy();
});

test("正解: フィードバックのフレーズが鳴り始めると同時に「正解です」、フレーズが終わって0.5秒後に次の問題へ", async () => {
  const { env, screenEl, session } = await start();
  env.tick(UNTIL_QUESTION_ONSET + 0.5);
  screenEl.el(`[data-code="${correctCode(session, 0)}"]`).click();
  const feedback = env.scheduled.at(-1);
  assert.match(feedback.src, /c-fb-/);
  assert.equal(screenEl.text('[data-role="feedback"]'), "", "フレーズの音が鳴る前は、まだ表示しない");
  env.tick(0.56);
  assert.equal(screenEl.el('[data-role="feedback"]').innerHTML, "<p>正解です</p>");
  assert.equal(screenEl.el('[data-role="next"]').hidden, true, "正解のときは「次に進む」を出さない");
  env.tick(2.5); // フレーズの音の終わり + 0.5秒
  assert.match(screenEl.innerHTML, /2 \/ 3/);
  session.destroy();
});

test("不正解: 「不正解です」「正解は「○」です」と「次に進む」。フィードバックは何度でも聞き直せる", async () => {
  const { env, screenEl, session } = await start();
  env.tick(UNTIL_QUESTION_ONSET + 0.5);
  const correct = correctCode(session, 0);
  screenEl.el(`[data-code="${wrongCode(MELODY_MENU, correct)}"]`).click();
  env.tick(0.6);
  assert.match(screenEl.el('[data-role="feedback"]').innerHTML, /^<p>不正解です<\/p><p>正解は「[^」]+」です<\/p>$/);
  assert.ok(screenEl.el('[data-role="replay"]').disabled, "フレーズの再生中は聞き直せない");
  env.tick(3);
  assert.match(screenEl.innerHTML, /1 \/ 3/, "自動では進まない");
  const replay = screenEl.el('[data-role="replay"]');
  assert.equal(replay.disabled, false);
  const before = env.scheduled.length;
  replay.click();
  assert.match(env.scheduled.at(-1).src, /c-fb-/);
  assert.equal(env.scheduled.length, before + 1);
  screenEl.el('[data-role="next"]').click();
  assert.match(screenEl.innerHTML, /2 \/ 3/);
  session.destroy();
});

test("「わからない」は giveup で不正解", async () => {
  const { env, screenEl, session, log } = await start({ questionCount: 1 });
  env.tick(UNTIL_QUESTION_ONSET + 0.5);
  screenEl.el('[data-role="giveup"]').click();
  env.tick(0.6);
  assert.match(screenEl.el('[data-role="feedback"]').innerHTML, /<p>不正解です<\/p>/);
  screenEl.el('[data-role="next"]').click();
  assert.equal(log.finished[0].responses[0].responseCode, "giveup");
  assert.equal(log.finished[0].responses[0].outcome, "incorrect");
  session.destroy();
});

test("リプレイ(出題音だけ): 回答前は、出題音の再生が終わってから押せる。押すと出題音だけを鳴らし直す", async () => {
  const { env, screenEl, session } = await start({ replayMode: "question-only" });
  env.tick(UNTIL_QUESTION_ONSET + 0.5);
  assert.ok(screenEl.el('[data-role="replay"]').disabled, "出題音の再生中は押せない");
  env.tick(2.1);
  const replay = screenEl.el('[data-role="replay"]');
  assert.equal(replay.disabled, false);
  const before = env.scheduled.length;
  replay.click();
  assert.deepEqual(env.scheduled.slice(before).map((item) => /-setup-/.test(item.src) ? "setup" : "q"), ["q"]);
  assert.ok(keyButtons(screenEl).some((button) => !button.disabled), "リプレイ中も回答できる");
  session.destroy();
});

test("リプレイ(調セットアップから): 調セットアップ → 出題音を鳴らし直す", async () => {
  const { env, screenEl, session } = await start({ replayMode: "with-setup" });
  env.tick(UNTIL_QUESTION_ONSET + 3);
  const before = env.scheduled.length;
  screenEl.el('[data-role="replay"]').click();
  assert.deepEqual(env.scheduled.slice(before).map((item) => /-setup-/.test(item.src) ? "setup" : "q"), ["setup", "q"]);
  session.destroy();
});

test("回答すると鳴っている音を止める", async () => {
  const { env, screenEl, session } = await start();
  env.tick(UNTIL_QUESTION_ONSET + 0.2);
  screenEl.el(`[data-code="${correctCode(session, 0)}"]`).click();
  assert.ok(env.stopped.some((src) => /-q-/.test(src)));
  session.destroy();
});

test("全問が終わると終了画面(正解数/出題数)。結果を onFinished に渡し、「メニュー選択へ戻る」で onExit", async () => {
  const { env, screenEl, session, log } = await start({ questionCount: 3 });
  // 1問目: 正解、2問目: 不正解、3問目: 正解
  for (let i = 0; i < 3; i += 1) {
    env.tick(UNTIL_QUESTION_ONSET + 0.5);
    const correct = correctCode(session, i);
    const code = i === 1 ? wrongCode(MELODY_MENU, correct) : correct;
    screenEl.el(`[data-code="${code}"]`).click();
    env.tick(0.6);
    if (i === 1) screenEl.el('[data-role="next"]').click();
    else env.tick(2.5);
    await flushMicrotasks();
  }
  assert.match(screenEl.innerHTML, new RegExp(SESSION_TEXT.finishedTitle));
  assert.match(screenEl.innerHTML, /正解数 2 \/ 3/);
  assert.equal(log.finished.length, 3);
  screenEl.el('[data-role="exit"]').click();
  assert.equal(log.exits, 1);
  session.destroy();
});

test("試行結果の形(camelCase): 時刻は出題音の最初の再生開始から回答まで", async () => {
  const { env, screenEl, session, log } = await start({ questionCount: 1 });
  env.tick(UNTIL_QUESTION_ONSET + 1.25);
  screenEl.el(`[data-code="${correctCode(session, 0)}"]`).click();
  env.tick(3.1);
  await flushMicrotasks();
  const [result] = log.finished;
  assert.deepEqual(Object.keys(result), ["trialId", "questionId", "menuId", "stimulusId", "keyCode", "taskTemplateId", "timing", "responses", "scoring"]);
  assert.equal(result.questionId, "menu-01-q01");
  assert.equal(result.keyCode, "C");
  assert.deepEqual(Object.keys(result.timing), ["presentedAt", "respondedAt", "responseTimeMs"]);
  approx(result.timing.responseTimeMs, 1250);
  assert.equal(result.scoring.allCorrect, true);
  session.destroy();
});

test("和音のメニュー: 和音の根音度で判定し、「? → Ⅰ」の画面", async () => {
  const { env, screenEl, session, log } = await start({ menu: CHORD_MENU, questionCount: 1 });
  assert.match(screenEl.innerHTML, /\? → Ⅰ/);
  env.tick(UNTIL_QUESTION_ONSET + 0.5);
  screenEl.el(`[data-code="${correctCode(session, 0)}"]`).click();
  env.tick(3.1);
  await flushMicrotasks();
  assert.equal(log.finished[0].responses[0].outcome, "correct");
  session.destroy();
});

test("音声の読み込みに失敗したら、再読み込みを促す文言を出す", async () => {
  const { screenEl, session } = await start({ envOptions: { failSrc: "-setup-" } });
  assert.match(screenEl.innerHTML, new RegExp(SESSION_TEXT.audioError));
  session.destroy();
});

test("destroy: 音を止め、以後は何も起きない", async () => {
  const { env, screenEl, session } = await start();
  session.destroy();
  env.tick(UNTIL_QUESTION_ONSET + 1);
  assert.ok(keyButtons(screenEl).every((button) => button.disabled), "回答可能にならない");
  assert.ok(env.stopped.length >= 1);
});

test("音の再生の開始・終了で、画面を作り直さない(1問につき1回だけ作る)", async () => {
  const { env, screenEl, session } = await start({ questionCount: 2 });
  assert.equal(screenEl.renders(), 1);
  env.tick(UNTIL_QUESTION_ONSET + 3); // 出題音が鳴り始め、終わる(リプレイの可否が切り替わる)
  screenEl.el('[data-role="replay"]').click();
  env.tick(4);
  assert.equal(screenEl.renders(), 1);
  screenEl.el(`[data-code="${correctCode(session, 0)}"]`).click();
  env.tick(0.6);
  assert.equal(screenEl.renders(), 1, "フィードバックの表示でも作り直さない");
  env.tick(2.5);
  assert.equal(screenEl.renders(), 2, "次の問題で1回だけ作る");
  session.destroy();
});
