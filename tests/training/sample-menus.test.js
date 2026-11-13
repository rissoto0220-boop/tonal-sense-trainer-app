// 将来の問題拡張のサンプル(短調・六和音の進行)のテスト。
// データ定義(刺激・課題テンプレート・メニュー)と、主音の表示・複数回答の画面と進行、仮音源のスクリプトとの一致を確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFakeDom } from "./helpers/fake-dom.js";
import { createFakeAudioEnv, flushMicrotasks } from "./helpers/fake-audio-env.js";
import { SAMPLE_MENUS } from "../../src/training/sample-menus.js";
import { SAMPLE_STIMULI, MINOR_SAMPLE_STIMULI, PROGRESSION_SAMPLE_STIMULI } from "../../src/training/sample-stimuli.js";
import { TRAINING_MENUS } from "../../src/training/menus.js";
import { TRAINING_STIMULI, findTrainingStimulus, keySetupAudioFilenameFor } from "../../src/training/stimuli.js";
import { TASK_TEMPLATES, CHORDS, OPTION_SETS } from "../../src/training/definitions.js";
import { resolveAnswerTargets } from "../../src/training/resolve-answer-targets.js";
import { buildQuestions } from "../../src/training/question-pool.js";
import { buildAnswerScreenHtml, mountAnswerScreen, hexagonPositions, promptText, multiFeedbackLines } from "../../src/training/answer-screen.js";
import { buildMenuScreenHtml, MENU_SCREEN_TEXT } from "../../src/training/menu-screen.js";
import { runTrainingSession } from "../../src/training/training-session.js";

const [MINOR_MELODY, MINOR_CHORD, PROG_MELODY, PROG_CHORD] = SAMPLE_MENUS;
const correctCodes = (stimulusId, templateRef) => resolveAnswerTargets(findTrainingStimulus(stimulusId), TASK_TEMPLATES[templateRef]).map((target) => target.correctAnswerCode);

// --- データ定義 ---

test("サンプルは4メニュー。ver.1 の16メニューとはIDも刺激も重ならない", () => {
  assert.deepEqual(SAMPLE_MENUS.map((menu) => menu.menuId), ["sample-01", "sample-02", "sample-03", "sample-04"]);
  assert.ok(SAMPLE_MENUS.every((menu) => menu.sample === true && menu.keyPolicy.mode === "fixed" && menu.keyPolicy.keyCode === "C"));
  assert.ok(TRAINING_MENUS.every((menu) => !menu.sample && !("tonicCode" in menu)), "ver.1 のメニューは変えない");
  const ver1Ids = new Set(TRAINING_STIMULI.map((stimulus) => stimulus.stimulusId));
  const sampleIds = SAMPLE_STIMULI.map((stimulus) => stimulus.stimulusId);
  assert.equal(new Set(sampleIds).size, sampleIds.length, "サンプルの刺激IDが重複");
  assert.ok(sampleIds.every((id) => !ver1Ids.has(id)));
});

test("どのサンプルメニューも、全問の問題を作れる。出題数は刺激の数で、各刺激がちょうど1回", () => {
  for (const menu of SAMPLE_MENUS) {
    const questions = buildQuestions(menu, { randomFn: () => 0.3 });
    assert.equal(questions.length, menu.stimulusIds.length, menu.menuId);
    assert.deepEqual(new Set(questions.map((question) => question.stimulusId)), new Set(menu.stimulusIds));
    assert.equal(questions[0].resolvedAnswerTargets.length, TASK_TEMPLATES[menu.taskTemplateRef].answerTargets.length);
  }
});

test("押せる音(activeOptionCodes)に、そのメニューの正解がすべて含まれる。押せる音は回答候補にある", () => {
  for (const menu of SAMPLE_MENUS) {
    const optionCodes = OPTION_SETS[TASK_TEMPLATES[menu.taskTemplateRef].answerTargets[0].optionSetRef].options.map((option) => option.code);
    assert.ok(menu.activeOptionCodes.every((code) => optionCodes.includes(code)), menu.menuId);
    const corrects = new Set(menu.stimulusIds.flatMap((id) => correctCodes(id, menu.taskTemplateRef)));
    assert.ok([...corrects].every((code) => menu.activeOptionCodes.includes(code)), `${menu.menuId}: ${[...corrects]}`);
  }
});

test("短調: 第2イベントはラ(n6)とⅥm。scale は minor。和音は Ⅱm・Ⅲ7・Ⅵm だけ", () => {
  for (const stimulus of MINOR_SAMPLE_STIMULI) {
    assert.equal(stimulus.musicalContext.scale, "minor");
    assert.equal(stimulus.parts.melody.events[1].degree, "n6");
    assert.equal(stimulus.parts.harmony.events[1].chordRef, "ch-n6-min");
    assert.ok(["ch-n2-min", "ch-n3-dom7", "ch-n6-min"].includes(stimulus.parts.harmony.events[0].chordRef));
  }
  assert.equal(MINOR_MELODY.tonicCode, "n6");
  assert.equal(MINOR_CHORD.tonicCode, "n6");
  assert.deepEqual(MINOR_CHORD.activeOptionCodes, ["n2", "n3", "n6"]);
});

test("短調の正解: ミ/Ⅲ7 は単音 n3・和音 n3、レ/Ⅱm は単音 n2・和音 n2", () => {
  assert.deepEqual(correctCodes("st-min-n3-ch-n3-dom7", "tt-melody-first"), ["n3"]);
  assert.deepEqual(correctCodes("st-min-n3-ch-n3-dom7", "tt-chord-first"), ["n3"]);
  assert.deepEqual(correctCodes("st-min-n2-ch-n2-min", "tt-chord-first"), ["n2"]);
  assert.equal(CHORDS["ch-n3-dom7"].quality, "dom7", "和声的短音階のⅢは属七");
});

test("進行: 3イベント(1拍+1拍+2拍)で、最後はドとⅠ。各音は同じ拍の和音の構成音", () => {
  const CHORD_TONES = { n1: ["n1", "n3", "n5"], n2: ["n2", "n4", "n6"], n3: ["n3", "n5", "n7"], n4: ["n4", "n6", "n1"], n5: ["n5", "n7", "n2", "n4"], n6: ["n6", "n1", "n3"] };
  for (const stimulus of PROGRESSION_SAMPLE_STIMULI) {
    const { melody, harmony } = stimulus.parts;
    assert.deepEqual(melody.events.map((event) => event.durationBeats), [1, 1, 2]);
    assert.deepEqual(harmony.events.map((event) => event.durationBeats), [1, 1, 2]);
    assert.equal(melody.events[2].degree, "n1");
    assert.equal(harmony.events[2].chordRef, "ch-n1-maj");
    melody.events.forEach((event, i) => {
      const root = CHORDS[harmony.events[i].chordRef].rootDegree;
      assert.ok(CHORD_TONES[root].includes(event.degree), `${stimulus.stimulusId} の${i + 1}拍目`);
    });
  }
});

test("進行の正解: Ⅱm→Ⅴ7→Ⅰ は和音 [n2, n5]、メロディ(レ→シ→ド)は [n2, n7]。最後のイベントは答えない", () => {
  assert.deepEqual(correctCodes("st-prog-n2-n5", "tt-chord-first-two"), ["n2", "n5"]);
  assert.deepEqual(correctCodes("st-prog-n2-n5", "tt-melody-first-two"), ["n2", "n7"]);
  assert.deepEqual(TASK_TEMPLATES["tt-chord-first-two"].answerTargets.map((target) => [target.eventId, target.sequenceOrder]), [["h1", 1], ["h2", 2]]);
  assert.equal(PROG_MELODY.taskTemplateRef, "tt-melody-first-two");
  assert.equal(PROG_CHORD.taskTemplateRef, "tt-chord-first-two");
});

test("六和音の進行(和音)では Ⅰ〜Ⅵ の6つすべてが、少なくとも1回は答えになる", () => {
  const corrects = new Set(PROG_CHORD.stimulusIds.flatMap((id) => correctCodes(id, "tt-chord-first-two")));
  assert.deepEqual([...corrects].sort(), ["n1", "n2", "n3", "n4", "n5", "n6"]);
});

test("問題に scale が付き、短調の調セットアップは c-setup-minor-v01.wav", () => {
  assert.equal(buildQuestions(MINOR_MELODY)[0].scale, "minor");
  assert.equal(buildQuestions(PROG_CHORD)[0].scale, "major");
  assert.equal(buildQuestions(TRAINING_MENUS[0])[0].scale, "major");
  assert.equal(keySetupAudioFilenameFor("C"), "c-setup-v01.wav");
  assert.equal(keySetupAudioFilenameFor("C", "minor"), "c-setup-minor-v01.wav");
  assert.throws(() => keySetupAudioFilenameFor("C", "dorian"), /未対応の音階です/);
});

// --- 画面 ---

test("メニュー画面: サンプルは3つ目のグループとして最後に並ぶ。渡さなければグループも出ない", () => {
  const html = buildMenuScreenHtml([...TRAINING_MENUS, ...SAMPLE_MENUS]);
  const groupAt = html.indexOf(`>${MENU_SCREEN_TEXT.sampleGroup}</h3>`);
  assert.ok(groupAt > html.indexOf(">Key ランダム</h3>"));
  assert.ok(html.indexOf('data-menu-id="menu-16"') < groupAt && html.indexOf('data-menu-id="sample-01"') > groupAt);
  assert.equal(buildMenuScreenHtml(TRAINING_MENUS).includes(MENU_SCREEN_TEXT.sampleGroup), false);
});

test("主音の指定(短調): 上部の表示は「? → ラ」「? → Ⅵ」。ラの鍵盤が高く、六角形の頂点はⅥ", () => {
  const IDLE = { answerable: false, selectedCode: null, result: null, showNext: false, replayEnabled: null };
  const melody = buildAnswerScreenHtml({ optionSetRef: "melody-keyboard", activeOptionCodes: MINOR_MELODY.activeOptionCodes, progressLabel: "1 / 6", state: IDLE, tonicCode: "n6" });
  assert.match(melody, /data-role="prompt">\? → ラ</);
  assert.match(melody, /class="training-key training-key--tonic" data-code="n6"/);
  assert.equal(/training-key--tonic" data-code="n1"/.test(melody), false);
  const chord = buildAnswerScreenHtml({ optionSetRef: "chord-root-degrees", activeOptionCodes: MINOR_CHORD.activeOptionCodes, progressLabel: "1 / 6", state: IDLE, tonicCode: "n6" });
  assert.match(chord, /data-role="prompt">\? → Ⅵ</);
  assert.equal(hexagonPositions(OPTION_SETS["chord-root-degrees"].options, "n6").n6, 0);
});

test("複数回答の文字: 上部は「? → ? → ド」、正誤は1つ目・2つ目の順", () => {
  assert.equal(promptText([null, null], "ド"), "? → ? → ド");
  assert.equal(promptText(["レ", null], "ド"), "レ → ? → ド");
  assert.deepEqual(multiFeedbackLines([{ outcome: "correct", correctLabel: "Ⅱ" }, { outcome: "giveup", correctLabel: "Ⅴ" }]),
    ["1つ目: 正解です", "2つ目: 不正解です(正解は「Ⅴ」)"]);
});

function mountTwo() {
  const screenEl = createFakeDom();
  const calls = [];
  const screen = mountAnswerScreen({
    screenEl, optionSetRef: "chord-root-degrees", activeOptionCodes: PROG_CHORD.activeOptionCodes, progressLabel: "1 / 6", targetCount: 2,
    onAnswer: (code, info) => calls.push([code, info]),
  });
  screen.setAnswerable(true);
  return { screenEl, screen, calls };
}

test("2回答の画面: 1つ目のあとも押せて、上部が順に埋まる。2つ目で全ボタンが押せなくなる", () => {
  const { screenEl, calls } = mountTwo();
  screenEl.el('[data-code="n2"]').click();
  assert.equal(screenEl.text('[data-role="prompt"]'), "Ⅱ → ? → Ⅰ");
  assert.equal(screenEl.el('[data-code="n5"]').disabled, false, "1つ目のあとも押せる");
  assert.equal(screenEl.el('[data-role="giveup"]').disabled, false);
  screenEl.el('[data-code="n5"]').click();
  assert.equal(screenEl.text('[data-role="prompt"]'), "Ⅱ → Ⅴ → Ⅰ");
  assert.ok(screenEl.querySelectorAll("[data-code]").every((button) => button.disabled));
  screenEl.el('[data-code="n1"]').click(); // 押せないボタンを押しても何も起きない
  assert.deepEqual(calls, [["n2", { index: 0, complete: false }], ["n5", { index: 1, complete: true }]]);
});

test("2回答の画面: 「わからない」はその場で回答を終える(残りも答えない)", () => {
  const { screenEl, calls } = mountTwo();
  screenEl.el('[data-code="n2"]').click();
  screenEl.el('[data-role="giveup"]').click();
  assert.equal(screenEl.text('[data-role="prompt"]'), "Ⅱ → ? → Ⅰ");
  assert.ok(screenEl.querySelectorAll("[data-code]").every((button) => button.disabled));
  assert.deepEqual(calls.at(-1), ["giveup", { index: 1, complete: true }]);
});

test("2回答の画面: 結果は1つ目・2つ目の順に表示する", () => {
  const { screenEl, screen } = mountTwo();
  screen.showResult({ results: [{ outcome: "correct", correctAnswerCode: "n2" }, { outcome: "incorrect", correctAnswerCode: "n5" }], showNext: true });
  assert.equal(screenEl.el('[data-role="feedback"]').innerHTML, "<p>1つ目: 正解です</p><p>2つ目: 不正解です(正解は「Ⅴ」)</p>");
});

// --- 進行(音声は偽物) ---

const UNTIL_ANSWERABLE = 8.0; // training-session.test.js と同じ(読み込み直後から、出題音の音が鳴り終わるまで)
const UNTIL_FEEDBACK_ONSET = 0.56;

async function startSample(menu) {
  const env = createFakeAudioEnv();
  const screenEl = createFakeDom();
  const log = { confirmed: [] };
  const session = runTrainingSession({
    screenEl,
    menu,
    questionCount: 2,
    randomFn: () => 0.3,
    onTrialConfirmed: (trial) => log.confirmed.push(trial),
    audioOptions: env.audioOptions(),
    audioContextTimeFn: env.audioContextTimeFn,
    nowIsoFn: () => `T${env.audioContextTimeFn().toFixed(2)}`,
  });
  await flushMicrotasks();
  return { env, screenEl, session, log };
}

test("短調のサンプル: 調セットアップは短調の音源、上部は「? → ラ」", async () => {
  const { env, screenEl, session } = await startSample(MINOR_MELODY);
  assert.equal(env.scheduled[0].src.replace(/^S\//, ""), "c-setup-minor-v01.wav");
  assert.equal(screenEl.text('[data-role="prompt"]'), "? → ラ");
  session.destroy();
});

test("2回答のサンプル: 2つ目を答えた時点で1回だけ判定・記録し、まとめて正誤を出す", async () => {
  const { env, screenEl, session, log } = await startSample(PROG_CHORD);
  const [first, second] = session.questions[0].resolvedAnswerTargets.map((target) => target.correctAnswerCode);
  const wrong = PROG_CHORD.activeOptionCodes.find((code) => code !== second);
  env.tick(UNTIL_ANSWERABLE + 0.1);
  screenEl.el(`[data-code="${first}"]`).click();
  assert.equal(log.confirmed.length, 0, "1つ目ではまだ確定しない");
  assert.equal(env.scheduled.some((item) => /c-fb-/.test(item.src)), false, "フィードバックはまだ鳴らさない");
  screenEl.el(`[data-code="${wrong}"]`).click();
  assert.equal(log.confirmed.length, 1);
  const trial = log.confirmed[0];
  assert.deepEqual(trial.responses.map((response) => [response.responseCode, response.outcome]), [[first, "correct"], [wrong, "incorrect"]]);
  assert.deepEqual(trial.scoring, { targetCount: 2, correctTargetCount: 1, accuracy: 0.5, allCorrect: false });
  env.tick(UNTIL_FEEDBACK_ONSET);
  assert.match(screenEl.el('[data-role="feedback"]').innerHTML, /^<p>1つ目: 正解です<\/p><p>2つ目: 不正解です/);
  session.destroy();
});

test("2回答のサンプル: 1つ目で「わからない」なら、2つとも giveup で確定する", async () => {
  const { env, screenEl, session, log } = await startSample(PROG_MELODY);
  env.tick(UNTIL_ANSWERABLE + 0.1);
  screenEl.el('[data-role="giveup"]').click();
  assert.equal(log.confirmed.length, 1);
  assert.deepEqual(log.confirmed[0].responses.map((response) => response.outcome), ["giveup", "giveup"]);
  session.destroy();
});

// --- 仮音源のスクリプト(Python)との一致 ---

const generator = readFileSync(new URL("../../scripts/generate-training-placeholder-audio.py", import.meta.url), "utf8");
const checker = readFileSync(new URL("../../scripts/check-training-wavs.py", import.meta.url), "utf8");

function pythonSamples() {
  const start = generator.indexOf("SAMPLE_STIMULI = [");
  const block = generator.slice(start, generator.indexOf("\n]\n", start));
  const pairs = (text) => [...text.matchAll(/\("([a-z0-9-]+)", (\d+(?:\.\d+)?)\)/g)].map((match) => [match[1], Number(match[2])]);
  return [...block.matchAll(/^\s+\("(st-[a-z0-9-]+)", \[(.*?)\], \[(.*?)\]\),/gm)].map(([, id, melody, chords]) => ({ id, melody: pairs(melody), chords: pairs(chords) }));
}

test("仮音源の生成スクリプトのサンプル12刺激が、SAMPLE_STIMULI と同じ内容・同じ順", () => {
  const expected = SAMPLE_STIMULI.map((stimulus) => ({
    id: stimulus.stimulusId,
    melody: stimulus.parts.melody.events.map((event) => [event.degree, event.durationBeats]),
    chords: stimulus.parts.harmony.events.map((event) => [event.chordRef, event.durationBeats]),
  }));
  assert.deepEqual(pythonSamples(), expected);
  assert.match(generator, /^SAMPLE_KEY = "C"$/m);
  assert.match(generator, /"min": \[0, 3, 7\]/);
});

test("音源の検査スクリプトのサンプルの刺激IDが、SAMPLE_STIMULI と同じ順", () => {
  const start = checker.indexOf("SAMPLE_STIMULUS_IDS = [");
  const ids = [...checker.slice(start, checker.indexOf("\n]\n", start)).matchAll(/"(st-[a-z0-9-]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, SAMPLE_STIMULI.map((stimulus) => stimulus.stimulusId));
  assert.match(checker, /-setup-minor-v\{AUDIO_VERSION\}\.wav/);
});
