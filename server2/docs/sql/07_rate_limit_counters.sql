-- rate_limit_counters（回数制限のカウンター）
-- 出典: TableSpec_Auth.md 4.1
-- このファイルは単独で実行できる。テーブルがすでに存在する場合は、データごと削除してから作り直す。
-- 外部キーのチェックを一時的に無効にして実行するため、他のテーブルの有無・実行順序に依存しない
-- （ただし、UECTSTDB が先に存在していること。00_database.sql）。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS rate_limit_counters;
CREATE TABLE rate_limit_counters (
    key_hash   BINARY(32)   NOT NULL,
    hit_count  INT UNSIGNED NOT NULL,
    expires_at DATETIME(6)  NOT NULL,
    PRIMARY KEY (key_hash),
    KEY ix_rate_limit_counters_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;
