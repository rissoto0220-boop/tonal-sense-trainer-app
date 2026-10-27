// 音感訓練の1メニュー(既定15問)の進行。回答画面(answer-screen.js)と音声(question-audio.js)をつなぐ。
// 保存・送信はしない。結果はメモリ上で onFinished に渡すだけ。
//
// 1問の流れ(研究者の決定):
//   回答画面を表示(まだ押せない)→ 調セットアップ → 1秒 → 出題音
//   → 出題音が鳴り始めたら回答できる(相対音感の「目的音の再生開始で回答可能」に合わせた暫定)
//   → 回答(または「わからない」)→ 鳴っている音を止めて判定
//   → フィードバックのフレーズの音が鳴り始めるのと同時に、正誤の文言を表示
//   → 正解: フレーズが終わって0.5秒後に自動で次へ / 不正解: 何度でも聞き直せ、「次に進む」で次へ
// リプレイ(回答前): replayMode = "question-only"(出題音だけ)/ "with-setup"(調セットアップから)。
//   試験的に両方を用意している(研究者の決定。最終的に統一する可能性あり)。
import { escapeHtml } from "../shared/escape-html.js";
import { audioContextTime } from "../shared/audio-buffer-player.js";
import { toLocalIso } from "../shared/iso-time.js";
import { TASK_TEMPLATES } from "./definitions.js";
import { buildQuestions } from "./question-pool.js";
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
// onFinished(results): 全問が終わったときに1回呼ぶ。onExit(): 終了画面の「メニュー選択へ戻る」。
// 戻り値の destroy(): 画面を離れるときに呼ぶ。音・タイマーを止め、以後の操作を無視する。
export function runTrainingSession({
  screenEl,
  menu,
  questionCount,
  replayMode = "question-only",
  randomFn = Math.random,
  onFinished = () => {},
  onExit = () => {},
  audioOptions = {},
  audioContextTimeFn = audioContextTime,
  nowIsoFn = toLocalIso,
  createQuestionAudioFn = createQuestionAudio,
}) {
  if (!REPLAY_MODES.includes(replayMode)) throw new Error(`未対応のリプレイの方式です: ${replayMode}`);
  const questions = buildQuestions(menu, { randomFn, ...(questionCount ? { questionCount } : {}) });
  const optionSetRef = TASK_TEMPLATES[menu.taskTemplateRef].answerTargets[0].optionSetRef;
  const results = [];
  let current = null; // { audio, screen }
  let destroyed = false;

  function teardown() {
    current?.audio.destroy();
    current?.screen.destroy();
    current = null;
  }

  function showAudioError() {
    teardown();
    screenEl.innerHTML = `<div class="panel center"><p class="error" role="alert">${escapeHtml(SESSION_TEXT.audioError)}</p></div>`;
  }

  function finish() {
    teardown();
    const correctCount = results.filter((result) => result.scoring.allCorrect).length;
    screenEl.innerHTML = buildFinishedHtml(correctCount, results.length);
    screenEl.querySelector("h2")?.focus();
    screenEl.querySelector('[data-role="exit"]')?.addEventListener("click", () => { if (!destroyed) onExit(); });
    onFinished(results.map((result) => ({ ...result })));
  }

  function startQuestion(index) {
    if (destroyed) return;
    if (index >= questions.length) {
      finish();
      return;
    }
    teardown();
    const question = questions[index];
    const target = question.resolvedAnswerTargets[0];
    const audio = createQuestionAudioFn(question, audioOptions);
    let presented = null; // { audioTime, iso }(出題音の最初の再生開始)
    let answered = false;

    const playQuestion = (withSetup, first) => {
      screen.setReplayEnabled(false);
      audio.playQuestion({
        withSetup,
        first,
        onQuestionOnset: (audioTime) => {
          if (!presented) {
            presented = { audioTime, iso: nowIsoFn() };
            screen.setAnswerable(true);
          }
        },
        onEnd: () => { if (!answered) screen.setReplayEnabled(true); },
      });
    };

    const playFeedback = (result) => {
      screen.setReplayEnabled(false);
      const correct = result.scoring.allCorrect;
      audio.playFeedback({
        onOnset: () => {
          screen.showResult({ outcome: result.responses[0].outcome, correctAnswerCode: target.correctAnswerCode, showNext: !correct, replayEnabled: false });
        },
        onEnd: () => { if (!correct) screen.setReplayEnabled(true); },
        onAutoNext: correct ? () => startQuestion(index + 1) : null,
      });
    };

    let lastResult = null;
    const screen = mountAnswerScreen({
      screenEl,
      optionSetRef,
      activeOptionCodes: menu.activeOptionCodes,
      progressLabel: `${question.questionNumber} / ${questions.length}`,
      onAnswer: (code) => {
        if (answered || !presented) return;
        answered = true;
        const respondedAudioTime = audioContextTimeFn();
        audio.stop();
        const { responses, scoring } = judgeResponses(question.resolvedAnswerTargets, { [target.targetId]: code });
        lastResult = {
          trialId: `${question.questionId}-trial`,
          questionId: question.questionId,
          menuId: question.menuId,
          stimulusId: question.stimulusId,
          keyCode: question.keyCode,
          taskTemplateId: question.taskTemplateId,
          timing: {
            presentedAt: presented.iso,
            respondedAt: nowIsoFn(),
            responseTimeMs: Math.round((respondedAudioTime - presented.audioTime) * 1000),
          },
          responses,
          scoring,
        };
        results.push(lastResult);
        playFeedback(lastResult);
      },
      onReplay: () => {
        if (answered) playFeedback(lastResult); // 回答後: フィードバックのフレーズを聞き直す
        else playQuestion(replayMode === "with-setup", false);
      },
      onNext: () => startQuestion(index + 1),
    });
    current = { audio, screen };

    audio.load().then(() => {
      if (destroyed || current?.audio !== audio) return;
      playQuestion(true, true);
    }, () => {
      if (destroyed || current?.audio !== audio) return;
      showAudioError();
    });
  }

  startQuestion(0);
  return {
    questions,
    destroy() {
      destroyed = true;
      teardown();
    },
  };
}
