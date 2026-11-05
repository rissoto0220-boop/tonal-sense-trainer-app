-- relative_pitch_responses（相対音感の回答）
-- 出典: TableSpec_TestData.md 4.3
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS relative_pitch_responses;
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
SET FOREIGN_KEY_CHECKS = 1;
