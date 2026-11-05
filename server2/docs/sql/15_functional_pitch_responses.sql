-- functional_pitch_responses（調性感の回答）
-- 出典: TableSpec_TestData.md 5.3
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS functional_pitch_responses;
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
SET FOREIGN_KEY_CHECKS = 1;
