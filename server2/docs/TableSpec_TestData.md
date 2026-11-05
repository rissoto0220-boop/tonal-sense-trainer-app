# テーブル仕様書：利用データ（テスト結果）

データフォーマット（DataFormat_TestData.md）に基づき、テスト・訓練の結果を管理するテーブルを定義する。共通事項は TableSpec_Account.md の 0. に従う。

## 0. 共通事項・方針

- 利用データは、`users`・`families` への**外部キーを持たない**。`user_id` のみで利用者を表す（TableSpec_Account.md 5.2）。ユーザの削除・退会で、利用データは消えない。
- 利用データに、ユーザ名・メールアドレス・氏名・家族の ID・組織の ID を含めない。組織は、現在の所属から決める（TableSpec_Organization.md 6.）。
- 外部キーを持つのは、セッションと回答の間のみ（`ON DELETE CASCADE`）。セッションを消すと、回答も消える。
- 保存の方法は、次のとおり。
  - 共通の項目は `test_sessions` に置く。種類ごとの回答は、種類ごとのテーブルに、型付きの列で置く（検証・集計・CSV の作成を単純にするため）。
  - 種類ごとのセッションの項目のうち、絞り込みに使うもの（`variant`、`attempt_number`、`planned_count`）は列にし、それ以外は `attributes`（JSON）に置く。
- 日時は、利用データでは `DATETIME(3)`（ミリ秒）で保存する。クライアントの時刻の精度（ミリ秒）に合わせるため。
  - UTC に変換して保存し、セッションの開始日時のオフセット（`+09:00` など）を `utc_offset_minutes` に保存する。
  - CSV では、UTC の値に `utc_offset_minutes` を足して、元の形（`2026-10-29T08:54:03.875+09:00`）に戻す。秒までの値（`2026-10-29T10:00:00+09:00`）は、ミリ秒付き（`.000`）で出す。
  - 回答の日時も、セッションの開始日時と同じオフセットとみなす。
  - `received_at`（受信日時）のみ `DATETIME(6)`。
- 空欄の扱い：クライアントの空文字 `""` と `null` は、どちらも `NULL` で保存する。CSV では空欄で出す。
- 文字列の列の照合順序は `utf8mb4_bin`（コードの大文字・小文字を区別する）。
- DDL を実行する SQL は `sql/` の `12_〜17_` と `create_all.sql`。DDL を変更したときは、本仕様書と `sql/` のすべてのファイルを更新すること。

## 1. テーブル一覧

| テーブル名 | 論理名 | 概要 |
|---|---|---|
| `test_sessions` | セッション | 4 種類のテスト・訓練の 1 回分。共通の項目と、種類ごとの項目を持つ |
| `absolute_pitch_responses` | 絶対音感の回答 | 1 行 = 1 問 |
| `relative_pitch_responses` | 相対音感の回答 | 1 行 = 1 問 |
| `functional_pitch_responses` | 調性感の回答 | 1 行 = 1 試行 |
| `training_trials` | 訓練の試行 | 1 行 = 1 試行 |
| `training_trial_responses` | 訓練の試行の回答 | 1 行 = 1 試行の 1 回答対象 |

```
test_sessions 1 ──── 0..n absolute_pitch_responses
test_sessions 1 ──── 0..n relative_pitch_responses
test_sessions 1 ──── 0..n functional_pitch_responses
test_sessions 1 ──── 0..n training_trials 1 ──── 1..n training_trial_responses
users（現存するユーザ）… test_sessions.user_id（外部キーなし。値が一致するだけ）
```

## 2. test_sessions（セッション）

### 2.1 カラム

| カラム名 | 型 | NULL | 説明 |
|---|---|---|---|
| `id` | `BINARY(16)` | NOT NULL | 主キー。クライアントが作る `sessionId`（UUID）をそのまま使う（`UUID_TO_BIN()`）。再送の判定の唯一のキー |
| `user_id` | `BINARY(16)` | NOT NULL | 利用者。`users.id` と同じ値（外部キーなし） |
| `test_type` | `VARCHAR(20)` | NOT NULL | `absolute_pitch` / `relative_pitch` / `functional_pitch` / `training` |
| `session_status` | `VARCHAR(20)` | NOT NULL | `completed` / `forced_termination` / `audio_error` / `interrupted` |
| `variant` | `VARCHAR(32)` | NULL | 種類ごとの区分（2.2） |
| `attempt_number` | `SMALLINT UNSIGNED` | NULL | 同じメニュー・キーを始めた回数（調性感・訓練。クライアントが数えた値） |
| `planned_count` | `SMALLINT UNSIGNED` | NULL | 計画した本番の問題・試行の数（2.2） |
| `started_at` | `DATETIME(3)` | NOT NULL | 開始日時（UTC） |
| `ended_at` | `DATETIME(3)` | NOT NULL | 終了日時（UTC） |
| `utc_offset_minutes` | `SMALLINT` | NOT NULL | 開始日時の UTC からのオフセット（分。`+09:00` は `540`） |
| `attributes` | `JSON` | NOT NULL | 種類ごとのセッションの項目（2.2） |
| `received_at` | `DATETIME(6)` | NOT NULL | 受信日時（UTC）。既定値は `CURRENT_TIMESTAMP(6)` |

### 2.2 種類ごとの項目

| 種類 | `variant` | `attempt_number` | `planned_count` | `attributes`（JSON のキー） |
|---|---|---|---|---|
| 絶対音感 | NULL | NULL | `60`（本番の問題数） | `sequenceStartPosition`、`sequenceStartNumber`、`sequenceDirection`（送られたものだけ） |
| 相対音感 | `testVersion`（`simplified` / `full`） | NULL | `generatedQuestionOrder` の件数 | `answerLayout`、`practiceStatus`、`generatedQuestionOrder` |
| 調性感 | `measurementKeyCode` | `attemptNumber` | `totalTrialCount` | `generatedTrialOrder`、`practiceResults`（送られたものだけ） |
| 訓練 | `menuId` | `attemptNumber` | `trialsPlanned` | `sessionKeyCode`、`keyAssignmentMethod` |

- `attributes` には、上のキーのみを保存する。他のキーは保存しない（検証で除く）。
- `attributes` のキー名は、DataFormat_TestData.md の `camelCase` のまま。
- 訓練の件数（`trialsCompleted`・`correctCount`・`giveupCount`）と `scoring` は、保存しない。必要なときは、`training_trials`・`training_trial_responses` から数える。

### 2.3 キー・制約

| 名前 | 内容 | 目的 |
|---|---|---|
| 主キー `id` | `sessionId` | 再送の判定。同じ `id` が別の `user_id` で保存されている場合は `409`（アプリケーションで `user_id` を比較する） |
| `ix_test_sessions_user_started` | `(user_id, started_at)` | 利用者ごとの履歴・CSV。5.2 の規則で必要な `user_id` のインデックス |
| `ix_test_sessions_type_started` | `(test_type, started_at)` | 研究者による、種類・期間での抽出 |
| `ck_test_sessions_test_type` | 4 種類のみ | |
| `ck_test_sessions_status` | 4 つの値のみ | |
| `ck_test_sessions_status_type` | `forced_termination` は絶対音感のみ、`audio_error` は調性感・訓練のみ | DataFormat_TestData.md 3. |
| `ck_test_sessions_period` | `ended_at >= started_at` | |
| `ck_test_sessions_utc_offset` | `-720` 〜 `840` | |

### 2.4 DDL

```sql
CREATE TABLE test_sessions (
    id                 BINARY(16)        NOT NULL,
    user_id            BINARY(16)        NOT NULL,
    test_type          VARCHAR(20)       NOT NULL,
    session_status     VARCHAR(20)       NOT NULL,
    variant            VARCHAR(32)       NULL,
    attempt_number     SMALLINT UNSIGNED NULL,
    planned_count      SMALLINT UNSIGNED NULL,
    started_at         DATETIME(3)       NOT NULL,
    ended_at           DATETIME(3)       NOT NULL,
    utc_offset_minutes SMALLINT          NOT NULL,
    attributes         JSON              NOT NULL,
    received_at        DATETIME(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_test_sessions_user_started (user_id, started_at),
    KEY ix_test_sessions_type_started (test_type, started_at),
    CONSTRAINT ck_test_sessions_test_type CHECK (test_type IN ('absolute_pitch', 'relative_pitch', 'functional_pitch', 'training')),
    CONSTRAINT ck_test_sessions_status CHECK (session_status IN ('completed', 'forced_termination', 'audio_error', 'interrupted')),
    CONSTRAINT ck_test_sessions_status_type CHECK (
        session_status IN ('completed', 'interrupted')
        OR (session_status = 'forced_termination' AND test_type = 'absolute_pitch')
        OR (session_status = 'audio_error' AND test_type IN ('functional_pitch', 'training'))
    ),
    CONSTRAINT ck_test_sessions_period CHECK (ended_at >= started_at),
    CONSTRAINT ck_test_sessions_utc_offset CHECK (utc_offset_minutes BETWEEN -720 AND 840)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

## 3. absolute_pitch_responses（絶対音感の回答）

### 3.1 概要

- 1 行 = 1 問（練習・本番とも）。主キーは `(session_id, seq)`。`seq` は、`responses` 配列の順序（0 から）。
- `phase` と `question_number` の組は、一意とみなさない（クライアントの記録をそのまま保存するため）。

### 3.2 カラム

DataFormat_TestData.md 4. の `responses[]` に対応する（`camelCase` → `snake_case`）。

| カラム名 | 型 | NULL | 元の項目 |
|---|---|---|---|
| `session_id` | `BINARY(16)` | NOT NULL | `test_sessions.id` |
| `seq` | `SMALLINT UNSIGNED` | NOT NULL | 配列の順序 |
| `phase` | `VARCHAR(8)` | NOT NULL | `phase`（`practice` / `test`） |
| `question_number` | `SMALLINT UNSIGNED` | NOT NULL | `questionNumber` |
| `stimulus_number` | `SMALLINT UNSIGNED` | NOT NULL | `stimulusNumber` |
| `stimulus_note` | `VARCHAR(8)` | NOT NULL | `stimulusNote` |
| `stimulus_filename` | `VARCHAR(64)` | NOT NULL | `stimulusFilename` |
| `stimulus_started_at` | `DATETIME(3)` | NULL | `stimulusStartedAt` |
| `correct_response` | `VARCHAR(8)` | NOT NULL | `correctResponse` |
| `response_note` | `VARCHAR(8)` | NULL | `responseNote` |
| `response_at` | `DATETIME(3)` | NULL | `responseAt` |
| `response_time_ms` | `INT UNSIGNED` | NULL | `responseTimeMs` |
| `outcome` | `VARCHAR(12)` | NOT NULL | `outcome`（`correct` / `incorrect` / `timeout` / `interrupted`） |
| `incorrect_total_after_question` | `SMALLINT UNSIGNED` | NULL | `incorrectTotalAfterQuestion` |

### 3.3 DDL

```sql
CREATE TABLE absolute_pitch_responses (
    session_id                    BINARY(16)        NOT NULL,
    seq                           SMALLINT UNSIGNED NOT NULL,
    phase                         VARCHAR(8)        NOT NULL,
    question_number               SMALLINT UNSIGNED NOT NULL,
    stimulus_number               SMALLINT UNSIGNED NOT NULL,
    stimulus_note                 VARCHAR(8)        NOT NULL,
    stimulus_filename             VARCHAR(64)       NOT NULL,
    stimulus_started_at           DATETIME(3)       NULL,
    correct_response              VARCHAR(8)        NOT NULL,
    response_note                 VARCHAR(8)        NULL,
    response_at                   DATETIME(3)       NULL,
    response_time_ms              INT UNSIGNED      NULL,
    outcome                       VARCHAR(12)       NOT NULL,
    incorrect_total_after_question SMALLINT UNSIGNED NULL,
    PRIMARY KEY (session_id, seq),
    CONSTRAINT fk_absolute_pitch_responses_session FOREIGN KEY (session_id) REFERENCES test_sessions (id) ON DELETE CASCADE,
    CONSTRAINT ck_absolute_pitch_responses_phase   CHECK (phase IN ('practice', 'test')),
    CONSTRAINT ck_absolute_pitch_responses_outcome CHECK (outcome IN ('correct', 'incorrect', 'timeout', 'interrupted'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

## 4. relative_pitch_responses（相対音感の回答）

### 4.1 概要

- 1 行 = 1 問。主キーは `(session_id, seq)`（3.1 と同じ）。
- 履歴 CSV の `total_questions` は、`test_sessions.planned_count` から出す。

### 4.2 カラム

DataFormat_TestData.md 5. の `responses[]` に対応する。

| カラム名 | 型 | NULL | 元の項目 |
|---|---|---|---|
| `session_id`、`seq` | | NOT NULL | 3.2 と同じ |
| `phase` | `VARCHAR(8)` | NOT NULL | `phase` |
| `question_number` | `SMALLINT UNSIGNED` | NOT NULL | `questionNumber` |
| `key_block_number` | `SMALLINT UNSIGNED` | NULL | `keyBlockNumber`（練習は NULL） |
| `key_code` | `VARCHAR(8)` | NOT NULL | `keyCode` |
| `cadence_filename` | `VARCHAR(64)` | NOT NULL | `cadenceFilename` |
| `reference_note`、`target_note` | `VARCHAR(8)` | NOT NULL | `referenceNote`、`targetNote` |
| `interval_semitones` | `SMALLINT` | NOT NULL | `intervalSemitones` |
| `syllable_code`、`display_label` | `VARCHAR(16)` | NOT NULL | `syllableCode`、`displayLabel` |
| `interval_label`、`scale_label` | `VARCHAR(16)` | NULL | `intervalLabel`、`scaleLabel` |
| `cadence_started_at`、`reference_started_at`、`target_started_at` | `DATETIME(3)` | NULL | 同名（`camelCase`） |
| `response_code` | `SMALLINT` | NULL | `responseCode`（回答した半音差） |
| `response_at`、`response_time_ms` | | NULL | 3.2 と同じ |
| `outcome` | `VARCHAR(12)` | NOT NULL | `correct` / `incorrect` / `interrupted` |

### 4.3 DDL

```sql
CREATE TABLE relative_pitch_responses (
    session_id           BINARY(16)        NOT NULL,
    seq                  SMALLINT UNSIGNED NOT NULL,
    phase                VARCHAR(8)        NOT NULL,
    question_number      SMALLINT UNSIGNED NOT NULL,
    key_block_number     SMALLINT UNSIGNED NULL,
    key_code             VARCHAR(8)        NOT NULL,
    cadence_filename     VARCHAR(64)       NOT NULL,
    reference_note       VARCHAR(8)        NOT NULL,
    target_note          VARCHAR(8)        NOT NULL,
    interval_semitones   SMALLINT          NOT NULL,
    syllable_code        VARCHAR(16)       NOT NULL,
    display_label        VARCHAR(16)       NOT NULL,
    interval_label       VARCHAR(16)       NULL,
    scale_label          VARCHAR(16)       NULL,
    cadence_started_at   DATETIME(3)       NULL,
    reference_started_at DATETIME(3)       NULL,
    target_started_at    DATETIME(3)       NULL,
    response_code        SMALLINT          NULL,
    response_at          DATETIME(3)       NULL,
    response_time_ms     INT UNSIGNED      NULL,
    outcome              VARCHAR(12)       NOT NULL,
    PRIMARY KEY (session_id, seq),
    CONSTRAINT fk_relative_pitch_responses_session FOREIGN KEY (session_id) REFERENCES test_sessions (id) ON DELETE CASCADE,
    CONSTRAINT ck_relative_pitch_responses_phase   CHECK (phase IN ('practice', 'test')),
    CONSTRAINT ck_relative_pitch_responses_outcome CHECK (outcome IN ('correct', 'incorrect', 'interrupted'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

## 5. functional_pitch_responses（調性感の回答）

### 5.1 概要

- 1 行 = 1 試行（回答した試行と、回答前に終わった試行）。主キーは `(session_id, trial_number)`。
- `generatedTrialOrder`（出題順）と `practiceResults` は、`test_sessions.attributes` に保存する。

### 5.2 カラム

DataFormat_TestData.md 6. の `responses[]` に対応する。

| カラム名 | 型 | NULL | 元の項目 |
|---|---|---|---|
| `session_id` | `BINARY(16)` | NOT NULL | `test_sessions.id` |
| `trial_number` | `SMALLINT UNSIGNED` | NOT NULL | `trialNumber` |
| `first_stimulus_id`、`second_stimulus_id` | `VARCHAR(64)` | NOT NULL | `firstStimulusId`、`secondStimulusId` |
| `change_condition` | `VARCHAR(24)` | NOT NULL | `changeCondition` |
| `trial_started_at` | `DATETIME(3)` | NULL | `trialStartedAt` |
| `melody_change_rating`、`harmony_change_rating`、`overall_change_rating` | `TINYINT UNSIGNED` | NULL | 評定（未回答は NULL） |
| `response_enabled_at`、`response_confirmed_at` | `DATETIME(3)` | NULL | 同名（`camelCase`） |
| `response_time_ms` | `INT UNSIGNED` | NULL | `responseTimeMs` |
| `outcome` | `VARCHAR(12)` | NOT NULL | `answered` / `interrupted` |

### 5.3 DDL

```sql
CREATE TABLE functional_pitch_responses (
    session_id            BINARY(16)        NOT NULL,
    trial_number          SMALLINT UNSIGNED NOT NULL,
    first_stimulus_id     VARCHAR(64)       NOT NULL,
    second_stimulus_id    VARCHAR(64)       NOT NULL,
    change_condition      VARCHAR(24)       NOT NULL,
    trial_started_at      DATETIME(3)       NULL,
    melody_change_rating  TINYINT UNSIGNED  NULL,
    harmony_change_rating TINYINT UNSIGNED  NULL,
    overall_change_rating TINYINT UNSIGNED  NULL,
    response_enabled_at   DATETIME(3)       NULL,
    response_confirmed_at DATETIME(3)       NULL,
    response_time_ms      INT UNSIGNED      NULL,
    outcome               VARCHAR(12)       NOT NULL,
    PRIMARY KEY (session_id, trial_number),
    CONSTRAINT fk_functional_pitch_responses_session FOREIGN KEY (session_id) REFERENCES test_sessions (id) ON DELETE CASCADE,
    CONSTRAINT ck_functional_pitch_responses_outcome CHECK (outcome IN ('answered', 'interrupted'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

## 6. training_trials（訓練の試行）

### 6.1 概要

- 1 行 = 1 試行。主キーは `(session_id, trial_number)`。
- 回答対象ごとの回答は、`training_trial_responses`（7.）に置く。

### 6.2 カラム

DataFormat_TestData.md 7. の `trials[]`（`responses` と `scoring` を除く）に対応する。

| カラム名 | 型 | NULL | 元の項目 |
|---|---|---|---|
| `session_id` | `BINARY(16)` | NOT NULL | `test_sessions.id` |
| `trial_number` | `SMALLINT UNSIGNED` | NOT NULL | `trialNumber` |
| `stimulus_id` | `VARCHAR(64)` | NOT NULL | `stimulusId` |
| `stimulus_version` | `VARCHAR(8)` | NOT NULL | `stimulusVersion` |
| `task_template_id` | `VARCHAR(64)` | NOT NULL | `taskTemplateId` |
| `key_code` | `VARCHAR(8)` | NOT NULL | `keyCode` |
| `question_replay_count`、`feedback_replay_count` | `SMALLINT UNSIGNED` | NOT NULL | 同名（`camelCase`） |
| `audio_started_at`、`audio_ended_at`、`response_enabled_at`、`response_submitted_at` | `DATETIME(3)` | NULL | 同名（`camelCase`） |
| `response_time_ms` | `INT UNSIGNED` | NULL | `responseTimeMs` |

### 6.3 DDL

```sql
CREATE TABLE training_trials (
    session_id            BINARY(16)        NOT NULL,
    trial_number          SMALLINT UNSIGNED NOT NULL,
    stimulus_id           VARCHAR(64)       NOT NULL,
    stimulus_version      VARCHAR(8)        NOT NULL,
    task_template_id      VARCHAR(64)       NOT NULL,
    key_code              VARCHAR(8)        NOT NULL,
    question_replay_count SMALLINT UNSIGNED NOT NULL,
    feedback_replay_count SMALLINT UNSIGNED NOT NULL,
    audio_started_at      DATETIME(3)       NULL,
    audio_ended_at        DATETIME(3)       NULL,
    response_enabled_at   DATETIME(3)       NULL,
    response_submitted_at DATETIME(3)       NULL,
    response_time_ms      INT UNSIGNED      NULL,
    PRIMARY KEY (session_id, trial_number),
    CONSTRAINT fk_training_trials_session FOREIGN KEY (session_id) REFERENCES test_sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

## 7. training_trial_responses（訓練の試行の回答）

### 7.1 概要

- 1 行 = 1 試行の 1 回答対象。主キーは `(session_id, trial_number, target_id)`。現在は、回答対象が 1 つなので、1 試行 = 1 行。
- 「わからない」は、`response_code` が NULL で、`outcome` が `giveup`。この対応は、CHECK 制約で保つ。

### 7.2 カラム

| カラム名 | 型 | NULL | 元の項目 |
|---|---|---|---|
| `session_id`、`trial_number` | | NOT NULL | `training_trials` への外部キー |
| `target_id` | `VARCHAR(32)` | NOT NULL | `targetId` |
| `correct_answer_code` | `VARCHAR(16)` | NOT NULL | `correctAnswerCode` |
| `response_code` | `VARCHAR(16)` | NULL | `responseCode`（「わからない」は NULL） |
| `outcome` | `VARCHAR(10)` | NOT NULL | `correct` / `incorrect` / `giveup` |

### 7.3 DDL

```sql
CREATE TABLE training_trial_responses (
    session_id          BINARY(16)        NOT NULL,
    trial_number        SMALLINT UNSIGNED NOT NULL,
    target_id           VARCHAR(32)       NOT NULL,
    correct_answer_code VARCHAR(16)       NOT NULL,
    response_code       VARCHAR(16)       NULL,
    outcome             VARCHAR(10)       NOT NULL,
    PRIMARY KEY (session_id, trial_number, target_id),
    CONSTRAINT fk_training_trial_responses_trial FOREIGN KEY (session_id, trial_number) REFERENCES training_trials (session_id, trial_number) ON DELETE CASCADE,
    CONSTRAINT ck_training_trial_responses_outcome CHECK (outcome IN ('correct', 'incorrect', 'giveup')),
    CONSTRAINT ck_training_trial_responses_giveup  CHECK ((outcome = 'giveup') = (response_code IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

## 8. 保存の処理

- 1 件のセッションの保存は、**1 つのトランザクション**で、`test_sessions` と回答のテーブルに行う。途中で失敗したら、すべて巻き戻す（セッションだけが残らないようにする）。
- 再送の判定：
  - `id` が存在し、`user_id` が同じ：何もしない（`200`）。
  - `id` が存在し、`user_id` が違う：`409`。
  - 存在しない：保存する（`201`）。
  - 同時に同じ `id` が送られた場合は、主キーの重複エラーを捕まえ、上の判定をやり直す。
- 訓練の `scoring`、`trialsCompleted`、`correctCount`、`giveupCount` は、送られた値を保存せず、照合のみ（DataFormat_TestData.md 7.）。

## 9. CSV の作成との対応

- 回答詳細 CSV：`test_sessions` と回答のテーブルを `session_id` で結合し、`user_id`・`started_at`・`seq` の順に、1 行ずつ出力する（結果を一度にメモリに載せない）。
- 履歴 CSV：1 行 = 1 セッション。件数（正解数・誤答数・中断した位置など）は、保存せず、回答のテーブルから数える。数え方は、現在のクライアントの `reports.js` と同じ。
- 列の対応：`session_status`・`started_at`・`ended_at`・`test_version`（`variant`）・`measurement_key_code`（`variant`）・`menu_id`（`variant`）・`attempt_number`・`total_questions`（`planned_count`）・`answer_layout` などは、`test_sessions` から出す。
- 絞り込み：ユーザ（`user_id`）、種類（`test_type`）、期間（`started_at`）。

## 10. 参照の権限

TableSpec_Organization.md 6. の条件を、`test_sessions.user_id` に適用する。

```sql
SELECT s.*
  FROM test_sessions s
  JOIN users    u ON u.id = s.user_id
  JOIN families f ON f.id = u.family_id
 WHERE f.organization_id = :organization_id;
```

- 家族のユーザ：`s.user_id` が、ログイン中の家族の現存するユーザの `id` のいずれか。
- 研究者：条件なし。
- 回答のテーブルは、`session_id` で `test_sessions` に結合し、同じ条件を適用する。

## 11. 保持・削除

- ユーザの削除・退会：利用データは削除しない。アプリケーションは、`test_sessions` に何もしない。
- 利用データの削除の手段（運用者の SQL、研究者の機能）は、別途定める。削除するときは、`test_sessions` の行を削除すれば、回答のテーブルの行は連鎖して削除される（`ON DELETE CASCADE`）。
- 保存の期間（利用データの保存期間）は、未決。

## 12. 未決事項

- 回答の日時のオフセットが、セッションの開始日時と違う場合の扱い（現在は、UTC に変換して保存し、CSV では開始日時のオフセットで出す。実際の入力で起こりうるかを確認したい）。
- `practiceResults`（調性感）の保存の方法（現在は `attributes` の JSON。検索・集計する場合は、別のテーブルにする）。
- 種類ごとの項目（相対音感の `answerLayout`・`practiceStatus`）が、絞り込みに必要になった場合は、列に出す。
- 本文の大きさ・配列の件数の上限の値（DataFormat_TestData.md 9.）。
- 利用データの保存期間と、削除の手段。
- 所属前に作られたデータを、組織に参照させるか（TableSpec_Organization.md 6.）。
- `test_sessions.id` は、クライアントが作る UUID なので、主キーの挿入順が不規則になる。件数が増えて、書き込みが遅くなる場合は、連番の主キーを別に持つ形に変える。
