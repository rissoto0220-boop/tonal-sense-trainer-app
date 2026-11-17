import { normalizeParticipantId, isValidParticipantId } from "./src/shared/participant-id.js";
import { createQuestionTimer } from "./src/shared/question-timer.js";
import {
  resumeAudioContext,
  loadAudioBuffer,
  scheduleAudioBuffer,
  audioContextTime,
  COLD_START_LEAD_SECONDS,
} from "./src/shared/audio-buffer-player.js";
import { createAnswerLock } from "./src/shared/answer-lock.js";
import { escapeHtml } from "./src/shared/escape-html.js";
import { noteByNumber, PRACTICE_STIMULUS_NUMBERS, ANSWERS } from "./src/absolute-pitch/notes.js";
import {
  TOTAL_QUESTIONS,
  generateTestSequence,
  pickRandomStart,
  pickRandomDirection,
  shouldForceTerminate,
} from "./src/absolute-pitch/main-test.js";
import {
  startSession,
  beginQuestion,
  finalizeQuestion,
  finalizeSession,
  persistParticipantData,
  loadParticipantData as loadAbsolutePitchParticipantData,
} from "./src/absolute-pitch/session-store.js";
import { toLocalIso } from "./src/shared/iso-time.js";
import {
  buildHistorySummary,
  buildResponseDetailRows,
  buildSessionHistoryRows,
  buildCsvFilename,
  RESPONSE_DETAIL_HEADERS,
  SESSION_HISTORY_HEADERS,
} from "./src/absolute-pitch/reports.js";
import { toCsv, downloadTextFile } from "./src/shared/csv.js";
import { formatDisplayDateTime } from "./src/shared/display-format.js";
import { showVersionSelectionScreen } from "./src/relative-pitch/version-selection-screen.js";
import { showTestSelectionScreen } from "./src/shared/test-selection-screen.js";
import { showTestIntroScreen } from "./src/shared/test-intro-screen.js";
import { TEST_INTRO_TEXT } from "./src/shared/test-intro-text.js";
import { showPracticeFlow } from "./src/relative-pitch/practice-screen.js";
import { showMainTestFlow } from "./src/relative-pitch/main-test-screen.js";
import {
  startSession as startRelativePitchSession,
  loadParticipantData as loadRelativePitchParticipantData,
  persistParticipantData as persistRelativePitchParticipantData,
} from "./src/relative-pitch/session-store.js";
import { hasCompletedSession } from "./src/relative-pitch/practice-history.js";
import { showHistoryScreen as showRelativePitchHistoryScreen } from "./src/relative-pitch/history-screen.js";
import { syncPendingSessions } from "./src/shared/session-uploader.js";
import { resolveSessionEndpoint } from "./src/shared/server-config.js";
import { runFunctionalPitchSession } from "./src/functional-pitch/functional-session.js";
import { resolveFunctionalPitchOptions } from "./src/functional-pitch/dev-flag.js";
import {
  createSessionRecorder as createFunctionalPitchRecorder,
  loadParticipantData as loadFunctionalPitchParticipantData,
} from "./src/functional-pitch/session-store.js";
import { showHistoryScreen as showFunctionalPitchHistoryScreen } from "./src/functional-pitch/history-screen.js";
import { resolveTrainingOptions } from "./src/training/dev-flag.js";
import { TRAINING_MENUS } from "./src/training/menus.js";
import { SAMPLE_MENUS } from "./src/training/sample-menus.js";
import { showTrainingMenuScreen } from "./src/training/menu-screen.js";
import { runTrainingSession } from "./src/training/training-session.js";
import {
  createSessionRecorder as createTrainingRecorder,
  loadParticipantData as loadTrainingParticipantData,
} from "./src/training/session-store.js";
import { showHistoryScreen as showTrainingHistoryScreen } from "./src/training/history-screen.js";
import { showScoreChartScreen as showTrainingScoreChartScreen } from "./src/training/score-chart-screen.js";
import { enableUnloadGuard, releaseAllUnloadGuards } from "./src/shared/unload-guard.js";
import { installErrorNotice } from "./src/shared/error-notice.js";
import { showErrorScreen } from "./src/shared/error-screen.js";

const QUESTION_MS = 3000;
const INTER_QUESTION_GAP_MS = 1000; // 問題間の間隔(仕様13.4)

let screenEl = null;
let participantId = "";
let participantData = null;
let currentSession = null;

// 確定済みでまだ送れていないセッションを、サーバーAPIへ送る(server/docs/session-create-api.md)。
// 送信の成否で画面は止めない。失敗分は次回の呼び出し時に自動で再送される。
function syncSessionsToServer() {
  const endpoint = resolveSessionEndpoint(window.location);
  if (!endpoint) return;
  syncPendingSessions({ storage: localStorage, fetchFn: (...args) => fetch(...args), endpoint })
    .catch(() => {});
}

function persistCurrentSession() {
  persistParticipantData(participantId, participantData, localStorage);
  if (currentSession?.sessionStatus) {
    releaseTestUnloadGuard(); // 結果・再生エラーで状態が確定した(以後、閉じても失うものはない)
    syncSessionsToServer();
  }
}

// 絶対音感・相対音感の、ページを閉じる前のブラウザの確認(2026-11-14 研究者の決定: 練習の開始から結果まで)。
// どちらのテストも、結果画面・エラー画面の直前に必ず状態(sessionStatus)を確定して保存するので、
// 保存の受け口で状態が確定したら解除する。訓練は startTraining の中で、機能的音感は functional-session.js で持つ。
let releaseTestGuard = () => {};

function holdTestUnloadGuard() {
  releaseTestGuard();
  releaseTestGuard = enableUnloadGuard();
}

function releaseTestUnloadGuard() {
  releaseTestGuard();
  releaseTestGuard = () => {};
}

function restartApp() {
  releaseTestUnloadGuard();
  trainingMenuTabId = null; // 参加者を変えたら、メニュー選択は最初のタブから(2026-11-15 研究者の決定)
  participantId = "";
  participantData = null;
  currentSession = null;
  showIdEntry();
}

// --- 参加者ID入力・確認(仕様7章) ---

function showIdEntry(prefill = "") {
  screenEl.innerHTML = `
    <div class="panel">
      <h2>参加者IDを入力してください</h2>
      <p>研究者から指定されたIDを入力してください(p は自動で大文字になります)。</p>
      <div class="field">
        <label for="participant-id">参加者ID</label>
        <input id="participant-id" inputmode="text" autocomplete="off" placeholder="P00001" maxlength="6" value="${escapeHtml(prefill)}">
        <p id="id-error" class="error"></p>
      </div>
      <div class="actions"><button id="continue" class="primary">確認へ進む</button></div>
    </div>`;

  const input = document.getElementById("participant-id");
  input.focus();
  input.addEventListener("input", () => { input.value = input.value.toUpperCase(); });

  const submit = () => {
    const value = normalizeParticipantId(input.value);
    input.value = value;
    if (!isValidParticipantId(value)) {
      document.getElementById("id-error").textContent = "Pに続けて5桁の数字を入力してください。例: P00001";
      return;
    }
    participantId = value;
    showIdConfirm();
  };
  document.getElementById("continue").addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
}

function showIdConfirm() {
  screenEl.innerHTML = `
    <div class="panel center">
      <h2>参加者IDを確認してください</h2>
      <p class="id-card">${escapeHtml(participantId)}</p>
      <p>このIDでよろしいですか?</p>
      <div class="actions centered">
        <button id="edit" class="secondary">修正する</button>
        <button id="accept" class="primary">このIDで進む</button>
      </div>
    </div>`;
  document.getElementById("edit").addEventListener("click", () => showIdEntry(participantId));
  document.getElementById("accept").addEventListener("click", showTestSelection);
}

// --- テスト選択 ---

// テスト選択画面に並べるテストの一覧。テストを追加するときはここに1件足す(説明の文章は src/shared/test-intro-text.js にも足す)。
// テスト選択は名前だけ。名前を押すと説明画面(showTestIntro)を出し、「始める」で onStart、「履歴・CSVを見る」で onShowHistory を呼ぶ
// (2026-11-15 研究者の決定)。
// onShowHistory: 説明画面の「履歴・CSVを見る」(2026-11-14 研究者の決定。2026-11-15 に、テスト選択から説明画面へ移した)。保存データをその場で読むだけで、
// セッションは始めない(中断の確定もしない)。履歴画面の戻り先は、開いた説明画面(ctx.backToIntro。2026-11-15)。
// onStart(ctx)・onShowHistory(ctx): ctx は { backToIntro } (showTestIntro が渡す)。
const BACK_LABEL = "戻る"; // 説明画面へ戻るボタンの文字

function availableTests() {
  // 機能的音感は未完成のため、URLに ?functional=dev があるときだけ選べる(本番では「準備中」のまま)。
  const functionalPitchOptions = resolveFunctionalPitchOptions(window.location);
  // 音感訓練も未完成のため、URLに ?training=dev があるときだけ選べる(本番では「準備中」のまま)。
  // 完成形のトップページ(訓練/テスト/設定)を作るまでの仮の置き場所として、テスト選択の一覧に並べる。
  const trainingOptions = resolveTrainingOptions(window.location);
  return [
    {
      id: "absolute-pitch",
      title: "絶対音感テスト",
      available: true,
      onStart: startAbsolutePitchTest,
      onShowHistory: (ctx) => showHistory(loadAbsolutePitchParticipantData(participantId, localStorage), { onBack: ctx.backToIntro, backLabel: BACK_LABEL }),
    },
    {
      id: "relative-pitch",
      title: "相対音感テスト",
      available: true,
      onStart: startRelativePitchTest,
      onShowHistory: (ctx) => showRelativePitchHistoryScreen({
        screenEl,
        participantId,
        participantData: loadRelativePitchParticipantData(participantId, localStorage),
        onBack: ctx.backToIntro,
        backLabel: BACK_LABEL,
      }),
    },
    {
      id: "functional-pitch",
      title: "機能的音感テスト",
      available: functionalPitchOptions.enabled,
      onStart: startFunctionalPitchTest,
      onShowHistory: (ctx) => showFunctionalPitchHistoryScreen({
        screenEl,
        participantId,
        participantData: loadFunctionalPitchParticipantData(participantId, localStorage),
        onBack: ctx.backToIntro,
        backLabel: BACK_LABEL,
      }),
    },
    {
      id: "training",
      title: "音感訓練",
      available: trainingOptions.enabled,
      onStart: showTrainingMenus,
      onShowHistory: (ctx) => showTrainingHistoryScreen({
        screenEl,
        participantId,
        participantData: loadTrainingParticipantData(participantId, localStorage),
        onBack: ctx.backToIntro,
        backLabel: BACK_LABEL,
      }),
    },
  ];
}

function showTestSelection() {
  releaseTestUnloadGuard(); // テスト選択では、確認を残さない(念のため)
  showTestSelectionScreen({
    screenEl,
    participantId,
    tests: availableTests(),
    onSelect: showTestIntro,
    onChangeParticipant: restartApp,
  });
}

// テストの説明画面。「始める」を押すまでは、セッションも音声も始めない。
function showTestIntro(test) {
  // 各テストの最初の画面・履歴画面から、この説明画面へ戻るための関数(2026-11-15 研究者の決定: ひとつ前の画面へ戻る)
  const ctx = { backToIntro: () => showTestIntro(test) };
  showTestIntroScreen({
    screenEl,
    title: test.title,
    lines: TEST_INTRO_TEXT[test.id] ?? [],
    onStart: () => test.onStart(ctx),
    onShowHistory: () => test.onShowHistory(ctx),
    onBack: showTestSelection,
  });
}

// --- 絶対音感テスト ---

// セッションは、練習の説明の「練習を開始」を押したときに作る(2026-11-15 研究者の決定。説明を読んで「戻る」だけなら、記録を残さない)。
function startAbsolutePitchTest(ctx) {
  showPracticeIntro(ctx.backToIntro);
}

// --- 相対音感テスト ---

// 簡易版/完全版の選択→練習→本番。回答レイアウトは円環状に固定(仕様11.2、2026-10-09)。
// 選んだtestVersionを最後まで引き回し、簡易版・完全版で問題セット・回答ボタンを切り替える(仕様6.2)。
// セッションは練習・本番を通じて1つを使い回す(仕様17〜19章。絶対音感と同じ考え方)。
function startRelativePitchTest(ctx) {
  showVersionSelectionScreen({
    screenEl,
    onBack: ctx.backToIntro,
    onSelect: (testVersion) => {
      // 練習の要否判定(仕様13.4)は、セッションを作る前の保存済みデータで行う
      // (これから始めるセッション自体は完了済みに含めない)。簡易版・完全版は別々に判定する。
      const existingData = loadRelativePitchParticipantData(participantId, localStorage);
      const hasCompletedBefore = hasCompletedSession(existingData.sessions, testVersion);

      let sessionResult = null;
      let relativeSession = null;
      const persistRelativeSession = () => {
        persistRelativePitchParticipantData(participantId, sessionResult.data, localStorage);
        // 完了・音声エラーによる中断でsessionStatusが確定した直後に送る(API仕様5節)。
        if (relativeSession.sessionStatus) {
          releaseTestUnloadGuard(); // 状態が確定した(結果・音声エラー)ので、ページを閉じる前の確認を解除する
          syncSessionsToServer();
        }
      };
      // セッションは、練習を始める(「練習を開始」または「練習をスキップして本番へ」を押す)ときに作る
      // (2026-11-15 研究者の決定。説明を読んで「戻る」だけなら、記録を残さない)。
      // 前回、完了しきれなかったセッションがあればここでinterruptedとして確定する(仕様17.1)。
      const beginSession = () => {
        sessionResult = startRelativePitchSession(participantId, { storage: localStorage, testVersion });
        relativeSession = sessionResult.session;
        syncSessionsToServer(); // 前回の放置セッションがここでinterruptedと確定した場合に送る
        holdTestUnloadGuard(); // セッションを始めた時点から、結果・音声エラーまで確認を出す
        return relativeSession;
      };

      showPracticeFlow({
        screenEl,
        testVersion,
        hasCompletedBefore,
        beginSession,
        persistSession: persistRelativeSession,
        onBackToVersionSelect: () => startRelativePitchTest(ctx),
        onBack: showTestSelection, // 音声エラーの画面から戻る
        onFinished: () => {
          showMainTestFlow({
            screenEl,
            testVersion,
            session: relativeSession,
            persistSession: persistRelativeSession,
            onBack: showTestSelection,
            onShowHistory: () => {
              showRelativePitchHistoryScreen({
                screenEl,
                participantId,
                participantData: sessionResult.data,
                onBack: showTestSelection,
              });
            },
          });
        },
      });
    },
  });
}

// --- 機能的音感測定(開発確認用。URLに ?functional=dev があるときだけ選べる) ---

// 測定本体は参加者IDに依存しない。結果はメモリ上で受け取るだけで、保存・送信はしない(仕様未確定)。
// 結果は参加者IDごとにブラウザ(localStorage)へ1試行ずつ保存し、履歴・CSVで出力できる。
// サーバーへの送信はしない(送信処理は functional-pitch: のキーを対象にしていない)。
function startFunctionalPitchTest(ctx) {
  const { practiceRequired, trialLimit } = resolveFunctionalPitchOptions(window.location);
  const recorder = createFunctionalPitchRecorder(participantId, { storage: localStorage });
  runFunctionalPitchSession({
    screenEl,
    practiceRequired,
    trialLimit,
    onExit: showTestSelection,
    onBackToIntro: ctx.backToIntro, // 音色の確認の「戻る」(まだセッションはないので、記録は残らない)
    onSessionStarted: recorder.onSessionStarted,
    onTrialStarted: recorder.onTrialStarted,
    onTrialConfirmed: recorder.onTrialConfirmed,
    onKeyMeasured: (result) => {
      recorder.onKeyMeasured(result);
      console.info("機能的音感の測定結果(ブラウザに保存済み・送信なし)", result);
    },
    onShowHistory: (backToKeySelect) => showFunctionalPitchHistoryScreen({
      screenEl,
      participantId,
      participantData: loadFunctionalPitchParticipantData(participantId, localStorage),
      onBack: backToKeySelect,
    }),
  });
}

// --- 音感訓練(開発確認用。URLに ?training=dev があるときだけ選べる) ---

// 結果は参加者IDごとにブラウザ(localStorage)へ、回答を確定するたびに保存し、履歴・CSVで出力できる。
// サーバーへの送信はしない(送信処理は training: のキーを対象にしていない。サーバーでの種別は未決定)。
// メニュー選択で最後に開いていたタブ。訓練から戻ったときに同じタブを開く(ページを閉じると消える。保存はしない)。
let trainingMenuTabId = null;
// メニュー選択の「戻る」の戻り先(説明画面。2026-11-15)。説明画面から入ったときに受け取り、履歴・得点推移・訓練から戻ったときも使う。
let trainingBackToIntro = null;

// ctx: 説明画面から入ったときだけ { backToIntro }。履歴・訓練から戻ってきたとき(クリックのイベントなど)は、前に受け取った戻り先のまま。
function showTrainingMenus(ctx) {
  if (typeof ctx?.backToIntro === "function") trainingBackToIntro = ctx.backToIntro;
  // 将来の問題拡張のサンプルは ?training=dev&samples=on のときだけ並べる(結果は保存しない)。
  const { samples } = resolveTrainingOptions(window.location);
  showTrainingMenuScreen({
    screenEl,
    menus: samples ? [...TRAINING_MENUS, ...SAMPLE_MENUS] : TRAINING_MENUS,
    initialTabId: trainingMenuTabId,
    onTabChange: (tabId) => { trainingMenuTabId = tabId; },
    onSelect: startTraining,
    onShowHistory: () => showTrainingHistoryScreen({
      screenEl,
      participantId,
      participantData: loadTrainingParticipantData(participantId, localStorage),
      onBack: showTrainingMenus,
    }),
    // 得点の推移は、sessions の配列だけを渡す。サーバー保存から読むことになったら、ここだけ替える。
    onShowScoreChart: () => showTrainingScoreChartScreen({
      screenEl,
      participantData: loadTrainingParticipantData(participantId, localStorage),
      onBack: showTrainingMenus,
    }),
    onBack: () => (trainingBackToIntro ?? showTestSelection)(),
  });
}

const NO_OP_TRAINING_RECORDER = {
  onSessionStarted() {}, onTrialConfirmed() {}, onTrialUpdated() {}, onFinished() {}, onInterrupted() {}, onAudioError() {},
};

// メニューのボタンを押した操作の中で、音声(AudioContext)を有効化してから始める。
async function startTraining(menu) {
  const { replayMode, questionCount } = resolveTrainingOptions(window.location);
  // 音声の起動を待つ間(最大5秒)、他のメニューを押せないよう、先に準備中の画面にする。
  screenEl.innerHTML = `<div class="panel center"><h2>音声の準備</h2><p class="status">音声を準備しています…</p></div>`;
  try {
    await resumeAudioContext();
  } catch {
    // 起動できなければ、記録はまだ作っていない(影響 not-recorded)。メニュー選択へ戻れる。
    showErrorScreen({
      screenEl,
      kind: "audio-start",
      impact: "not-recorded",
      backTo: "メニュー選択",
      onBack: showTrainingMenus,
    });
    return;
  }
  // サンプルは保存しない(複数回答の保存形式・CSVの形が未決定のため、研究データに混ぜない)。
  const recorder = menu.sample ? NO_OP_TRAINING_RECORDER : createTrainingRecorder(participantId, { storage: localStorage });
  // 訓練の最中に誤ってページを閉じないよう、ブラウザの確認を出す(終われば解除する)。
  const releaseUnloadGuard = enableUnloadGuard();
  runTrainingSession({
    screenEl,
    menu,
    replayMode,
    questionCount,
    onSessionStarted: recorder.onSessionStarted,
    onTrialConfirmed: recorder.onTrialConfirmed,
    onTrialUpdated: recorder.onTrialUpdated,
    onFinished: (trials) => {
      recorder.onFinished(trials);
      releaseUnloadGuard();
    },
    onInterrupted: (trials) => {
      recorder.onInterrupted(trials);
      releaseUnloadGuard();
    },
    onAudioError: () => {
      recorder.onAudioError();
      releaseUnloadGuard();
    },
    onExit: () => {
      releaseUnloadGuard();
      showTrainingMenus();
    },
  });
}

// --- 練習説明(仕様9章) ---

function showPracticeIntro(onBack) {
  screenEl.innerHTML = `
    <div class="panel">
      <h2>練習問題</h2>
      <p>これから3問の練習を行います。</p>
      <ul class="instructions">
        <li>音は1回だけ自動で再生されます。</li>
        <li>聞こえた音名のボタンを押してください(再生中も回答できます)。</li>
        <li>回答時間は再生開始から3.0秒です。早く回答しても次の問題は3.0秒後に始まります。</li>
        <li>正解・不正解は表示されません。</li>
      </ul>
      <p class="note">練習は原則1回のみで、やり直しはできません。</p>
      <div class="actions"><button id="practice-start" class="primary">練習を開始</button><button id="practice-back" class="secondary">戻る</button></div>
    </div>`;
  document.getElementById("practice-back").addEventListener("click", onBack);
  document.getElementById("practice-start").addEventListener("click", () => {
    // ここでセッションを作る。前回、完了しきれなかったセッションがあれば、ここでinterruptedとして確定し、
    // 新しいsession_idでこのセッションを開始する(仕様6.2・19章)。
    const result = startSession(participantId, { storage: localStorage });
    participantData = result.data;
    currentSession = result.session;
    syncSessionsToServer(); // 前回の放置セッションがここでinterruptedと確定した場合に送る
    // 参加者が最初に音声を伴う操作をするタイミングでAudioContextを有効化する
    // (ブラウザの自動再生制限への対応)。resumeの完了(=時計が実際に動き出す)を待ってから
    // 練習を始める。待たずに始めると、時計が一時停止したままの状態でスケジュールを計算してしまい、
    // 後から時計が動き出した際にスケジュールが早く(または即座に)発火してしまう
    // (相対音感の練習・本番画面で見つかったのと同じ不具合)。
    holdTestUnloadGuard(); // 練習の開始から、結果・再生エラーまで確認を出す
    screenEl.innerHTML = `<div class="panel center"><h2>音声の準備</h2><p class="status">音声を準備しています…</p></div>`;
    // 起動の失敗は、resumeAudioContext() だけを包む then の「失敗」側で扱う(成功後の処理の例外を取り違えないため)。
    resumeAudioContext().then(() => {
      runPractice();
    }, failAudioStart);
  });
}

// 音声の仕組みを始められなかったとき。まだ回答はないが、セッションは中断として保存してから(この保存で、
// ページを閉じる前の確認も外れる)、エラー画面を出す。見出し・文言はエラーの種類の表(src/shared/error-kinds.js)。
function failAudioStart() {
  finalizeSession(currentSession, "interrupted");
  persistCurrentSession();
  showErrorScreen({
    screenEl,
    kind: "audio-start",
    impact: "session-interrupted",
    backTo: "テスト選択",
    onBack: showTestSelection,
  });
}

function runPractice() {
  const notes = PRACTICE_STIMULUS_NUMBERS.map(noteByNumber);
  step(0);

  function step(index) {
    if (index >= notes.length) {
      showTestConfirm();
      return;
    }
    const note = notes[index];
    showQuestion({ mode: "practice", note, questionNumber: index + 1 }, (result) => {
      finalizeQuestion(currentSession, { ...result, incorrectTotalAfterQuestion: "" });
      persistCurrentSession();
      step(index + 1);
    });
  }
}

// --- 出題画面(仕様11〜14章。練習・本番で共通) ---
// onResult({ outcome, responseNote, responseAt, responseTimeMs }) を1問終了ごとに1回呼ぶ。
// 保存(finalizeQuestion)と次に進むかどうかの判断は呼び出し側が行う
// (本番は誤回答累計などcaller側だけが知っている情報を記録に含める必要があるため)。

function showQuestion({ mode, note, questionNumber }, onResult) {
  const title = mode === "practice" ? "練習" : "本番";
  const helpBlock = mode === "practice"
    ? `<div class="notice">
        <strong>操作方法:</strong>音は1回だけ、回答は3.0秒以内です。
      </div>`
    : "";

  screenEl.innerHTML = `
    <div class="panel">
      <h2>${title}</h2>
      ${helpBlock}
      <p id="status" class="status">音を再生しています。聞こえた音名を選んでください。</p>
      <div class="answer-grid">
        ${ANSWERS.map((a, i) => `<button class="answer" style="--i:${i}" data-answer="${a}" aria-label="${a}" disabled>${a}</button>`).join("")}
      </div>
    </div>`;

  const answerLock = createAnswerLock();
  let selectedAnswer = null;
  let responseAt = "";
  let responseTimeMs = "";
  let timer = null; // 再生開始後にセットされる
  let stimulusStartedAt = null; // AudioContext時刻(秒)。反応時間計測の起点(仕様13.1)。

  const buttons = [...document.querySelectorAll(".answer")];
  buttons.forEach((btn) => btn.addEventListener("click", () => handleAnswer(btn)));

  function handleAnswer(button) {
    if (!answerLock.tryLock()) return;
    selectedAnswer = button.dataset.answer;
    responseAt = toLocalIso();
    // 反応時間は、AudioContextの正確な時計を基準に、音源の再生予定時刻からの差で算出する
    // (仕様13.3)。onQuestionEnd発火時点の経過時間(常に約3000ms)を使ってはならない。
    responseTimeMs = stimulusStartedAt == null ? 0 : Math.round((audioContextTime() - stimulusStartedAt) * 1000);
    buttons.forEach((b) => { b.disabled = true; });
    button.classList.add("selected");
    document.getElementById("status").textContent = "回答を受け付けました。次の問題までお待ちください。";
    // 回答してもタイマーは止めない。次の問題への進行はタイマーのonQuestionEndに任せる(仕様13.2)。
  }

  loadAudioBuffer(`public/sounds/${note.filename}`)
    .then((buffer) => {
      // コールドスタート対策として、少し先の時刻を狙って再生を予約する(相対音感と同じ対応。
      // audio-buffer-player.js参照)。「進行中の問題として保存」「回答受付開始」「3.0秒タイマー
      // 開始」は、この再生予定時刻に合わせて行う(仕様13.2「回答受付は再生開始と同時に始める」)。
      const { startedAt } = scheduleAudioBuffer(buffer, audioContextTime() + COLD_START_LEAD_SECONDS);
      stimulusStartedAt = startedAt;

      setTimeout(() => {
        // 実際に再生が始まる時点を「進行中の問題」として保存する(仕様19.2・23.2)。
        beginQuestion(currentSession, {
          phase: mode,
          questionNumber,
          stimulusNumber: note.number,
          stimulusNote: note.germanNote,
          stimulusFilename: note.filename,
          correctResponse: note.answer,
        });
        persistCurrentSession();

        // 回答受付は再生開始と同時に始める(仕様13.2)。それまでボタンは無効にしておく。
        buttons.forEach((b) => { b.disabled = false; });

        timer = createQuestionTimer({
          durationMs: QUESTION_MS,
          onQuestionEnd: () => {
            const answered = answerLock.isLocked();
            const outcome = !answered ? "timeout" : (selectedAnswer === note.answer ? "correct" : "incorrect");
            // 3.0秒経過の瞬間に、回答済みかどうかによらず全ボタンを無効化する(消去はしない)。
            // この直後の短い間隔(仕様13.4)を置いてから次の問題へ進めることで、遅れたクリックが
            // 次の問題の回答として記録されるのを防ぐ。
            buttons.forEach((b) => { b.disabled = true; });
            setTimeout(() => {
              onResult({
                outcome,
                responseNote: answered ? selectedAnswer : "",
                responseAt: answered ? responseAt : "",
                responseTimeMs: answered ? responseTimeMs : "",
              });
            }, INTER_QUESTION_GAP_MS);
          },
        });
      }, COLD_START_LEAD_SECONDS * 1000);
    })
    .catch(() => {
      // 再生失敗時はこの問題を誤回答・タイムアウトとして記録せず、セッション自体をinterruptedとして確定する(仕様8.5)。
      finalizeSession(currentSession, "interrupted");
      persistCurrentSession();
      showPlaybackError(note);
    });
}

// 見出し・文言はエラーの種類の表(src/shared/error-kinds.js)。問題は誤回答・タイムアウトに数えず、
// セッションは呼び出し側が中断として保存している(「データへの影響」に書く)。
function showPlaybackError(note) {
  showErrorScreen({
    screenEl,
    kind: "audio-load",
    impact: "interrupted-uncounted",
    backTo: "テスト選択",
    details: [`音声ファイル: ${note.filename}`],
    onBack: showTestSelection,
  });
}

// --- 本番開始確認(仕様10章) ---

// 強制終了ルールの告知文(仕様10章の確定事項)。
// 将来この告知自体を削除する場合に他の文章へ影響しないよう、独立した定数にしている。
const FORCED_TERMINATION_NOTICE = "誤回答とタイムアウトが合計13件に達すると、テストは終了します。";

function showTestConfirm() {
  screenEl.innerHTML = `
    <div class="panel">
      <h2>本番開始確認</h2>
      <p>練習が終了しました。次から本番です(正解・不正解は表示されません)。</p>
      <p class="notice">${escapeHtml(FORCED_TERMINATION_NOTICE)}</p>
      <div class="actions">
        <button id="back-info" class="secondary">練習の説明を確認する</button>
        <button id="main-start" class="primary">本番を開始</button>
      </div>
    </div>`;
  document.getElementById("back-info").addEventListener("click", showPracticeRecap);
  document.getElementById("main-start").addEventListener("click", startMainTest);
}

function showPracticeRecap() {
  screenEl.innerHTML = `
    <div class="panel">
      <h2>操作方法の確認</h2>
      <ul class="instructions">
        <li>音は1回だけ自動再生されます。</li>
        <li>回答時間は再生開始から3.0秒です。</li>
        <li>音の再生中でも回答できます。</li>
        <li>正解・不正解は表示しません。</li>
      </ul>
      <p class="note">練習のやり直しはできません。</p>
      <div class="actions"><button id="back-confirm" class="primary">本番開始確認へ戻る</button></div>
    </div>`;
  document.getElementById("back-confirm").addEventListener("click", showTestConfirm);
}

// --- 本番60問(仕様11章・15章) ---

function startMainTest() {
  const startIndex = pickRandomStart();
  const direction = pickRandomDirection();
  const sequence = generateTestSequence(startIndex, direction);

  // 出題順情報を保存する(仕様11.4)。
  currentSession.sequenceStartPosition = startIndex;
  currentSession.sequenceStartNumber = sequence[0];
  currentSession.sequenceDirection = direction === 1 ? "forward" : "reverse";
  persistCurrentSession();

  let correctCount = 0;
  let totalIncorrectCount = 0;

  step(0);

  function step(index) {
    if (index >= sequence.length) {
      finish("completed");
      return;
    }
    const note = noteByNumber(sequence[index]);
    showQuestion({ mode: "test", note, questionNumber: index + 1 }, (result) => {
      if (result.outcome === "correct") correctCount += 1;
      else totalIncorrectCount += 1; // incorrect または timeout

      finalizeQuestion(currentSession, { ...result, incorrectTotalAfterQuestion: totalIncorrectCount });
      persistCurrentSession();

      // 13件到達チェックを60問完了チェックより先に行うことで、
      // 60問目で同時に13件目に達した場合は自然に「強制終了」が優先される(既存の確定事項)。
      if (shouldForceTerminate(totalIncorrectCount)) {
        finish("forced_termination");
        return;
      }
      step(index + 1);
    });
  }

  function finish(sessionStatus) {
    // session_statusは参加者には表示しない(仕様16章)が、保存データには記録する。
    finalizeSession(currentSession, sessionStatus);
    persistCurrentSession();
    showResult(correctCount);
  }
}

function showResult(correctCount) {
  screenEl.innerHTML = `
    <div class="panel center">
      <h2>テストが終了しました</h2>
      <p>正解数</p>
      <div class="score">${correctCount} / ${TOTAL_QUESTIONS}</div>
      <div class="actions centered">
        <button id="history" class="secondary">履歴・CSVを見る</button>
        <button id="to-selection" class="primary">テスト選択へ戻る</button>
      </div>
    </div>`;
  document.getElementById("history").addEventListener("click", () => showHistory());
  document.getElementById("to-selection").addEventListener("click", showTestSelection);
}

// --- 履歴・CSV出力(仕様20〜22章) ---

// data: 表示する保存データ。省略すると、テストを受けたときに読み込んだもの(結果画面から開くとき)。
// 説明画面から開くときは、その場で読んだ保存データと、戻り先(onBack)・戻るボタンの文字(backLabel)を渡す(2026-11-15)。
function showHistory(data = participantData, { onBack = showTestSelection, backLabel = "テスト選択へ戻る" } = {}) {
  let includeInterruptedInList = false;
  let includeInterruptedInCsv = false;

  function formatRow(row) {
    const scoreText = row.sessionStatus === "interrupted" ? "中断" : `${row.correctCount} / ${TOTAL_QUESTIONS}`;
    return `<li>第${row.attemptNumber}回 — ${escapeHtml(formatDisplayDateTime(row.startedAt))} — ${scoreText}</li>`;
  }

  function render() {
    const summary = buildHistorySummary(data.sessions, includeInterruptedInList);
    const listHtml = summary.length
      ? `<ul class="history-list">${summary.map(formatRow).join("")}</ul>`
      : `<p class="note">まだ記録がありません。</p>`;

    screenEl.innerHTML = `
      <div class="panel">
        <h2>履歴・CSV出力</h2>
        <label class="checkbox"><input type="checkbox" id="toggle-list-interrupted"${includeInterruptedInList ? " checked" : ""}> 中断した履歴を表示</label>
        ${listHtml}
        <div class="notice">回答詳細CSVとテスト履歴CSVの両方を保存してください。</div>
        <label class="checkbox"><input type="checkbox" id="toggle-csv-interrupted"${includeInterruptedInCsv ? " checked" : ""}> 中断した履歴を含める</label>
        <div class="actions">
          <button id="download-responses" class="secondary">回答詳細CSVをダウンロード</button>
          <button id="download-sessions" class="secondary">テスト履歴CSVをダウンロード</button>
        </div>
        <div class="actions"><button id="to-selection" class="primary">${escapeHtml(backLabel)}</button></div>
      </div>`;

    document.getElementById("toggle-list-interrupted").addEventListener("change", (e) => {
      includeInterruptedInList = e.target.checked;
      render();
    });
    document.getElementById("toggle-csv-interrupted").addEventListener("change", (e) => {
      includeInterruptedInCsv = e.target.checked;
    });
    document.getElementById("download-responses").addEventListener("click", () => {
      const rows = buildResponseDetailRows(participantId, data.sessions, includeInterruptedInCsv);
      downloadTextFile(buildCsvFilename(participantId, "responses"), toCsv(RESPONSE_DETAIL_HEADERS, rows));
    });
    document.getElementById("download-sessions").addEventListener("click", () => {
      const rows = buildSessionHistoryRows(participantId, data.sessions, includeInterruptedInCsv);
      downloadTextFile(buildCsvFilename(participantId, "sessions"), toCsv(SESSION_HISTORY_HEADERS, rows));
    });
    document.getElementById("to-selection").addEventListener("click", onBack);
  }

  render();
}

function mount() {
  screenEl = document.getElementById("screen");
  // 想定外の例外は、画面の上の帯で知らせる。「最初からやり直す」は、確認を出さずに再読み込みする
  // (参加者ID・保存済みの記録はブラウザに残る。途中のセッションは、保存前なら失われる)。
  installErrorNotice({
    anchorEl: screenEl,
    onRestart: () => {
      releaseAllUnloadGuards();
      window.location.reload();
    },
  });
  showIdEntry();
  syncSessionsToServer(); // 前回送れなかった分(オフライン・サーバー障害など)を再送する
}

if (typeof document !== "undefined") {
  mount();
}
