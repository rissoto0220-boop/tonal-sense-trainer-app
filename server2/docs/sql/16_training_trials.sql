-- training_trials（訓練の試行）
-- 出典: TableSpec_TestData.md 6.3
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS training_trials;
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
SET FOREIGN_KEY_CHECKS = 1;
