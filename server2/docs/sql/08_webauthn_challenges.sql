-- webauthn_challenges（WebAuthn の challenge）
-- 出典: TableSpec_Auth.md 4.2
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS webauthn_challenges;
CREATE TABLE webauthn_challenges (
    id         BINARY(16)    NOT NULL,
    owner_id   BINARY(16)    NOT NULL,
    purpose    VARCHAR(30)   NOT NULL,
    challenge  VARBINARY(32) NOT NULL,
    expires_at DATETIME(6)   NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_webauthn_challenges_owner_purpose (owner_id, purpose),
    KEY ix_webauthn_challenges_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;
