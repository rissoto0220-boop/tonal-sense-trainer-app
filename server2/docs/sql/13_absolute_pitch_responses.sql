-- absolute_pitch_responses（絶対音感の回答）
-- 出典: TableSpec_TestData.md 3.3
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS absolute_pitch_responses;
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
SET FOREIGN_KEY_CHECKS = 1;
