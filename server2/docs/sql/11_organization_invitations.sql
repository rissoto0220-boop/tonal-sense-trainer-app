-- organization_invitations（招待）
-- 出典: TableSpec_Organization.md 5.4
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS organization_invitations;
CREATE TABLE organization_invitations (
    id              BINARY(16)  NOT NULL,
    organization_id BINARY(16)  NOT NULL,
    token_hash      BINARY(32)  NOT NULL,
    expires_at      DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_organization_invitations_token_hash (token_hash),
    KEY ix_organization_invitations_organization (organization_id),
    KEY ix_organization_invitations_expires_at   (expires_at),
    CONSTRAINT fk_organization_invitations_organization FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;
