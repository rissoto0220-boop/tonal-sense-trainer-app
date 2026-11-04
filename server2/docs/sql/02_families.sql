-- families（家族）
-- 出典: TableSpec_Account.md 2.4
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS families;
CREATE TABLE families (
    id                              BINARY(16)        NOT NULL,
    recovery_code_hash              BINARY(32)        NOT NULL,
    recovery_code_key_id            SMALLINT UNSIGNED NOT NULL,
    recovery_code_issued_at         DATETIME(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    superuser_password_hash         VARCHAR(255)      NULL,
    superuser_password_failed_count TINYINT UNSIGNED  NOT NULL DEFAULT 0,
    superuser_password_locked_until DATETIME(6)       NULL,
    organization_id                 BINARY(16)        NULL,
    organization_joined_at          DATETIME(6)       NULL,
    created_at                      DATETIME(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at                      DATETIME(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_families_recovery_code_hash (recovery_code_hash),
    KEY ix_families_organization (organization_id),
    CONSTRAINT fk_families_organization FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;
