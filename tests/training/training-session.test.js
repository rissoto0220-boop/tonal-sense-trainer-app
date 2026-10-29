import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeDom } from "./helpers/fake-dom.js";
import { runTrainingSession, SESSION_TEXT, REPLAY_MODES } from "../../src/training/training-session.js";
import { TRAINING_MENUS } from "../../src/training/menus.js";
import { TRAINING_KEY_CODES } from "../../src/training/stimuli.js";
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
const RANDOM_KEY_MENU = TRAINING_MENUS[14]; // ⑮ 単音 ソラシドレミファ(Key ランダム)

async function start({ menu = MELODY_MENU, questionCount = 3, replayMode, envOptions, seed = 7 } = {}) {
  const env = createFakeAudioEnv(envOptions);
  const screenEl = createFakeDom();
  const log = { started: null, confirmed: [], updated: [], finished: null, finishedCalls: 0, interrupted: null, audioErrors: 0, exits: 0 };
  const session = runTrainingSession({
    screenEl,
    menu,
    questionCount,
    replayMode,
    randomFn: seededRandom(seed),
    onSessionStarted: (info) => { log.started = info; },
    onTrialConfirmed: (trial) => log.confirmed.push(trial),
    onTrialUpdated: (trial) => log.updated.push(trial),
    onFinished: (trials) => { log.finished = trials; log.finishedCalls += 1; },
    onInterrupted: (trials) => { log.interrupted = trials; },
    onAudioError: () => { log.audioErrors += 1; },
    onExit: () => { log.exits += 1; },
    audioOptions: env.audioOptions(),
    audioContextTimeFn: env.audioContextTimeFn,
    nowIsoFn: () => `T${env.audioContextTimeFn().toFixed(2)}`, // 音声時計の値で、どの時点の記録かを確かめる
  });
  await flushMicrotasks();
  return { env, screenEl, session, log };
}

const correctCode = (session, index) => session.questions[index].resolvedAnswerTargets[0].correctAnswerCode;
const wrongCode = (menu, code) => menu.activeOptionCodes.find((item) => item !== code);
const keyButtons = (screenEl) => screenEl.querySelectorAll("[data-code]");
const next = (screenEl) => screenEl.el('[data-role="next"]');

// 最初の再生(読み込み直後 = 音声時計10.0):調セットアップのWAVは10.5に始まり、出題音のWAVは15.5〜18.5。
// 出題音の音は16.0に鳴り始め、18.0に鳴り終わる(回答できるようになる)。読み込み直後からの経過で進める。
const UNTIL_QUESTION_ONSET = 6.0;
const UNTIL_ANSWERABLE = 8.0;
// フィードバック: 押してから0.05秒後にWAVが始まり、音は0.55秒後に鳴り始め、2.55秒後に鳴り終わる。WAVの終わりは3.05秒後。
const UNTIL_FEEDBACK_ONSET = 0.56;
const UNTIL_FEEDBACK_END = 3.06;

async function answerAll(env, screenEl, session, codes) {
  for (let i = 0; i < codes.length; i += 1) {
    env.tick(UNTIL_ANSWERABLE + 0.1);
    screenEl.el(`[data-code="${codes[i](i)}"]`).click();
    env.tick(UNTIL_FEEDBACK_END);
    if (!next(screenEl)?.hidden && next(screenEl)) next(screenEl).click();
    await flushMicrotasks();
  }
}

test("リプレイの方式は2つ。未対応の方式は例外", () => {
  assert.deepEqual(REPLAY_MODES, ["question-only", "with-setup"]);
  assert.throws(() => runTrainingSession({ screenEl: createFakeDom(), menu: MELODY_MENU, replayMode: "loop" }), /未対応のリプレイの方式です/);
});

test("既定の出題数は15", async () => {
  const { session, log } = await start({ questionCount: null }); // null = 指定しない(メニューの既定を使う)
  assert.equal(session.questions.length, 15);
  assert.equal(log.started.trialsPlanned, 15);
  session.destroy();
});

test("開始の通知: メニュー・セッションのKey・Keyの決め方・出題数", async () => {
  const fixed = await start();
  assert.deepEqual(fixed.log.started, { menuId: "menu-01", sessionKeyCode: "C", keyAssignmentMethod: "fixed", trialsPlanned: 3 });
  fixed.session.destroy();

  const random = await start({ menu: RANDOM_KEY_MENU, questionCount: 15 });
  assert.equal(random.log.started.keyAssignmentMethod, "randomAtSessionStart");
  assert.ok(TRAINING_KEY_CODES.includes(random.log.started.sessionKeyCode));
  random.session.destroy();
});

test("Keyランダムのメニュー: 全問が、開始時に決めた同じKey", async () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const { session, log } = await start({ menu: RANDOM_KEY_MENU, questionCount: 15, seed });
    assert.ok(session.questions.every((question) => question.keyCode === log.started.sessionKeyCode));
    assert.equal(session.sessionKeyCode, log.started.sessionKeyCode);
    session.destroy();
  }
});

test("最初は押せない。調セットアップ → 出題音。出題音の音が鳴り終わってから押せる", async () => {
  const { env, screenEl, session } = await start();
  assert.deepEqual(env.scheduled.map((item) => item.src.replace(/^S\//, "")), ["c-setup-v01.wav", `c-q-${session.questions[0].stimulusId}-v01.wav`]);
  assert.ok(keyButtons(screenEl).every((button) => button.disabled));
  env.tick(UNTIL_QUESTION_ONSET + 0.5);
  assert.ok(keyButtons(screenEl).every((button) => button.disabled), "出題音が鳴っている間は押せない");
  assert.ok(screenEl.el('[data-role="giveup"]').disabled);
  env.tick(UNTIL_ANSWERABLE - UNTIL_QUESTION_ONSET - 0.5 + 0.01);
  const activeEnabled = keyButtons(screenEl).filter((button) => !button.disabled).map((button) => button.dataset.code);
  assert.deepEqual(new Set(activeEnabled), new Set(MELODY_MENU.activeOptionCodes));
  assert.equal(screenEl.el('[data-role="giveup"]').disabled, false);
  assert.match(screenEl.innerHTML, /1 \/ 3/);
  session.destroy();
});

test("正解: フィードバックのフレーズが鳴り始めると同時に「正解です」、フレーズが終わって0.5秒後に次の問題へ", async () => {
  const { env, screenEl, session } = await start();
  env.tick(UNTIL_ANSWERABLE + 0.1);
  screenEl.el(`[data-code="${correctCode(session, 0)}"]`).click();
  assert.match(env.scheduled.at(-1).src, /c-fb-/);
  assert.equal(screenEl.text('[data-role="feedback"]'), "", "フレーズの音が鳴る前は、まだ表示しない");
  env.tick(UNTIL_FEEDBACK_ONSET);
  assert.equal(screenEl.el('[data-role="feedback"]').innerHTML, "<p>正解です</p>");
  assert.equal(next(screenEl).hidden, true, "正解のときは「次に進む」を出さない");
  env.tick(UNTIL_FEEDBACK_END - UNTIL_FEEDBACK_ONSET);
  assert.match(screenEl.innerHTML, /2 \/ 3/);
  session.destroy();
});

test("不正解: 最初のフィードバックが鳴り終わるまで「次に進む」を押せない。聞き直しの間も押せない", async () => {
  const { env, screenEl, session, log } = await start();
  env.tick(UNTIL_ANSWERABLE + 0.1);
  const correct = correctCode(session, 0);
  screenEl.el(`[data-code="${wrongCode(MELODY_MENU, correct)}"]`).click();
  env.tick(UNTIL_FEEDBACK_ONSET);
  assert.match(screenEl.el('[data-role="feedback"]').innerHTML, /^<p>不正解です<\/p><p>正解は「[^」]+」です<\/p>$/);
  assert.equal(next(screenEl).hidden, false, "「次に進む」は見えている");
  assert.equal(next(screenEl).disabled, true, "フィードバックの再生中は押せない");
  next(screenEl).click();
  assert.match(screenEl.innerHTML, /1 \/ 3/);
  assert.ok(screenEl.el('[data-role="replay"]').disabled, "フレーズの再生中は聞き直せない");
  env.tick(UNTIL_FEEDBACK_END - UNTIL_FEEDBACK_ONSET);
  assert.match(screenEl.innerHTML, /1 \/ 3/, "自動では進まない");
  assert.equal(next(screenEl).disabled, false);
  assert.equal(next(screenEl).focused, true);

  const replay = screenEl.el('[data-role="replay"]');
  replay.click();
  assert.match(env.scheduled.at(-1).src, /c-fb-/);
  assert.equal(next(screenEl).disabled, true, "聞き直しの間も押せない");
  assert.equal(log.updated.length, 1);
  assert.equal(log.updated[0].feedbackReplayCount, 1);
  env.tick(UNTIL_FEEDBACK_END);
  replay.click();
  env.tick(UNTIL_FEEDBACK_END);
  assert.deepEqual(log.updated.map((trial) => trial.feedbackReplayCount), [1, 2]);
  next(screenEl).click();
  assert.match(screenEl.innerHTML, /2 \/ 3/);
  session.destroy();
});

test("「わからない」: responseCode は null、outcome は giveup。正解を示し、フィードバックの後に「次に進む」", async () => {
  const { env, screenEl, log, session } = await start({ questionCount: 1 });
  env.tick(UNTIL_ANSWERABLE + 0.1);
  screenEl.el('[data-role="giveup"]').click();
  assert.deepEqual(log.confirmed[0].responses[0], { targetId: log.confirmed[0].responses[0].targetId, responseCode: null, correctAnswerCode: correctCode(session, 0), outcome: "giveup" });
  assert.equal(log.confirmed[0].scoring.allCorrect, false);
  env.tick(UNTIL_FEEDBACK_ONSET);
  assert.match(screenEl.el('[data-role="feedback"]').innerHTML, /<p>不正解です<\/p><p>正解は/);
  assert.equal(next(screenEl).disabled, true);
  env.tick(UNTIL_FEEDBACK_END);
  next(screenEl).click();
  assert.match(screenEl.innerHTML, /正解数 0 \/ 1/);
  session.destroy();
});

test("リプレイ(出題音だけ): 出題音のWAVが終わってから押せる。押すと出題音だけを鳴らし直し、回数を数える", async () => {
  const { env, screenEl, session, log } = await start({ replayMode: "question-only", questionCount: 1 });
  env.tick(UNTIL_ANSWERABLE + 0.1);
  assert.ok(screenEl.el('[data-role="replay"]').disabled, "出題音のWAVが終わるまでは押せない");
  env.tick(0.5);
  const replay = screenEl.el('[data-role="replay"]');
  assert.equal(replay.disabled, false);
  const before = env.scheduled.length;
  replay.click();
  assert.deepEqual(env.scheduled.slice(before).map((item) => /-setup-/.test(item.src) ? "setup" : "q"), ["q"]);
  assert.ok(keyButtons(screenEl).some((button) => !button.disabled), "リプレイ中も回答できる");
  env.tick(3.1);
  replay.click();
  screenEl.el(`[data-code="${correctCode(session, 0)}"]`).click();
  assert.equal(log.confirmed[0].questionReplayCount, 2);
  assert.equal(log.confirmed[0].feedbackReplayCount, 0);
  session.destroy();
});

test("リプレイ(調セットアップから): 調セットアップ → 出題音を鳴らし直す", async () => {
  const { env, screenEl, session } = await start({ replayMode: "with-setup" });
  env.tick(UNTIL_ANSWERABLE + 1);
  const before = env.scheduled.length;
  screenEl.el('[data-role="replay"]').click();
  assert.deepEqual(env.scheduled.slice(before).map((item) => /-setup-/.test(item.src) ? "setup" : "q"), ["setup", "q"]);
  session.destroy();
});

test("回答すると鳴っている音(リプレイ中の出題音)を止める", async () => {
  const { env, screenEl, session } = await start();
  env.tick(UNTIL_ANSWERABLE + 1);
  screenEl.el('[data-role="replay"]').click();
  env.tick(1);
  screenEl.el(`[data-code="${correctCode(session, 0)}"]`).click();
  assert.ok(env.stopped.some((src) => /-q-/.test(src)));
  session.destroy();
});

test("試行の記録(camelCase): 回答の確定時に通知。反応時間は回答できるようになった時刻から", async () => {
  const { env, screenEl, session, log } = await start({ questionCount: 1 });
  env.tick(UNTIL_ANSWERABLE + 1.25);
  screenEl.el(`[data-code="${correctCode(session, 0)}"]`).click();
  assert.equal(log.confirmed.length, 1, "フィードバックを待たずに通知する");
  const [trial] = log.confirmed;
  assert.deepEqual(Object.keys(trial), [
    "trialNumber", "menuId", "stimulusId", "stimulusVersion", "taskTemplateId", "keyCode",
    "questionReplayCount", "feedbackReplayCount",
    "audioStartedAt", "audioEndedAt", "responseEnabledAt", "responseSubmittedAt", "responseTimeMs",
    "responses", "scoring",
  ]);
  assert.equal(trial.trialNumber, 1);
  assert.equal(trial.menuId, "menu-01");
  assert.equal(trial.stimulusVersion, "01");
  assert.equal(trial.taskTemplateId, "tt-melody-first");
  assert.equal(trial.keyCode, "C");
  assert.equal(trial.audioStartedAt, "T16.00");
  assert.equal(trial.audioEndedAt, "T18.00");
  assert.equal(trial.responseEnabledAt, "T18.00");
  assert.equal(trial.responseSubmittedAt, "T19.25");
  approx(trial.responseTimeMs, 1250);
  assert.equal(trial.scoring.allCorrect, true);
  session.destroy();
});

test("リプレイしても、出題音の時刻(最初の再生)は書き換えない", async () => {
  const { env, screenEl, session, log } = await start({ questionCount: 1 });
  env.tick(UNTIL_ANSWERABLE + 1);
  screenEl.el('[data-role="replay"]').click();
  env.tick(3.1);
  screenEl.el(`[data-code="${correctCode(session, 0)}"]`).click();
  assert.equal(log.confirmed[0].audioStartedAt, "T16.00");
  assert.equal(log.confirmed[0].responseEnabledAt, "T18.00");
  session.destroy();
});

test("全問が終わると終了画面(正解数/出題数)。onFinished は1回で、全試行を渡す。「メニュー選択へ戻る」で onExit", async () => {
  const { env, screenEl, session, log } = await start({ questionCount: 3 });
  // 1問目: 正解、2問目: 不正解、3問目: 正解
  await answerAll(env, screenEl, session, [
    (i) => correctCode(session, i),
    (i) => wrongCode(MELODY_MENU, correctCode(session, i)),
    (i) => correctCode(session, i),
  ]);
  assert.match(screenEl.innerHTML, new RegExp(SESSION_TEXT.finishedTitle));
  assert.match(screenEl.innerHTML, /正解数 2 \/ 3/);
  assert.equal(log.finishedCalls, 1);
  assert.deepEqual(log.finished.map((trial) => trial.trialNumber), [1, 2, 3]);
  assert.equal(log.interrupted, null);
  screenEl.el('[data-role="exit"]').click();
  assert.equal(log.exits, 1);
  session.destroy();
});

test("完了の時点: 最終問が不正解なら、必須のフィードバックが鳴り終わった時点(「次に進む」を押す前)", async () => {
  const { env, screenEl, session, log } = await start({ questionCount: 1 });
  env.tick(UNTIL_ANSWERABLE + 0.1);
  screenEl.el(`[data-code="${wrongCode(MELODY_MENU, correctCode(session, 0))}"]`).click();
  env.tick(UNTIL_FEEDBACK_ONSET);
  assert.equal(log.finishedCalls, 0, "必須のフィードバックの途中はまだ完了しない");
  env.tick(UNTIL_FEEDBACK_END - UNTIL_FEEDBACK_ONSET);
  assert.equal(log.finishedCalls, 1);
  screenEl.el('[data-role="replay"]').click();
  assert.equal(log.updated.at(-1).feedbackReplayCount, 1, "完了の後も聞き直しの回数は通知する");
  env.tick(UNTIL_FEEDBACK_END);
  next(screenEl).click();
  assert.match(screenEl.innerHTML, /正解数 0 \/ 1/);
  assert.equal(log.finishedCalls, 1, "終了画面で二重に通知しない");
  assert.equal(log.finished[0].feedbackReplayCount, 0, "通知した時点の記録(後の変化は onTrialUpdated で届く)");
  session.destroy();
});

test("訓練を終了する → 終了する: 回答済みの試行だけを onInterrupted に渡し、onExit。onFinished は呼ばない", async () => {
  const { env, screenEl, session, log } = await start({ questionCount: 3 });
  await answerAll(env, screenEl, session, [(i) => correctCode(session, i)]);
  assert.match(screenEl.innerHTML, /2 \/ 3/);
  env.tick(UNTIL_QUESTION_ONSET + 0.5);
  const stoppedBefore = env.stopped.length;
  screenEl.el('[data-role="quit"]').click();
  assert.ok(env.stopped.length > stoppedBefore, "確認を出す前に音を止める");
  assert.equal(screenEl.el('[data-role="quit-confirm"]').hidden, false);
  env.tick(10);
  assert.ok(keyButtons(screenEl).every((button) => button.disabled), "止めた再生の予約(回答可能化)は起きない");
  screenEl.el('[data-role="quit-yes"]').click();
  assert.deepEqual(log.interrupted.map((trial) => trial.trialNumber), [1]);
  assert.equal(log.finished, null);
  assert.equal(log.exits, 1);
  session.destroy();
});

test("訓練を終了する → 続ける(最初の再生の途中): 調セットアップから鳴らし直し、時刻もやり直した再生で記録する", async () => {
  const { env, screenEl, session, log } = await start({ questionCount: 1 });
  env.tick(UNTIL_QUESTION_ONSET + 0.5); // 出題音が鳴り始めた後、鳴り終わる前
  screenEl.el('[data-role="quit"]').click();
  env.tick(5);
  const before = env.scheduled.length;
  screenEl.el('[data-role="quit-no"]').click();
  assert.deepEqual(env.scheduled.slice(before).map((item) => /-setup-/.test(item.src) ? "setup" : "q"), ["setup", "q"]);
  env.tick(10);
  screenEl.el(`[data-code="${correctCode(session, 0)}"]`).click();
  const [trial] = log.confirmed;
  assert.equal(trial.questionReplayCount, 0, "やり直しはリプレイに数えない");
  assert.notEqual(trial.audioStartedAt, "T16.00");
  assert.equal(Number(trial.responseEnabledAt.slice(1)) - Number(trial.audioStartedAt.slice(1)), 2, "やり直した再生の開始と終わり");
  session.destroy();
});

test("訓練を終了する → 続ける(必須のフィードバックの途中): フィードバックを最初から鳴らし直す。聞き直しには数えない", async () => {
  const { env, screenEl, session, log } = await start({ questionCount: 2 });
  env.tick(UNTIL_ANSWERABLE + 0.1);
  screenEl.el(`[data-code="${wrongCode(MELODY_MENU, correctCode(session, 0))}"]`).click();
  env.tick(1);
  screenEl.el('[data-role="quit"]').click();
  const before = env.scheduled.length;
  screenEl.el('[data-role="quit-no"]').click();
  assert.match(env.scheduled.slice(before).map((item) => item.src).join(), /c-fb-/);
  assert.equal(next(screenEl).disabled, true);
  env.tick(UNTIL_FEEDBACK_END);
  assert.equal(next(screenEl).disabled, false);
  assert.equal(log.updated.length, 0);
  session.destroy();
});

test("訓練を終了する → 続ける(正解のフィードバックの途中): 鳴らし直して、終われば自動で次へ", async () => {
  const { env, screenEl, session } = await start({ questionCount: 2 });
  env.tick(UNTIL_ANSWERABLE + 0.1);
  screenEl.el(`[data-code="${correctCode(session, 0)}"]`).click();
  env.tick(1);
  screenEl.el('[data-role="quit"]').click();
  env.tick(10);
  assert.match(screenEl.innerHTML, /1 \/ 2/, "確認の間は自動で進まない");
  screenEl.el('[data-role="quit-no"]').click();
  env.tick(UNTIL_FEEDBACK_END);
  assert.match(screenEl.innerHTML, /2 \/ 2/);
  session.destroy();
});

test("訓練を終了する: 最終問の必須のフィードバックが終わった後なら完了として扱い、onInterrupted は呼ばない", async () => {
  const { env, screenEl, session, log } = await start({ questionCount: 1 });
  env.tick(UNTIL_ANSWERABLE + 0.1);
  screenEl.el(`[data-code="${wrongCode(MELODY_MENU, correctCode(session, 0))}"]`).click();
  env.tick(UNTIL_FEEDBACK_END);
  screenEl.el('[data-role="quit"]').click();
  screenEl.el('[data-role="quit-yes"]').click();
  assert.equal(log.finishedCalls, 1);
  assert.equal(log.interrupted, null);
  assert.equal(log.exits, 1);
  session.destroy();
});

test("和音のメニュー: 和音の根音度で判定し、「? → Ⅰ」の画面", async () => {
  const { env, screenEl, session, log } = await start({ menu: CHORD_MENU, questionCount: 1 });
  assert.match(screenEl.innerHTML, /\? → Ⅰ/);
  env.tick(UNTIL_ANSWERABLE + 0.1);
  screenEl.el(`[data-code="${correctCode(session, 0)}"]`).click();
  env.tick(UNTIL_FEEDBACK_END);
  await flushMicrotasks();
  assert.equal(log.finished[0].responses[0].outcome, "correct");
  session.destroy();
});

test("音声の読み込みに失敗したら、再読み込みを促す文言を出し、onAudioError", async () => {
  const { screenEl, session, log } = await start({ envOptions: { failSrc: "-setup-" } });
  assert.match(screenEl.innerHTML, new RegExp(SESSION_TEXT.audioError));
  assert.equal(log.audioErrors, 1);
  session.destroy();
});

test("destroy: 音を止め、以後は何も起きない", async () => {
  const { env, screenEl, session } = await start();
  session.destroy();
  env.tick(UNTIL_ANSWERABLE + 1);
  assert.ok(keyButtons(screenEl).every((button) => button.disabled), "回答可能にならない");
  assert.ok(env.stopped.length >= 1);
});

test("音の再生の開始・終了で、画面を作り直さない(1問につき1回だけ作る)", async () => {
  const { env, screenEl, session } = await start({ questionCount: 2 });
  assert.equal(screenEl.renders(), 1);
  env.tick(UNTIL_ANSWERABLE + 1); // 出題音が鳴り始め、終わる(回答・リプレイの可否が切り替わる)
  screenEl.el('[data-role="replay"]').click();
  env.tick(4);
  assert.equal(screenEl.renders(), 1);
  screenEl.el(`[data-code="${correctCode(session, 0)}"]`).click();
  env.tick(UNTIL_FEEDBACK_ONSET);
  assert.equal(screenEl.renders(), 1, "フィードバックの表示でも作り直さない");
  env.tick(UNTIL_FEEDBACK_END - UNTIL_FEEDBACK_ONSET);
  assert.equal(screenEl.renders(), 2, "次の問題で1回だけ作る");
  session.destroy();
});
