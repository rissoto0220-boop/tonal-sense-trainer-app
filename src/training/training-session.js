// 音感訓練の1メニュー(既定15問)の進行。回答画面(answer-screen.js)と音声(question-audio.js)をつなぐ。
// 保存はしない。試行の記録を作って通知するだけ(保存は session-store.js の記録係が受け持つ)。
//
// 1問の流れ(研究者の決定、tonal-sense-docs/training_pending_to_decisions.md):
//   回答画面を表示(まだ押せない)→ 調セットアップ → 1秒 → 出題音
//   → 出題音の音が鳴り終わったら回答できる(第5節。反応時間の起点もこの時刻)
//   → 回答(または「わからない」)→ 鳴っている音を止めて判定し、試行を記録(第8節: 回答確定の時点で通知)
//   → フィードバックのフレーズの音が鳴り始めるのと同時に、正誤の文言を表示
//   → 正解: フレーズが終わって0.5秒後に自動で次へ
//   → 不正解・わからない: 最初のフィードバックは必須。鳴り終わるまで「次に進む」を押せない(第4節)。
//     その後は何度でも聞き直せ(聞き直しの間も「次に進む」は押せない)、「次に進む」で次へ
// Keyは訓練の開始時に1つ決め、全問で使う(第12節)。
// リプレイ(回答前): replayMode = "question-only"(出題音だけ)/ "with-setup"(調セットアップから)。
//   試験的に両方を用意している(第1節: 保留)。
// リプレイの回数は試行ごとに記録する(第2節)。最初の自動再生は数えない。
//   回答前 → questionReplayCount、回答後 → feedbackReplayCount(回答後に増えたら onTrialUpdated で通知)。
// 「訓練を終了する」(第7節): 音を止めて画面内で確認する。「終了する」なら、回答済みの試行だけを残して終える。
//   「続ける」なら、止めた再生をやり直す。
// 完了(第9節): 全問に回答し、かつ最終問の必須のフィードバックが終わった時点。
import { escapeHtml } from "../shared/escape-html.js";
import { audioContextTime } from "../shared/audio-buffer-player.js";
import { toLocalIso } from "../shared/iso-time.js";
import { TASK_TEMPLATES } from "./definitions.js";
import { TRAINING_AUDIO_VERSION } from "./stimuli.js";
import { buildQuestions, drawSessionKey } from "./question-pool.js";
import { judgeResponses } from "./judge.js";
import { mountAnswerScreen } from "./answer-screen.js";
import { createQuestionAudio } from "./question-audio.js";

export const REPLAY_MODES = ["question-only", "with-setup"];

export const SESSION_TEXT = {
  finishedTitle: "訓練が終了しました",
  backToMenus: "メニュー選択へ戻る",
  audioError: "音声を読み込めませんでした。ページを再読み込みしてください。",
};

export function buildFinishedHtml(correctCount, questionCount) {
  return `
    <div class="panel center training-finished">
      <h2 tabindex="-1">${SESSION_TEXT.finishedTitle}</h2>
      <p class="training-score">正解数 ${correctCount} / ${questionCount}</p>
      <div class="actions centered"><button type="button" class="primary" data-role="exit">${SESSION_TEXT.backToMenus}</button></div>
    </div>`;
}

// menu: TRAINING_MENUS の1つ。questionCount を指定すると出題数を変えられる(既定はメニューの値=15)。
// 通知(試行の記録は、渡すたびに複製する。受け取った側が書き換えても進行に影響しない):
//   onSessionStarted({ menuId, sessionKeyCode, keyAssignmentMethod, trialsPlanned }): 開始時に1回。
//   onTrialConfirmed(trial): 回答を確定した時点。trial の形は下の confirmTrial を参照。
//   onTrialUpdated(trial): 回答後に記録が変わったとき(フィードバックを聞き直した回数)。
//   onFinished(trials): 完了した時点で1回(最終問の必須のフィードバックが終わった時点)。
//   onInterrupted(trials): 完了前に「訓練を終了する」で終えたとき。
//   onAudioError(): 音声を読み込めなかったとき。
//   onExit(): 終了画面の「メニュー選択へ戻る」、または「訓練を終了する」で終えたあと。
// 戻り値の destroy(): 画面を離れるときに呼ぶ。音・タイマーを止め、以後の操作を無視する。
export function runTrainingSession({
  screenEl,
  menu,
  questionCount,
  replayMode = "question-only",
  randomFn = Math.random,
  onSessionStarted = () => {},
  onTrialConfirmed = () => {},
  onTrialUpdated = () => {},
  onFinished = () => {},
  onInterrupted = () => {},
  onAudioError = () => {},
  onExit = () => {},
  audioOptions = {},
  audioContextTimeFn = audioContextTime,
  nowIsoFn = toLocalIso,
  createQuestionAudioFn = createQuestionAudio,
}) {
  if (!REPLAY_MODES.includes(replayMode)) throw new Error(`未対応のリプレイの方式です: ${replayMode}`);
  const { sessionKeyCode, keyAssignmentMethod } = drawSessionKey(menu, randomFn);
  const questions = buildQuestions(menu, { randomFn, keyCode: sessionKeyCode, ...(questionCount ? { questionCount } : {}) });
  const optionSetRef = TASK_TEMPLATES[menu.taskTemplateRef].answerTargets[0].optionSetRef;
  const trials = [];
  let current = null; // { audio, screen }
  let completed = false;
  let destroyed = false;

  const copyTrials = () => trials.map((trial) => structuredClone(trial));

  function teardown() {
    current?.audio.destroy();
    current?.screen.destroy();
    current = null;
  }

  function showAudioError() {
    teardown();
    screenEl.innerHTML = `<div class="panel center"><p class="error" role="alert">${escapeHtml(SESSION_TEXT.audioError)}</p></div>`;
    onAudioError();
  }

  // 全問に回答し、最終問の必須のフィードバックが終わった時点で1回だけ呼ぶ。
  function complete() {
    if (completed) return;
    completed = true;
    onFinished(copyTrials());
  }

  function showFinished() {
    teardown();
    complete();
    const correctCount = trials.filter((trial) => trial.scoring.allCorrect).length;
    screenEl.innerHTML = buildFinishedHtml(correctCount, trials.length);
    screenEl.querySelector("h2")?.focus();
    screenEl.querySelector('[data-role="exit"]')?.addEventListener("click", () => { if (!destroyed) onExit(); });
  }

  function quit() {
    teardown();
    if (!completed) onInterrupted(copyTrials());
    onExit();
  }

  function startQuestion(index) {
    if (destroyed) return;
    if (index >= questions.length) {
      showFinished();
      return;
    }
    teardown();
    const question = questions[index];
    const isLast = index === questions.length - 1;
    const target = question.resolvedAnswerTargets[0];
    const audio = createQuestionAudioFn(question, audioOptions);
    let loaded = false;
    let confirmingQuit = false;
    // 出題音の最初の(自動の)再生で記録する時刻。リプレイでは書き換えない。
    let onset = null; // { iso }
    let enabled = null; // { iso, audioTime }(出題音の音が鳴り終わり、回答できるようになった時刻)
    let questionReplayCount = 0;
    let trial = null; // 回答を確定したら作る
    let mandatoryFeedbackDone = false;

    const playQuestion = (withSetup, first) => {
      screen.setReplayEnabled(false);
      audio.playQuestion({
        withSetup,
        first,
        onQuestionOnset: () => {
          if (first && !onset) onset = { iso: nowIsoFn() };
        },
        onQuestionSoundEnd: (audioTime) => {
          if (first && !enabled) {
            enabled = { iso: nowIsoFn(), audioTime };
            screen.setAnswerable(true);
          }
        },
        onEnd: () => { if (!trial) screen.setReplayEnabled(true); },
      });
    };

    // mandatory: 回答直後の(必須の)フィードバックなら真。聞き直しなら偽。
    const playFeedback = (mandatory) => {
      const correct = trial.scoring.allCorrect;
      screen.setReplayEnabled(false);
      screen.setNextEnabled(false);
      audio.playFeedback({
        onOnset: () => {
          screen.showResult({ outcome: trial.responses[0].outcome, correctAnswerCode: target.correctAnswerCode, showNext: !correct, nextEnabled: false, replayEnabled: false });
        },
        onEnd: () => {
          if (correct) return;
          screen.setReplayEnabled(true);
          screen.setNextEnabled(true);
          if (mandatory && !mandatoryFeedbackDone) {
            mandatoryFeedbackDone = true;
            if (isLast) complete();
          }
        },
        onAutoNext: correct ? () => {
          mandatoryFeedbackDone = true;
          startQuestion(index + 1);
        } : null,
      });
    };

    function confirmTrial(code) {
      const submittedAudioTime = audioContextTimeFn();
      const { responses, scoring } = judgeResponses(question.resolvedAnswerTargets, { [target.targetId]: code });
      return {
        trialNumber: question.questionNumber,
        menuId: question.menuId,
        stimulusId: question.stimulusId,
        stimulusVersion: TRAINING_AUDIO_VERSION,
        taskTemplateId: question.taskTemplateId,
        keyCode: question.keyCode,
        questionReplayCount,
        feedbackReplayCount: 0,
        audioStartedAt: onset?.iso ?? "",
        audioEndedAt: enabled.iso,
        responseEnabledAt: enabled.iso,
        responseSubmittedAt: nowIsoFn(),
        responseTimeMs: Math.round((submittedAudioTime - enabled.audioTime) * 1000),
        responses,
        scoring,
      };
    }

    // 「続ける」: 終了の確認のために止めた再生をやり直す。
    function resume() {
      if (!loaded) return; // 読み込みが終われば、最初の再生が始まる
      if (!enabled) {
        onset = null; // 最初の再生の途中 → 調セットアップからやり直す(時刻もやり直した再生で記録する)
        playQuestion(true, true);
      }
      else if (!trial) screen.setReplayEnabled(true);
      else if (!mandatoryFeedbackDone) playFeedback(true); // 必須のフィードバックの途中 → 最初から
      else {
        screen.setReplayEnabled(true);
        screen.setNextEnabled(true);
      }
    }

    const screen = mountAnswerScreen({
      screenEl,
      optionSetRef,
      activeOptionCodes: menu.activeOptionCodes,
      progressLabel: `${question.questionNumber} / ${questions.length}`,
      onAnswer: (code) => {
        if (trial || !enabled) return;
        audio.stop();
        trial = confirmTrial(code);
        trials.push(trial);
        onTrialConfirmed(structuredClone(trial));
        playFeedback(true);
      },
      onReplay: () => {
        if (trial) {
          // 回答後: フィードバックのフレーズを聞き直す
          trial.feedbackReplayCount += 1;
          onTrialUpdated(structuredClone(trial));
          playFeedback(false);
        } else {
          questionReplayCount += 1;
          playQuestion(replayMode === "with-setup", false);
        }
      },
      onNext: () => startQuestion(index + 1),
      onQuit: () => {
        audio.stop();
        confirmingQuit = true;
        screen.showQuitConfirm({
          onConfirm: quit,
          onCancel: () => {
            confirmingQuit = false;
            resume();
          },
        });
      },
    });
    current = { audio, screen };

    audio.load().then(() => {
      if (destroyed || current?.audio !== audio) return;
      loaded = true;
      if (!confirmingQuit) playQuestion(true, true);
    }, () => {
      if (destroyed || current?.audio !== audio) return;
      showAudioError();
    });
  }

  onSessionStarted({ menuId: menu.menuId, sessionKeyCode, keyAssignmentMethod, trialsPlanned: questions.length });
  startQuestion(0);
  return {
    questions,
    sessionKeyCode,
    destroy() {
      destroyed = true;
      teardown();
    },
  };
}
