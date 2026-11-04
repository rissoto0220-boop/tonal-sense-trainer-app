-- organization_sessions（組織のセッション）
-- 出典: TableSpec_Organization.md 4.4
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS organization_sessions;
CREATE TABLE organization_sessions (
    id              BINARY(16)       NOT NULL,
    organization_id BINARY(16)       NOT NULL,
    token_hash      BINARY(32)       NOT NULL,
    auth_stage      TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at      DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_used_at    DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at      DATETIME(6)      NOT NULL,
    elevated_until  DATETIME(6)      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_organization_sessions_token_hash (token_hash),
    KEY ix_organization_sessions_organization (organization_id),
    KEY ix_organization_sessions_expires_at   (expires_at),
    CONSTRAINT fk_organization_sessions_organization FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT ck_organization_sessions_auth_stage   CHECK (auth_stage IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;
