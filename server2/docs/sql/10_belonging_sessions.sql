-- belonging_sessions（所属のセッション）
-- 出典: TableSpec_Belonging.md 4.4
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS belonging_sessions;
CREATE TABLE belonging_sessions (
    id              BINARY(16)       NOT NULL,
    belonging_id    BINARY(16)       NOT NULL,
    token_hash      BINARY(32)       NOT NULL,
    auth_stage      TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at      DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_used_at    DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at      DATETIME(6)      NOT NULL,
    elevated_until  DATETIME(6)      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_belonging_sessions_token_hash (token_hash),
    KEY ix_belonging_sessions_belonging (belonging_id),
    KEY ix_belonging_sessions_expires_at   (expires_at),
    CONSTRAINT fk_belonging_sessions_belonging FOREIGN KEY (belonging_id) REFERENCES belongings (id) ON DELETE CASCADE,
    CONSTRAINT ck_belonging_sessions_auth_stage   CHECK (auth_stage IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;
