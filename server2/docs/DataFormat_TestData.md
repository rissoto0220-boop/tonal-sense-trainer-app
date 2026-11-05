# 利用データ（テスト結果）のデータフォーマット

- 対象：クライアントアプリがサーバへ送る、テスト・訓練 1 セッション分のデータ。
- この文書は**データの形**のみを定める。テーブル設計（TableSpec_TestData.md）と API の詳細（エンドポイントごとのエラー・回数制限など）は、この文書の承認後に別に定める。
- 出典：`server/docs/session-create-api.md`（絶対音感・相対音感）、`src/functional-pitch/session-store.js`・`src/training/session-store.js`（調性感・訓練）、添付の CSV（訓練・調性感）。

## 1. 前提

| # | 前提 |
|---|---|
| 1 | `server2` は、CSV ファイルを作らず、データベースに直接保存する。参照もデータベースから行う。 |
| 2 | CSV・ZIP は、ダウンロード要求があったときだけ、データベースから作る（行を順に出力し、全体をメモリに持たない）。 |
| 3 | `participantId`（`P00001` 形式）は使わない。利用者の識別は `user_id`（UUID）のみとする。 |
| 4 | `server/data/` の既存の CSV は、データベースに取り込まない。 |
| 5 | 利用データは、`users`・`families` への外部キーを持たず、ユーザ名・メールアドレスなどを含まない（TableSpec_Account.md 5.2）。 |
| 6 | 端末内（localStorage）の記録を新しい仕組みへ移す方法は、クライアント側の作業とする。サーバは、移行のための特別な API を持たない（下の 2.3 の再送の規則で足りる）。 |

## 2. 送信の方法

### 2.1 エンドポイント

```
POST /api/v1/users/{userId}/test-sessions
```

- `userId` で利用者を指定する。**本文には、`participantId` も `userId` も含めない。**
- 認証・認可：家族の Cookie（`sid`）で認証し、`userId` がログイン中の家族に属することを、リクエストのたびに確認する（ApiSpec_Auth.md 3.2）。属していなければ `404 NOT_FOUND`。
- 1 リクエスト = 1 セッション。
- 本文は JSON。テスト種別ごとの形は 4. 以降。

### 2.2 送信するタイミング

- セッションの終了（`sessionStatus` と `endedAt` の確定）の後に、1 回送る。
- 前回、終了しないまま残ったセッションを、次回の開始時に `interrupted` と確定した場合も、確定の直後に送る。
- 進行中のデータ（`currentQuestion`、`currentTrial`）は含めない。送られても無視する。

### 2.3 再送

- `sessionId`（クライアントが作る UUID）が、重複判定の唯一のキーになる。
- 同じ `sessionId` が同じ `userId` で保存済みなら、`200 OK`（何もしない）。初めてなら `201 Created`。
- 同じ `sessionId` が別の `userId` で保存済みなら、`409 CONFLICT`。
- 通信エラー・5xx は、クライアントが再送する。
- 端末内の古い記録を新しい仕組みへ移すときも、同じ API を、`userId` を指定して使う。

### 2.4 サーバが決める値（クライアントからは送らない）

`user_id`（パスから）、受信日時。

`attemptNumber`（同じメニュー・同じキーを始めた回数）は、**クライアントが数えて送る**。サーバは数え直さない。

## 3. 全種類に共通する項目

| 項目 | 型 | 必須 | 説明 |
|---|---|---|---|
| `sessionId` | 文字列（UUID、36 文字） | ○ | セッションの識別子。訓練も、この名前にそろえる（現在の `trainingSessionId` から変更）。 |
| `testType` | 文字列 | ○ | `absolute_pitch` / `relative_pitch` / `functional_pitch` / `training` |
| `startedAt` | 文字列 | ○ | `yyyy-MM-ddTHH:mm:ss` で始まる ISO 8601。タイムゾーンは変換せず、そのまま保存する。 |
| `endedAt` | 文字列 | ○ | 同上。空文字は不可。 |
| `sessionStatus` | 文字列 | ○ | 下の表。種類ごとに使える値が違う。 |
| `responses` | 配列 | ○ | 回答（試行）の配列。空配列も可。訓練のみ名前が `trials`。 |

調性感・訓練は、`endedAt` を新しく必須にする（現在、調性感の CSV には、終了日時がない）。

### sessionStatus の値

| 値 | 意味 | 絶対音感 | 相対音感 | 調性感 | 訓練 |
|---|---|---|---|---|---|
| `completed` | 最後まで完了した | ○ | ○ | ○ | ○ |
| `forced_termination` | 誤答・時間切れが上限に達して終了した | ○ | | | |
| `interrupted` | 途中で終わった（ページを閉じた、終了を選んだ、など） | ○ | ○ | ○ | ○ |
| `audio_error` | 音声の読み込み・再生に失敗して終わった | | | ○ | ○ |

- `audio_error` と `interrupted` は、保存はするが、集計の既定では「中断」の扱いにする（クライアントの現在の扱いと同じ）。

### 日時の形

- すべて文字列。例：`2026-10-29T08:54:03.875+09:00`。
- 空欄は空文字 `""`（`null` ではない）。ただし、この文書で `null` 可と書いた項目は `null`。

## 4. 絶対音感（`testType = absolute_pitch`）

`server/docs/session-create-api.md` 2.1 と同じ。変更点は、`participantId` を使わないことのみ。

セッション直下：`sessionId`、`testType`、`startedAt`、`endedAt`、`sessionStatus`、`responses`、および任意の `sequenceStartPosition`、`sequenceStartNumber`、`sequenceDirection`。

`responses[]`：

| 項目 | 必須 | 説明 |
|---|---|---|
| `phase` | ○ | `practice` / `test` |
| `questionNumber` | ○ | 問題番号 |
| `stimulusNumber` | ○ | 音の番号 |
| `stimulusNote` | ○ | 音名（例 `D2`） |
| `stimulusFilename` | ○ | 音源のファイル名 |
| `stimulusStartedAt` | ○ | 再生開始の日時 |
| `correctResponse` | ○ | 正解の音名 |
| `responseNote` | 任意 | 回答の音名。未回答は空文字 |
| `responseAt` | 任意 | 回答の日時 |
| `responseTimeMs` | 任意 | 回答までの時間（ミリ秒） |
| `outcome` | ○ | `correct` / `incorrect` / `timeout` / `interrupted` |
| `incorrectTotalAfterQuestion` | 任意 | その問題までの誤答・時間切れの累計。`practice` は空文字 |

## 5. 相対音感（`testType = relative_pitch`）

`server/docs/session-create-api.md` 2.2 と同じ。

セッション直下に、共通の項目に加えて次を持つ。

| 項目 | 必須 | 説明 |
|---|---|---|
| `testVersion` | ○ | `simplified` / `full` |
| `answerLayout` | ○ | 英小文字と `_` のみ、32 文字以内。空文字可 |
| `practiceStatus` | ○ | `completed` / `skipped` / `interrupted` / `null` |
| `generatedQuestionOrder` | ○ | 本番の出題順（半音差）の配列。件数が、本番の総問題数（正答率の分母）になる。本番の前に中断した場合は `[]` |

`responses[]`：`phase`、`questionNumber`、`keyCode`、`cadenceFilename`、`referenceNote`、`targetNote`、`intervalSemitones`、`syllableCode`、`displayLabel`、`outcome`（`correct` / `incorrect` / `interrupted`）が必須。`keyBlockNumber`、`intervalLabel`、`scaleLabel`、`cadenceStartedAt`、`referenceStartedAt`、`targetStartedAt`、`responseCode`、`responseAt`、`responseTimeMs` は任意（`intervalLabel`・`scaleLabel` は `null` 可）。

## 6. 調性感（`testType = functional_pitch`）

端末内に保存しているセッションの形に、次の変更を加える。

- 追加：`attemptNumber`（そのキーを始めた回数。クライアントが数える。現在は、履歴の表示のたびに数え直していて、セッションには保存していない）。

セッション直下：

| 項目 | 必須 | 説明 |
|---|---|---|
| `measurementKeyCode` | ○ | 測定したキー（例 `Fis`） |
| `attemptNumber` | ○ | 同じキーの何回目か（1 から） |
| `totalTrialCount` | ○ | 計画した試行数（90） |
| `generatedTrialOrder` | ○ | 出題順の配列。要素：`trialNumber`、`firstStimulusId`、`secondStimulusId`、`changeCondition` |
| `practiceResults` | 任意 | 練習の結果の配列。形はクライアントのままで、サーバは検証せず、そのまま保存する |

`responses[]`（1 要素 = 1 試行）：

| 項目 | 必須 | 説明 |
|---|---|---|
| `trialNumber` | ○ | 試行番号 |
| `firstStimulusId`、`secondStimulusId` | ○ | 提示した 2 つの音源 |
| `changeCondition` | ○ | `melody-change` / `harmony-change` / `both-change` など |
| `trialStartedAt` | 任意 | 試行の開始日時 |
| `melodyChangeRating`、`harmonyChangeRating`、`overallChangeRating` | 任意 | 評定。未回答は空文字 |
| `responseEnabledAt`、`responseConfirmedAt` | 任意 | 回答を受け付けた日時・確定した日時 |
| `responseTimeMs` | 任意 | 回答までの時間 |
| `outcome` | ○ | `answered` / `interrupted` |

## 7. 訓練（`testType = training`）

端末内に保存しているセッションの形に、次の変更を加える。

- 名前の変更：`trainingSessionId` → `sessionId`。
- 追加：`testType`（`training`）。
- 試行の配列の名前は、現在のまま `trials`。各試行から `trainingSessionId` は除く。

セッション直下：

| 項目 | 必須 | 説明 |
|---|---|---|
| `menuId` | ○ | メニュー（例 `menu-06`） |
| `attemptNumber` | ○ | 同じメニューを始めた回数（中断・音声エラーも数える。クライアントが数える） |
| `sessionKeyCode` | ○ | セッションのキー |
| `keyAssignmentMethod` | ○ | `fixed` など |
| `trialsPlanned` | ○ | 計画した試行数 |
| `trialsCompleted`、`correctCount`、`giveupCount` | 任意 | 件数。サーバは、`trials` から数え直した値を使い、送られた値は照合のみ |
| `trials` | ○ | 試行の配列 |

`trials[]`（1 要素 = 1 試行）：

| 項目 | 必須 | 説明 |
|---|---|---|
| `trialNumber` | ○ | 試行番号 |
| `stimulusId`、`stimulusVersion`、`taskTemplateId`、`keyCode` | ○ | 問題の識別 |
| `questionReplayCount`、`feedbackReplayCount` | ○ | 問題・フィードバックを聞き直した回数 |
| `audioStartedAt`、`audioEndedAt` | 任意 | 音声の開始・終了の日時 |
| `responseEnabledAt`、`responseSubmittedAt` | 任意 | 回答を受け付けた日時・確定した日時 |
| `responseTimeMs` | 任意 | 回答までの時間 |
| `responses` | ○ | 回答対象ごとの回答の配列。要素：`targetId`、`correctAnswerCode`、`responseCode`（「わからない」は `null`）、`outcome`（`correct` / `incorrect` / `giveup`） |
| `scoring` | ○ | `targetCount`、`correctTargetCount`、`accuracy`、`allCorrect`。サーバは `responses` から数え直し、送られた値は照合のみ |

- 現在の回答対象は 1 つ。CSV は、`responses[0]` を平らにして出す。回答対象が増えても保存できるよう、配列のまま受け取る。

## 8. ダウンロード（CSV・ZIP）の形

### 8.1 共通の規則

- CSV・ZIP は、ダウンロード要求のたびに、データベースから作る（サーバにファイルを保存しない）。
- 文字コードは **BOM 付きの UTF-8**（先頭に `EF BB BF`）。改行は CRLF、区切りは `,`。`"`・`,`・改行を含む値は `"` で囲み、`"` は `""` にする。空欄は空文字。
- 列名は `snake_case`。列は、現在のクライアントの CSV にそろえる（研究者の分析を変えずに済むようにするため）。
- 1 つの CSV には、1 人のユーザ（`user_id`）のデータのみを入れる。ユーザごとにファイルを分ける。**この方針は、今後変わる可能性がある**（研究者向けに、複数のユーザを 1 つのファイルにまとめる形など）。ファイルの分け方は、CSV を作る処理の 1 か所に閉じ込め、列の定義とは切り離す。
- 範囲の指定：ユーザ・テスト種別・期間（開始日時）のいずれかで絞る。範囲の上限は、API の仕様で定める。
- 各テスト種別につき、2 種類の CSV を出す。
  - 回答詳細 CSV（`responses`）：1 行 = 1 試行（回答）。
  - 履歴 CSV（`sessions`）：1 行 = 1 セッション。

### 8.2 ZIP とファイル名（案）

```
<テスト種別>/
  responses_<user_id>.csv
  sessions_<user_id>.csv
```

- テスト種別のフォルダ名：`absolute_pitch`、`relative_pitch`、`functional_pitch`、`training`。
- ダウンロードする ZIP の名前の例：`uec-tst_training_20261105_153000.zip`。
- 1 種類・1 ユーザだけを指定した場合は、ZIP にせず、CSV を直接返してもよい（API の仕様で定める）。

### 8.3 訓練（`training`）

#### 回答詳細 CSV（`responses_<user_id>.csv`）

```csv
user_id,session_id,test_type,menu_id,attempt_number,session_status,session_started_at,session_ended_at,session_key_code,key_assignment_method,trial_number,stimulus_id,stimulus_version,task_template_id,key_code,target_id,correct_answer_code,response_code,outcome,question_replay_count,feedback_replay_count,audio_started_at,audio_ended_at,response_enabled_at,response_submitted_at,response_time_ms
0192f3a0-7c1e-7b52-9d4e-3a5b6c7d8e9f,77656c60-150c-41f4-8dd6-46524223f7d9,training,menu-06,1,completed,2026-10-29T08:54:00.000+09:00,2026-10-29T08:57:10.000+09:00,C,fixed,8,st-n6-ch-n4-maj,01,tt-chord-first,C,t1,n4,n5,incorrect,0,1,2026-10-29T08:55:27.952+09:00,2026-10-29T08:55:29.952+09:00,2026-10-29T08:55:29.952+09:00,2026-10-29T08:55:31.416+09:00,1462
0192f3a0-7c1e-7b52-9d4e-3a5b6c7d8e9f,77656c60-150c-41f4-8dd6-46524223f7d9,training,menu-06,1,completed,2026-10-29T08:54:00.000+09:00,2026-10-29T08:57:10.000+09:00,C,fixed,9,st-n7-ch-n5-dom7,01,tt-chord-first,C,t1,n5,,giveup,0,1,2026-10-29T08:55:47.261+09:00,2026-10-29T08:55:49.252+09:00,2026-10-29T08:55:49.252+09:00,2026-10-29T08:55:51.749+09:00,2495
```

- 1 行 = 1 試行の 1 回答対象。**回答対象が複数の試行は、回答対象の数だけ行を出す**（試行の列は同じ値を繰り返す）。現在は回答対象が 1 つなので、1 試行 = 1 行になる。
- 「わからない」は、`response_code` が空欄、`outcome` が `giveup`。
- `target_id` の値（上の `t1`）は例。

#### 履歴 CSV（`sessions_<user_id>.csv`）

```csv
user_id,session_id,test_type,menu_id,attempt_number,session_status,session_key_code,key_assignment_method,started_at,ended_at,trials_planned,trials_completed,correct_count,giveup_count
0192f3a0-7c1e-7b52-9d4e-3a5b6c7d8e9f,77656c60-150c-41f4-8dd6-46524223f7d9,training,menu-06,1,completed,C,fixed,2026-10-29T08:54:00.000+09:00,2026-10-29T08:57:10.000+09:00,15,15,13,1
```

- `trials_completed`・`correct_count`・`giveup_count` は、データベースの `trials` から数え直した値。

### 8.4 他のテスト種別

列の並びは、現在の列と同じ。違いは 8.5 に示す。

| 種類 | 回答詳細 CSV の列 | 履歴 CSV の列 |
|---|---|---|
| 絶対音感 | `user_id, session_id, test_type, phase, session_status, session_started_at, session_ended_at, question_number, stimulus_number, stimulus_note, stimulus_filename, stimulus_started_at, correct_response, response_note, response_at, response_time_ms, outcome, incorrect_total_after_question, sequence_start_position, sequence_start_number, sequence_direction` | `user_id, session_id, test_type, started_at, ended_at, session_status, practice_questions_presented, practice_timeout_count, questions_presented, correct_count, incorrect_answer_count, timeout_count, total_incorrect_count, unpresented_count, sequence_start_position, sequence_start_number, sequence_direction, interrupted_phase, interrupted_question_number` |
| 相対音感 | `user_id, session_id, test_type, test_version, phase, session_status, answer_layout, session_started_at, session_ended_at, practice_status, total_questions, question_number, key_block_number, key_code, cadence_filename, reference_note, target_note, interval_semitones, syllable_code, display_label, interval_label, scale_label, cadence_started_at, reference_started_at, target_started_at, response_code, response_at, response_time_ms, outcome` | `user_id, session_id, test_type, test_version, started_at, ended_at, session_status, answer_layout, practice_status, practice_questions_presented, questions_presented, questions_answered, correct_count, incorrect_count, accuracy, interrupted_phase, interrupted_question_number` |
| 調性感 | `user_id, session_id, test_type, session_status, session_started_at, session_ended_at, measurement_key_code, attempt_number, trial_number, first_stimulus_id, second_stimulus_id, change_condition, trial_started_at, melody_change_rating, harmony_change_rating, overall_change_rating, response_enabled_at, response_confirmed_at, response_time_ms, outcome` | `user_id, session_id, test_type, measurement_key_code, attempt_number, session_status, started_at, ended_at, practice_trial_count, answered_trial_count, total_trial_count` |

### 8.5 現在のフォーマットとの違い

#### すべての種類に共通

| 項目 | 現在 | 新しい形 |
|---|---|---|
| 利用者の列 | `participant_id`（`P00001` 形式） | `user_id`（UUID）。`participant_id` は出さない |
| 作る場所・時期 | クライアントが端末内の記録から作る。サーバは、受信時に CSV ファイルを保存する | サーバが、ダウンロード要求のたびに、データベースから作る。ファイルは保存しない |
| 文字コード | BOM なしの UTF-8 | BOM 付きの UTF-8 |
| ファイルの分け方 | 参加者 ID ごと・日付ごとのフォルダに、1 セッション = 1 ファイル（サーバ）。参加者ごとに 1 ファイル（クライアント） | ユーザごと・種類ごとに 1 ファイル（回答詳細・履歴）。変更の可能性あり |
| 中断の扱い | クライアントで「中断を含める」を選ぶ | ダウンロードの範囲の指定で、含めるか選ぶ（API の仕様で定める） |

#### 種類ごと

| 種類 | 現在 | 新しい形 |
|---|---|---|
| 絶対音感 | クライアントの CSV には `session_ended_at` がなく、サーバの CSV にはある。2 種類の列が存在する | サーバの CSV の列にそろえる（`session_ended_at` あり） |
| 相対音感 | クライアントの CSV には `session_started_at`・`session_ended_at`・`practice_status`・`total_questions` がなく、サーバの CSV にはある | サーバの CSV の列にそろえる |
| 調性感 | `session_ended_at` がない。`attempt_number` は、CSV を作るときに端末内の記録から数え直す | `session_ended_at` を加える。`attempt_number` は、クライアントが数えて送った値を使う |
| 訓練 | `training_session_id` の列。`test_type`・`session_started_at`・`session_ended_at` の列がない。`attempt_number` は端末内の記録から数える。回答対象は `responses[0]` のみを出す | `session_id` に改名。`test_type`・`session_started_at`・`session_ended_at` を加える。`attempt_number` はクライアントが数えて送った値。`target_id` を加え、回答対象の数だけ行を出す（現在は 1 つなので、行数は同じ） |

## 9. 検証の規則（サーバ）

- 本文は JSON のオブジェクト。`testType` は 4 種類のみ。
- `sessionId` は UUID。`startedAt`・`endedAt` は ISO 8601 の形式。`sessionStatus` は、種類ごとに使える値のみ。
- 必須の項目が欠けている、または型が違う場合は `400 BAD_REQUEST`。値が規則に合わない場合は `422`（ApiSpec_Auth.md の既存の使い分けに従う）。
- 配列の要素数の上限（例：絶対音感・相対音感は 200、調性感は 100、訓練は 100）と、本文の大きさの上限（例：1 MB）を設ける。具体的な値は、API の仕様で定める。
- 文字列の値に、配列・オブジェクトが含まれる場合（`practiceResults` を除く）は拒否する。

## 10. 未決事項

- `practiceResults`（調性感）の形と、保存の方法（そのまま JSON で持つか、列にするか）
- ダウンロードの範囲の上限の値と、ZIP のフォルダ構成の詳細
- 訓練の `testType` の名前（`training` と仮置き）と、訓練の音声エラーの集計の扱い
- 利用データの削除の手段（運用者の SQL、研究者の機能）
- 所属前に作られたデータを、組織に参照させるか（基本方針 10.4）

## 付録 A. JSON の例

コメント（`//`）は説明用で、実際の JSON には入れない。日時は例。

### A.1 絶対音感

```jsonc
{
  "sessionId": "3f2504e0-4f89-4f9d-9a7f-2f1e6b6a2b11",
  "testType": "absolute_pitch",
  "startedAt": "2026-10-29T10:00:00+09:00",
  "endedAt": "2026-10-29T10:05:23+09:00",
  "sessionStatus": "completed",            // completed | forced_termination | interrupted
  "sequenceStartPosition": 12,             // 任意
  "sequenceStartNumber": 13,               // 任意
  "sequenceDirection": "forward",          // 任意
  "responses": [
    {
      "phase": "test",                     // practice | test
      "questionNumber": 1,
      "stimulusNumber": 3,
      "stimulusNote": "D2",
      "stimulusFilename": "D2.wav",
      "stimulusStartedAt": "2026-10-29T10:00:00.000+09:00",
      "correctResponse": "D",
      "responseNote": "D",                 // 未回答は ""
      "responseAt": "2026-10-29T10:00:01.000+09:00",
      "responseTimeMs": 812,
      "outcome": "correct",                // correct | incorrect | timeout | interrupted
      "incorrectTotalAfterQuestion": 0
    }
  ]
}
```

### A.2 相対音感

```jsonc
{
  "sessionId": "0b8f6c1e-2d3a-4e5f-8a7b-9c0d1e2f3a4b",
  "testType": "relative_pitch",
  "testVersion": "simplified",             // simplified | full
  "startedAt": "2026-10-29T10:00:00+09:00",
  "endedAt": "2026-10-29T10:05:00+09:00",
  "sessionStatus": "completed",            // completed | interrupted
  "answerLayout": "circular",
  "practiceStatus": "completed",           // completed | skipped | interrupted | null
  "generatedQuestionOrder": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13],
  "responses": [
    {
      "phase": "test",
      "questionNumber": 1,
      "keyCode": "C",
      "keyBlockNumber": 1,                 // 練習は ""
      "cadenceFilename": "cadence_C.wav",
      "referenceNote": "C4",
      "targetNote": "E4",
      "intervalSemitones": 4,
      "syllableCode": "MiM",
      "displayLabel": "ミ",
      "intervalLabel": "short",            // null 可
      "scaleLabel": "in",                  // null 可
      "cadenceStartedAt": "2026-10-29T10:00:00.000+09:00",
      "referenceStartedAt": "2026-10-29T10:00:03.000+09:00",
      "targetStartedAt": "2026-10-29T10:00:04.000+09:00",
      "responseCode": 4,                   // 未回答は ""
      "responseAt": "2026-10-29T10:00:06.000+09:00",
      "responseTimeMs": 1200,
      "outcome": "correct"                 // correct | incorrect | interrupted
    }
  ]
}
```

### A.3 調性感

```jsonc
{
  "sessionId": "f46bc532-4ade-4ce3-a070-58afb7a7de0e",
  "testType": "functional_pitch",
  "startedAt": "2026-10-29T09:00:01.488+09:00",
  "endedAt": "2026-10-29T09:20:30.000+09:00",       // 新規に必須
  "sessionStatus": "completed",                      // completed | audio_error | interrupted
  "measurementKeyCode": "Fis",
  "attemptNumber": 1,                                // クライアントが数える。新規にセッションへ保存して送る
  "totalTrialCount": 90,
  "generatedTrialOrder": [
    { "trialNumber": 1, "firstStimulusId": "ch-n1-maj-mel-n1", "secondStimulusId": "ch-n5-dom7-mel-n5", "changeCondition": "both-change" }
  ],
  "practiceResults": [],                             // 任意。サーバは検証せず、そのまま保存
  "responses": [
    {
      "trialNumber": 1,
      "firstStimulusId": "ch-n1-maj-mel-n1",
      "secondStimulusId": "ch-n5-dom7-mel-n5",
      "changeCondition": "both-change",
      "trialStartedAt": "2026-10-29T09:00:01.489+09:00",
      "melodyChangeRating": 2,                       // 未回答は ""
      "harmonyChangeRating": 2,
      "overallChangeRating": 2,
      "responseEnabledAt": "2026-10-29T09:00:12.595+09:00",
      "responseConfirmedAt": "2026-10-29T09:00:21.347+09:00",
      "responseTimeMs": 8748,
      "outcome": "answered"                          // answered | interrupted
    }
  ]
}
```

### A.4 訓練

```jsonc
{
  "sessionId": "77656c60-150c-41f4-8dd6-46524223f7d9",   // 現在の trainingSessionId から改名
  "testType": "training",                                // 新規
  "startedAt": "2026-10-29T08:54:00.000+09:00",
  "endedAt": "2026-10-29T08:57:10.000+09:00",            // 新規に必須
  "sessionStatus": "completed",                          // completed | interrupted | audio_error
  "menuId": "menu-06",
  "attemptNumber": 1,
  "sessionKeyCode": "C",
  "keyAssignmentMethod": "fixed",
  "trialsPlanned": 15,
  "trials": [
    {
      "trialNumber": 8,
      "stimulusId": "st-n6-ch-n4-maj",
      "stimulusVersion": "01",
      "taskTemplateId": "tt-chord-first",
      "keyCode": "C",
      "questionReplayCount": 0,
      "feedbackReplayCount": 1,
      "audioStartedAt": "2026-10-29T08:55:27.952+09:00",
      "audioEndedAt": "2026-10-29T08:55:29.952+09:00",
      "responseEnabledAt": "2026-10-29T08:55:29.952+09:00",
      "responseSubmittedAt": "2026-10-29T08:55:31.416+09:00",
      "responseTimeMs": 1462,
      "responses": [
        // 「わからない」は responseCode が null、outcome は giveup。targetId の値は例
        { "targetId": "t1", "correctAnswerCode": "n4", "responseCode": "n5", "outcome": "incorrect" }
      ],
      "scoring": { "targetCount": 1, "correctTargetCount": 0, "accuracy": 0, "allCorrect": false }
    }
  ]
}
```

訓練の `trialsCompleted`・`correctCount`・`giveupCount` は、送ってもよい。サーバが `trials` から数え直す。

### A.5 レスポンス（案）

```jsonc
// 201 Created（初めて保存）または 200 OK（同じ sessionId の再送）
{
  "sessionId": "3f2504e0-4f89-4f9d-9a7f-2f1e6b6a2b11",
  "testType": "absolute_pitch",
  "receivedAt": "2026-10-29T10:05:24.123Z"
}
```

- エラー（`400`、`401`、`404`、`409`、`422`）の本文は、既存の API のエラー形式にそろえる。
- 日付とファイル名は、CSV ファイルがなくなったので返さない。
