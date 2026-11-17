// フェーズ4: 相対音感の練習(仕様 relative-pitch-test-spec.md §13)。保存はフェーズ6で接続済み。
import { renderAnswerPanel } from "../shared/answer-panel.js";
import { runQuestionTimeline } from "./question-timeline.js";
import { resumeAudioContext } from "../shared/audio-buffer-player.js";
import { toLocalIso } from "../shared/iso-time.js";
import { ANSWER_LABELS, FULL_ANSWER_LABELS } from "./answer-labels.js";
import {
  PRACTICE_QUESTIONS,
  ANSWER_BUTTON_SEMITONES,
  FULL_ANSWER_BUTTON_SEMITONES,
  isCorrectAnswer,
  cadenceFilenameFor,
} from "./intervals.js";
import * as sessionStore from "./session-store.js";
import { showRelativeAudioError } from "./audio-error-screen.js";

// screenEl: 描画先のDOM要素。
// testVersion: "simplified"(既定)または"full"。回答ボタンの構成を切り替える(仕様6.2)。
//   練習問題自体は簡易版・完全版で共通(PRACTICE_QUESTIONS、2026-09-18更新)。
// hasCompletedBefore: 完了済みの相対音感履歴があるか(同じtestVersionでの判定、仕様13.4)。
// beginSession: セッションを作って返す関数(app.js が渡す)。「練習を開始」「練習をスキップして本番へ」を押したときに1回だけ呼ぶ
//   (2026-11-15 研究者の決定: 説明を読んで「戻る」だけなら、記録を残さない)。返ったものを、以後の保存対象(session)にする。
// persistSession: 保存を反映させるために呼ぶ関数(呼び出し元がlocalStorageへの書き込みを担う)。
// onFinished: 練習が終わった時点(全問終えた、またはスキップした)で呼ぶ。
// onBack: 音声エラーの画面で「テスト選択へ戻る」を押したときに呼ぶ。
// onBackToVersionSelect: 「練習について」(完了済み)・「練習の説明」(初回)の「戻る」で、種類の選択へ戻るときに呼ぶ。
export function showPracticeFlow({
  screenEl,
  testVersion = "simplified",
  hasCompletedBefore = false,
  beginSession,
  persistSession = () => {},
  onFinished = () => {},
  onBack = () => {},
  onBackToVersionSelect = () => {},
}) {
  let session = null; // beginSession() が返したもの。練習を始めるまでは null
  const practiceQuestions = PRACTICE_QUESTIONS;
  const answerLabels = testVersion === "full" ? FULL_ANSWER_LABELS : ANSWER_LABELS;
  const answerButtonSemitones = testVersion === "full" ? FULL_ANSWER_BUTTON_SEMITONES : ANSWER_BUTTON_SEMITONES;

  if (hasCompletedBefore) {
    showSkipChoice();
  } else {
    showIntro();
  }

  function showSkipChoice() {
    screenEl.innerHTML = `
      <div class="panel">
        <h2>練習について</h2>
        <p>このテストは完了済みです。練習するか、スキップして本番へ進むか選べます。</p>
        <div class="actions">
          <button id="do-practice" class="primary">練習してから開始</button>
          <button id="skip-practice" class="secondary">練習をスキップして本番へ</button>
          <button id="choice-back" class="secondary">戻る</button>
        </div>
      </div>`;
    document.getElementById("choice-back").addEventListener("click", onBackToVersionSelect);
    document.getElementById("do-practice").addEventListener("click", showIntro);
    document.getElementById("skip-practice").addEventListener("click", () => {
      session = beginSession();
      sessionStore.setPracticeStatus(session, "skipped");
      persistSession();
      onFinished("skipped");
    });
  }

  function showIntro() {
    screenEl.innerHTML = `
      <div class="panel">
        <h2>練習問題</h2>
        <p>これから${practiceQuestions.length}問の練習を行います。</p>
        <ul class="instructions">
          <li>カデンツ・基準音・目的音の順に自動再生されます。</li>
          <li>目的音が鳴ったら、その階名を選んでください。</li>
          <li>時間制限はありません(回答すると次へ進みます)。</li>
          <li>練習では正解・不正解が表示されます(本番では表示されません)。</li>
        </ul>
        <p class="note">この練習は原則1回のみです。</p>
        <div class="actions"><button id="practice-start" class="primary">練習を開始</button><button id="intro-back" class="secondary">戻る</button></div>
      </div>`;
    // 「戻る」: 完了済みなら「練習について」へ、初回なら種類の選択へ(セッションはまだ作っていない)
    document.getElementById("intro-back").addEventListener("click", hasCompletedBefore ? showSkipChoice : onBackToVersionSelect);
    document.getElementById("practice-start").addEventListener("click", () => {
      session = beginSession();
      // 参加者が最初に音声を伴う操作をするタイミングでAudioContextを有効化する。
      // resumeの完了(=AudioContextの時計が実際に動き出す)を待ってから最初の問題を始める。
      // 待たずに始めると、時計が一時停止したままの状態でスケジュールを計算してしまい、
      // 後から時計が動き出した際にスケジュールが早く(または即座に)発火してしまう。
      screenEl.innerHTML = `<div class="panel center"><h2>音声の準備</h2><p class="status">音声を準備しています…</p></div>`;
      // 起動の失敗は、resumeAudioContext() だけを包む then の「失敗」側で扱う(成功後の処理の例外を取り違えないため)。
      resumeAudioContext().then(() => {
        runQuestion(0);
      }, () => {
        // 起動できなければ、まだ回答はないが、セッションは中断として保存してから、エラー画面を出す(絶対音感と同じ)。
        sessionStore.finalizeSession(session, "interrupted");
        persistSession();
        showRelativeAudioError({ screenEl, kind: "audio-start", impact: "session-interrupted", onBack });
      });
    });
  }

  function runQuestion(index) {
    if (index >= practiceQuestions.length) {
      sessionStore.setPracticeStatus(session, "completed");
      persistSession();
      onFinished("completed");
      return;
    }
    const question = practiceQuestions[index];
    const questionNumber = index + 1;

    screenEl.innerHTML = `
      <div class="panel">
        <h2>練習</h2>
        <p id="practice-status" class="status">音を再生しています…</p>
        <div id="answer-panel-container"></div>
      </div>`;

    const timeline = runQuestionTimeline(question, {
      onStageStarted: (stage) => {
        if (stage === "cadence") {
          sessionStore.beginQuestion(session, {
            phase: "practice",
            questionNumber,
            keyCode: question.keyCode,
            keyBlockNumber: "",
            cadenceFilename: cadenceFilenameFor(question.keyCode),
            referenceNote: question.referenceNote,
            targetNote: question.targetNote,
            intervalSemitones: question.intervalSemitones,
            syllableCode: question.syllableCode,
            displayLabel: question.displayLabel,
            intervalLabel: question.intervalLabel,
            scaleLabel: question.scaleLabel,
          });
        } else {
          sessionStore.recordStageStarted(session, stage);
        }
        persistSession();
      },
      onAnswerable: () => {
        document.getElementById("practice-status").textContent = "聞こえた階名を選んでください。";
        renderAnswerPanel({
          container: document.getElementById("answer-panel-container"),
          labels: answerLabels,
          onSelect: (label, labelIndex) => {
            // 正解判定・保存には表示ラベルではなく半音差(内部コード相当)を使う(仕様10.2)。
            timeline.submitAnswer(answerButtonSemitones[labelIndex]);
          },
        });
      },
      onResult: ({ responseCode: responseSemitone, responseTimeMs }) => {
        const responseAt = toLocalIso();
        const outcome = isCorrectAnswer(question, responseSemitone) ? "correct" : "incorrect";
        sessionStore.finalizeQuestion(session, { responseCode: responseSemitone, responseAt, responseTimeMs, outcome });
        persistSession();
        showFeedback(questionNumber, outcome);
      },
      onError: () => {
        // 音源エラー時はセッションを中断扱いにする(仕様22.1)。
        sessionStore.finalizeSession(session, "interrupted");
        persistSession();
        showRelativeAudioError({ screenEl, onBack });
      },
    });
  }

  function showFeedback(questionNumber, outcome) {
    const question = practiceQuestions[questionNumber - 1];
    const isLast = questionNumber >= practiceQuestions.length;

    screenEl.innerHTML = `
      <div class="panel center">
        <h2>${outcome === "correct" ? "正解です" : "不正解です"}</h2>
        ${outcome === "correct" ? "" : `<p>正解は「${question.displayLabel}」です</p>`}
        <div class="actions centered">
          <button id="next" class="primary">${isLast ? "練習を終了" : "次へ"}</button>
        </div>
      </div>`;
    document.getElementById("next").addEventListener("click", () => runQuestion(questionNumber));
  }
}
