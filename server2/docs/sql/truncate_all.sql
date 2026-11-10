-- UECTSTDB のすべてのテーブルのデータを削除する（テーブル自体は残す）。開発用。
-- 警告: すべてのデータ（家族・ユーザ・セッション・組織・利用データなど）が消える。元に戻せない。本番では実行しないこと。
-- 運用担当者の組織は、運用担当者が SQL で作る仕様のため（TableSpec_Organization.md 7.）、organizations も消える。必要なら作り直すこと。
-- テーブルを追加・削除したときは、このファイルも更新すること（create_all.sql と同じ17テーブル）。
-- 外部キーのチェックを一時的に無効にして実行するため、順序に依存しない。
-- 注意: このファイルは、docs/sql の連番（NN_）のファイルではない。テスト用データベースの作成（TestDatabase）には、使われない。

USE UECTSTDB;

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE organizations;
TRUNCATE TABLE families;
TRUNCATE TABLE users;
TRUNCATE TABLE passkeys;
TRUNCATE TABLE sessions;
TRUNCATE TABLE pending_registrations;
TRUNCATE TABLE rate_limit_counters;
TRUNCATE TABLE webauthn_challenges;
TRUNCATE TABLE organization_passkeys;
TRUNCATE TABLE organization_sessions;
TRUNCATE TABLE organization_invitations;
TRUNCATE TABLE test_sessions;
TRUNCATE TABLE absolute_pitch_responses;
TRUNCATE TABLE relative_pitch_responses;
TRUNCATE TABLE functional_pitch_responses;
TRUNCATE TABLE training_trials;
TRUNCATE TABLE training_trial_responses;

SET FOREIGN_KEY_CHECKS = 1;
