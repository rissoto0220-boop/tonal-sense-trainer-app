-- training_trial_responses（訓練の試行の回答（回答対象ごと））
-- 出典: TableSpec_TestData.md 7.3
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS training_trial_responses;
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
SET FOREIGN_KEY_CHECKS = 1;
