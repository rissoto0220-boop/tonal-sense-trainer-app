-- sessions（セッション）
-- 出典: TableSpec_Auth.md 2.4
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
    id               BINARY(16)  NOT NULL,
    family_id        BINARY(16)  NOT NULL,
    token_hash       BINARY(32)  NOT NULL,
    selected_user_id BINARY(16)  NULL,
    device_label     VARCHAR(50) NOT NULL,
    created_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_used_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at       DATETIME(6) NOT NULL,
    elevated_until   DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sessions_token_hash (token_hash),
    KEY ix_sessions_family        (family_id),
    KEY ix_sessions_selected_user (selected_user_id),
    KEY ix_sessions_expires_at    (expires_at),
    CONSTRAINT fk_sessions_family        FOREIGN KEY (family_id)        REFERENCES families (id) ON DELETE CASCADE,
    CONSTRAINT fk_sessions_selected_user FOREIGN KEY (selected_user_id) REFERENCES users (id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;
