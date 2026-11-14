// フェーズ5: 相対音感の本番12問(仕様 relative-pitch-test-spec.md §14・§15)。保存はフェーズ6で接続済み。
import { renderAnswerPanel } from "../shared/answer-panel.js";
import { runQuestionTimeline } from "./question-timeline.js";
import { resumeAudioContext } from "../shared/audio-buffer-player.js";
import { toLocalIso } from "../shared/iso-time.js";
import { ANSWER_LABELS, FULL_ANSWER_LABELS } from "./answer-labels.js";
import { ANSWER_BUTTON_SEMITONES, FULL_ANSWER_BUTTON_SEMITONES, isCorrectAnswer, cadenceFilenameFor } from "./intervals.js";
import { generateTestSequence, TOTAL_QUESTIONS, generateFullTestSequence, FULL_TOTAL_QUESTIONS } from "./question-generator.js";
import { formatAccuracyLabel } from "./scoring.js";
import * as sessionStore from "./session-store.js";
import { showRelativeAudioError } from "./audio-error-screen.js";

// screenEl: 描画先のDOM要素。
// testVersion: "simplified"(既定)または"full"。出題順生成・回答ボタンの構成を切り替える(仕様6.2)。
// session: このセッションの保存対象(練習と共通のセッション)。
// persistSession: 保存を反映させるために呼ぶ関数。
// onBack: 結果画面、または音声エラーの画面から戻る際に呼ぶ。
// onShowHistory: 結果画面から履歴・CSV出力画面へ進む際に呼ぶ。
export function showMainTestFlow({
  screenEl,
  testVersion = "simplified",
  session,
  persistSession = () => {},
  onBack = () => {},
  onShowHistory = () => {},
}) {
  const isFull = testVersion === "full";
  const totalQuestions = isFull ? FULL_TOTAL_QUESTIONS : TOTAL_QUESTIONS;
  const answerLabels = isFull ? FULL_ANSWER_LABELS : ANSWER_LABELS;
  const answerButtonSemitones = isFull ? FULL_ANSWER_BUTTON_SEMITONES : ANSWER_BUTTON_SEMITONES;

  const sequence = isFull ? generateFullTestSequence() : generateTestSequence();
  sessionStore.setGeneratedQuestionOrder(session, sequence);
  persistSession();

  let correctCount = 0;

  // 本番開始時点でAudioContextを有効化する。resumeの完了(=時計が実際に動き出す)を待ってから
  // 最初の問題を始める(practice-screen.jsと同じ理由。待たないとスケジュールがずれる)。
  screenEl.innerHTML = `<div class="panel center"><h2>音声の準備</h2><p class="status">音声を準備しています…</p></div>`;
  resumeAudioContext().then(() => {
    runQuestion(0);
  });

  function runQuestion(index) {
    if (index >= sequence.length) {
      sessionStore.finalizeSession(session, "completed");
      persistSession();
      showResult();
      return;
    }
    const question = sequence[index];

    // 問題番号・総問題数は参加者に表示しない(仕様14.3)。
    screenEl.innerHTML = `
      <div class="panel">
        <h2>本番</h2>
        <p id="test-status" class="status">音を再生しています…</p>
        <div id="answer-panel-container"></div>
      </div>`;

    const timeline = runQuestionTimeline(question, {
      onStageStarted: (stage) => {
        if (stage === "cadence") {
          sessionStore.beginQuestion(session, {
            phase: "test",
            questionNumber: index + 1,
            keyCode: question.keyCode,
            keyBlockNumber: question.keyBlockNumber,
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
        document.getElementById("test-status").textContent = "聞こえた階名を選んでください。";
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
        if (outcome === "correct") correctCount += 1;
        sessionStore.finalizeQuestion(session, { responseCode: responseSemitone, responseAt, responseTimeMs, outcome });
        persistSession();
        // 正誤は表示しない。選択済みボタンの青色表示と「回答を受け付けました」だけを示す(仕様14.2)。
        document.getElementById("test-status").textContent = "回答を受け付けました。";
      },
      // 回答から1秒以上経過し、かつ目的音の再生が終わってから次の問題へ進む(仕様7.3)。
      onSettled: () => runQuestion(index + 1),
      onError: () => {
        // 音源エラー時はセッションを中断扱いにする(仕様22.1)。
        sessionStore.finalizeSession(session, "interrupted");
        persistSession();
        showRelativeAudioError({ screenEl, onBack });
      },
    });
  }

  function showResult() {
    screenEl.innerHTML = `
      <div class="panel center">
        <h2>テストが終了しました</h2>
        <p>正答率</p>
        <div class="score">${formatAccuracyLabel(correctCount, totalQuestions)}</div>
        <p>正解数</p>
        <div class="score">${correctCount} / ${totalQuestions}</div>
        <div class="actions centered">
          <button id="history" class="secondary">履歴・CSVを見る</button>
          <button id="back" class="primary">テスト選択へ戻る</button>
        </div>
      </div>`;
    document.getElementById("history").addEventListener("click", onShowHistory);
    document.getElementById("back").addEventListener("click", onBack);
  }
}
