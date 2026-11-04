-- organizations（組織）
-- 出典: TableSpec_Organization.md 2.4
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS organizations;
CREATE TABLE organizations (
    id                       BINARY(16)       NOT NULL,
    name                     VARCHAR(100)     NOT NULL,
    login_id                 VARCHAR(64)      NOT NULL,
    password_hash            VARCHAR(255)     NOT NULL,
    password_change_required TINYINT(1)       NOT NULL DEFAULT 1,
    password_failed_count    TINYINT UNSIGNED NOT NULL DEFAULT 0,
    password_locked_until    DATETIME(6)      NULL,
    is_super                 TINYINT(1)       NOT NULL DEFAULT 0,
    created_at               DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at               DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_organizations_login_id (login_id),
    UNIQUE KEY uq_organizations_name (name),
    UNIQUE KEY uq_organizations_super ((IF(is_super = 1, 1, NULL))),
    CONSTRAINT ck_organizations_name                     CHECK (CHAR_LENGTH(TRIM(name)) >= 1),
    CONSTRAINT ck_organizations_login_id                 CHECK (CHAR_LENGTH(login_id) >= 4),
    CONSTRAINT ck_organizations_is_super                 CHECK (is_super IN (0, 1)),
    CONSTRAINT ck_organizations_password_change_required CHECK (password_change_required IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;
