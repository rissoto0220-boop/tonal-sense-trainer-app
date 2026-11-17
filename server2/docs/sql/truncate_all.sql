-- UECTSTDB のすべてのテーブルのデータを削除する（テーブル自体は残す）。開発用。
-- 警告: すべてのデータ（家族・ユーザ・セッション・所属・利用データなど）が消える。元に戻せない。本番では実行しないこと。
-- 運用担当者の所属は、運用担当者が SQL で作る仕様のため（TableSpec_Belonging.md 7.）、belongings も消える。必要なら作り直すこと。
-- テーブルを追加・削除したときは、このファイルも更新すること（create_all.sql と同じ17テーブル）。
-- 外部キーのチェックを一時的に無効にして実行するため、順序に依存しない。
-- 注意: このファイルは、docs/sql の連番（NN_）のファイルではない。テスト用データベースの作成（TestDatabase）には、使われない。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE belongings;
TRUNCATE TABLE families;
TRUNCATE TABLE users;
TRUNCATE TABLE passkeys;
TRUNCATE TABLE sessions;
TRUNCATE TABLE pending_registrations;
TRUNCATE TABLE rate_limit_counters;
TRUNCATE TABLE webauthn_challenges;
TRUNCATE TABLE belonging_passkeys;
TRUNCATE TABLE belonging_sessions;
TRUNCATE TABLE belonging_invitations;
TRUNCATE TABLE test_sessions;
TRUNCATE TABLE absolute_pitch_responses;
TRUNCATE TABLE relative_pitch_responses;
TRUNCATE TABLE functional_pitch_responses;
TRUNCATE TABLE training_trials;
TRUNCATE TABLE training_trial_responses;

SET FOREIGN_KEY_CHECKS = 1;
