-- passkeys（パスキー）
-- 出典: TableSpec_Account.md 4.4
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS passkeys;
CREATE TABLE passkeys (
    id              BINARY(16)      NOT NULL,
    family_id       BINARY(16)      NOT NULL,
    credential_id   VARBINARY(255)  NOT NULL,
    public_key      VARBINARY(1024) NOT NULL,
    sign_count      INT UNSIGNED    NOT NULL DEFAULT 0,
    transports      VARCHAR(100)    NULL,
    backup_eligible TINYINT(1)      NOT NULL DEFAULT 0,
    name            VARCHAR(50)     NOT NULL,
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_used_at    DATETIME(6)     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_passkeys_credential_id (credential_id),
    KEY ix_passkeys_family (family_id),
    CONSTRAINT fk_passkeys_family FOREIGN KEY (family_id) REFERENCES families (id) ON DELETE CASCADE,
    CONSTRAINT ck_passkeys_backup_eligible CHECK (backup_eligible IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;
