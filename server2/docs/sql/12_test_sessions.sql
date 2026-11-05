-- test_sessions（テスト・訓練のセッション）
-- 出典: TableSpec_TestData.md 2.4
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS test_sessions;
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
SET FOREIGN_KEY_CHECKS = 1;
