-- belonging_invitations（招待）
-- 出典: TableSpec_Belonging.md 5.4
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS belonging_invitations;
CREATE TABLE belonging_invitations (
    id              BINARY(16)  NOT NULL,
    belonging_id    BINARY(16)  NOT NULL,
    token_hash      BINARY(32)  NOT NULL,
    expires_at      DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_belonging_invitations_token_hash (token_hash),
    KEY ix_belonging_invitations_belonging (belonging_id),
    KEY ix_belonging_invitations_expires_at   (expires_at),
    CONSTRAINT fk_belonging_invitations_belonging FOREIGN KEY (belonging_id) REFERENCES belongings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;
