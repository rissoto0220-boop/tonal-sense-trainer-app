-- users（ユーザ）
-- 出典: TableSpec_Account.md 3.4
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id            BINARY(16)       NOT NULL,
    family_id     BINARY(16)       NOT NULL,
    name          VARCHAR(20)      NOT NULL,
    slot          TINYINT UNSIGNED NOT NULL,
    display_order TINYINT UNSIGNED NOT NULL,
    is_superuser  TINYINT(1)       NOT NULL DEFAULT 0,
    created_at    DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at    DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_family_name (family_id, name),
    UNIQUE KEY uq_users_family_slot (family_id, slot),
    UNIQUE KEY uq_users_superuser   ((IF(is_superuser = 1, family_id, NULL))),
    CONSTRAINT fk_users_family FOREIGN KEY (family_id) REFERENCES families (id) ON DELETE CASCADE,
    CONSTRAINT ck_users_slot          CHECK (slot BETWEEN 1 AND 4),
    CONSTRAINT ck_users_display_order CHECK (display_order BETWEEN 1 AND 4),
    CONSTRAINT ck_users_is_superuser  CHECK (is_superuser IN (0, 1)),
    CONSTRAINT ck_users_name          CHECK (CHAR_LENGTH(TRIM(name)) >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;
