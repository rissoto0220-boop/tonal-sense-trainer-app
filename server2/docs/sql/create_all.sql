-- データベース UECTSTDB と、すべてのテーブルを作成する。
-- 警告: UECTSTDB がすでに存在する場合は、中のテーブルとデータをすべて削除してから作り直す。
-- このファイルは、00_database.sql と、01_〜17_ の各テーブルのファイルを、この順に連結したもの。
-- DDL を変更したときは、仕様書（TableSpec_*.md）、個別のファイル、このファイルのすべてを更新すること。
-- テーブルを1つだけ作り直す場合は、個別のファイル（01_〜17_）を実行する。
-- 注意: Linux の MySQL（本番など）では、データベース名・テーブル名の大文字・小文字が区別される。UECTSTDB は大文字で指定すること。

DROP DATABASE IF EXISTS UECTSTDB;
CREATE DATABASE UECTSTDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

USE UECTSTDB;

-- 01 belongings（所属）  出典: TableSpec_Belonging.md 2.4
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS belongings;
CREATE TABLE belongings (
    id                       BINARY(16)       NOT NULL,
    name                     VARCHAR(100)     NOT NULL,
    name_kana                VARCHAR(100)     NULL,
    login_id                 VARCHAR(64)      NOT NULL,
    password_hash            VARCHAR(255)     NOT NULL,
    password_change_required TINYINT(1)       NOT NULL DEFAULT 1,
    password_failed_count    TINYINT UNSIGNED NOT NULL DEFAULT 0,
    password_locked_until    DATETIME(6)      NULL,
    is_super                 TINYINT(1)       NOT NULL DEFAULT 0,
    created_at               DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at               DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_belongings_login_id (login_id),
    UNIQUE KEY uq_belongings_name (name),
    UNIQUE KEY uq_belongings_super ((IF(is_super = 1, 1, NULL))),
    CONSTRAINT ck_belongings_name                     CHECK (CHAR_LENGTH(TRIM(name)) >= 1),
    CONSTRAINT ck_belongings_login_id                 CHECK (CHAR_LENGTH(login_id) >= 4),
    CONSTRAINT ck_belongings_is_super                 CHECK (is_super IN (0, 1)),
    CONSTRAINT ck_belongings_password_change_required CHECK (password_change_required IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;

-- 02 families（家族）  出典: TableSpec_Account.md 2.4
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
    belonging_id                    BINARY(16)        NULL,
    belonging_joined_at            DATETIME(6)       NULL,
    created_at                      DATETIME(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at                      DATETIME(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_families_recovery_code_hash (recovery_code_hash),
    KEY ix_families_belonging (belonging_id),
    CONSTRAINT fk_families_belonging FOREIGN KEY (belonging_id) REFERENCES belongings (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;

-- 03 users（ユーザ）  出典: TableSpec_Account.md 3.4
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

-- 04 passkeys（パスキー）  出典: TableSpec_Account.md 4.4
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

-- 05 sessions（セッション）  出典: TableSpec_Auth.md 2.4
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
    id               BINARY(16)  NOT NULL,
    family_id        BINARY(16)  NOT NULL,
    token_hash       BINARY(32)  NOT NULL,
    selected_user_id BINARY(16)  NULL,
    device_label     VARCHAR(50) NOT NULL,
    created_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_used_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at       DATETIME(6) NOT NULL,
    elevated_until   DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sessions_token_hash (token_hash),
    KEY ix_sessions_family        (family_id),
    KEY ix_sessions_selected_user (selected_user_id),
    KEY ix_sessions_expires_at    (expires_at),
    CONSTRAINT fk_sessions_family        FOREIGN KEY (family_id)        REFERENCES families (id) ON DELETE CASCADE,
    CONSTRAINT fk_sessions_selected_user FOREIGN KEY (selected_user_id) REFERENCES users (id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;

-- 06 pending_registrations（仮登録）  出典: TableSpec_Auth.md 3.4
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS pending_registrations;
CREATE TABLE pending_registrations (
    id         BINARY(16)  NOT NULL,
    token_hash BINARY(32)  NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pending_registrations_token_hash (token_hash),
    KEY ix_pending_registrations_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;

-- 07 rate_limit_counters（回数制限のカウンター）  出典: TableSpec_Auth.md 4.1
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

-- 08 webauthn_challenges（WebAuthn の challenge）  出典: TableSpec_Auth.md 4.2
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

-- 09 belonging_passkeys（所属のパスキー）  出典: TableSpec_Belonging.md 3.4
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS belonging_passkeys;
CREATE TABLE belonging_passkeys (
    id              BINARY(16)      NOT NULL,
    belonging_id    BINARY(16)      NOT NULL,
    credential_id   VARBINARY(255)  NOT NULL,
    public_key      VARBINARY(1024) NOT NULL,
    sign_count      INT UNSIGNED    NOT NULL DEFAULT 0,
    transports      VARCHAR(100)    NULL,
    backup_eligible TINYINT(1)      NOT NULL DEFAULT 0,
    name            VARCHAR(50)     NOT NULL,
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_used_at    DATETIME(6)     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_belonging_passkeys_credential_id (credential_id),
    KEY ix_belonging_passkeys_belonging (belonging_id),
    CONSTRAINT fk_belonging_passkeys_belonging FOREIGN KEY (belonging_id) REFERENCES belongings (id) ON DELETE CASCADE,
    CONSTRAINT ck_belonging_passkeys_backup_eligible CHECK (backup_eligible IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;

-- 10 belonging_sessions（所属のセッション）  出典: TableSpec_Belonging.md 4.4
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS belonging_sessions;
CREATE TABLE belonging_sessions (
    id              BINARY(16)       NOT NULL,
    belonging_id    BINARY(16)       NOT NULL,
    token_hash      BINARY(32)       NOT NULL,
    auth_stage      TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at      DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_used_at    DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at      DATETIME(6)      NOT NULL,
    elevated_until  DATETIME(6)      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_belonging_sessions_token_hash (token_hash),
    KEY ix_belonging_sessions_belonging (belonging_id),
    KEY ix_belonging_sessions_expires_at   (expires_at),
    CONSTRAINT fk_belonging_sessions_belonging FOREIGN KEY (belonging_id) REFERENCES belongings (id) ON DELETE CASCADE,
    CONSTRAINT ck_belonging_sessions_auth_stage   CHECK (auth_stage IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;

-- 11 belonging_invitations（招待）  出典: TableSpec_Belonging.md 5.4
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

-- 12 test_sessions（テスト・訓練のセッション）  出典: TableSpec_TestData.md 2.4
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS test_sessions;
CREATE TABLE test_sessions (
    id                 BINARY(16)        NOT NULL,
    user_id            BINARY(16)        NOT NULL,
    test_type          VARCHAR(20)       NOT NULL,
    session_status     VARCHAR(20)       NOT NULL,
    variant            VARCHAR(32)       NULL,
    attempt_number     SMALLINT UNSIGNED NULL,
    planned_count      SMALLINT UNSIGNED NULL,
    started_at         DATETIME(3)       NOT NULL,
    ended_at           DATETIME(3)       NOT NULL,
    utc_offset_minutes SMALLINT          NOT NULL,
    attributes         JSON              NOT NULL,
    received_at        DATETIME(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY ix_test_sessions_user_started (user_id, started_at),
    KEY ix_test_sessions_type_started (test_type, started_at),
    CONSTRAINT ck_test_sessions_test_type CHECK (test_type IN ('absolute_pitch', 'relative_pitch', 'functional_pitch', 'training')),
    CONSTRAINT ck_test_sessions_status CHECK (session_status IN ('completed', 'forced_termination', 'audio_error', 'interrupted')),
    CONSTRAINT ck_test_sessions_status_type CHECK (
        session_status IN ('completed', 'interrupted')
        OR (session_status = 'forced_termination' AND test_type = 'absolute_pitch')
        OR (session_status = 'audio_error' AND test_type IN ('functional_pitch', 'training'))
    ),
    CONSTRAINT ck_test_sessions_period CHECK (ended_at >= started_at),
    CONSTRAINT ck_test_sessions_utc_offset CHECK (utc_offset_minutes BETWEEN -720 AND 840)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;

-- 13 absolute_pitch_responses（絶対音感の回答）  出典: TableSpec_TestData.md 3.3
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS absolute_pitch_responses;
CREATE TABLE absolute_pitch_responses (
    session_id                    BINARY(16)        NOT NULL,
    seq                           SMALLINT UNSIGNED NOT NULL,
    phase                         VARCHAR(8)        NOT NULL,
    question_number               SMALLINT UNSIGNED NOT NULL,
    stimulus_number               SMALLINT UNSIGNED NOT NULL,
    stimulus_note                 VARCHAR(8)        NOT NULL,
    stimulus_filename             VARCHAR(64)       NOT NULL,
    stimulus_started_at           DATETIME(3)       NULL,
    correct_response              VARCHAR(8)        NOT NULL,
    response_note                 VARCHAR(8)        NULL,
    response_at                   DATETIME(3)       NULL,
    response_time_ms              INT UNSIGNED      NULL,
    outcome                       VARCHAR(12)       NOT NULL,
    incorrect_total_after_question SMALLINT UNSIGNED NULL,
    PRIMARY KEY (session_id, seq),
    CONSTRAINT fk_absolute_pitch_responses_session FOREIGN KEY (session_id) REFERENCES test_sessions (id) ON DELETE CASCADE,
    CONSTRAINT ck_absolute_pitch_responses_phase   CHECK (phase IN ('practice', 'test')),
    CONSTRAINT ck_absolute_pitch_responses_outcome CHECK (outcome IN ('correct', 'incorrect', 'timeout', 'interrupted'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;

-- 14 relative_pitch_responses（相対音感の回答）  出典: TableSpec_TestData.md 4.3
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS relative_pitch_responses;
CREATE TABLE relative_pitch_responses (
    session_id           BINARY(16)        NOT NULL,
    seq                  SMALLINT UNSIGNED NOT NULL,
    phase                VARCHAR(8)        NOT NULL,
    question_number      SMALLINT UNSIGNED NOT NULL,
    key_block_number     SMALLINT UNSIGNED NULL,
    key_code             VARCHAR(8)        NOT NULL,
    cadence_filename     VARCHAR(64)       NOT NULL,
    reference_note       VARCHAR(8)        NOT NULL,
    target_note          VARCHAR(8)        NOT NULL,
    interval_semitones   SMALLINT          NOT NULL,
    syllable_code        VARCHAR(16)       NOT NULL,
    display_label        VARCHAR(16)       NOT NULL,
    interval_label       VARCHAR(16)       NULL,
    scale_label          VARCHAR(16)       NULL,
    cadence_started_at   DATETIME(3)       NULL,
    reference_started_at DATETIME(3)       NULL,
    target_started_at    DATETIME(3)       NULL,
    response_code        SMALLINT          NULL,
    response_at          DATETIME(3)       NULL,
    response_time_ms     INT UNSIGNED      NULL,
    outcome              VARCHAR(12)       NOT NULL,
    PRIMARY KEY (session_id, seq),
    CONSTRAINT fk_relative_pitch_responses_session FOREIGN KEY (session_id) REFERENCES test_sessions (id) ON DELETE CASCADE,
    CONSTRAINT ck_relative_pitch_responses_phase   CHECK (phase IN ('practice', 'test')),
    CONSTRAINT ck_relative_pitch_responses_outcome CHECK (outcome IN ('correct', 'incorrect', 'interrupted'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;

-- 15 functional_pitch_responses（調性感の回答）  出典: TableSpec_TestData.md 5.3
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS functional_pitch_responses;
CREATE TABLE functional_pitch_responses (
    session_id            BINARY(16)        NOT NULL,
    trial_number          SMALLINT UNSIGNED NOT NULL,
    first_stimulus_id     VARCHAR(64)       NOT NULL,
    second_stimulus_id    VARCHAR(64)       NOT NULL,
    change_condition      VARCHAR(24)       NOT NULL,
    trial_started_at      DATETIME(3)       NULL,
    melody_change_rating  TINYINT UNSIGNED  NULL,
    harmony_change_rating TINYINT UNSIGNED  NULL,
    overall_change_rating TINYINT UNSIGNED  NULL,
    response_enabled_at   DATETIME(3)       NULL,
    response_confirmed_at DATETIME(3)       NULL,
    response_time_ms      INT UNSIGNED      NULL,
    outcome               VARCHAR(12)       NOT NULL,
    PRIMARY KEY (session_id, trial_number),
    CONSTRAINT fk_functional_pitch_responses_session FOREIGN KEY (session_id) REFERENCES test_sessions (id) ON DELETE CASCADE,
    CONSTRAINT ck_functional_pitch_responses_outcome CHECK (outcome IN ('answered', 'interrupted'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;

-- 16 training_trials（訓練の試行）  出典: TableSpec_TestData.md 6.3
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS training_trials;
CREATE TABLE training_trials (
    session_id            BINARY(16)        NOT NULL,
    trial_number          SMALLINT UNSIGNED NOT NULL,
    stimulus_id           VARCHAR(64)       NOT NULL,
    stimulus_version      VARCHAR(8)        NOT NULL,
    task_template_id      VARCHAR(64)       NOT NULL,
    key_code              VARCHAR(8)        NOT NULL,
    question_replay_count SMALLINT UNSIGNED NOT NULL,
    feedback_replay_count SMALLINT UNSIGNED NOT NULL,
    audio_started_at      DATETIME(3)       NULL,
    audio_ended_at        DATETIME(3)       NULL,
    response_enabled_at   DATETIME(3)       NULL,
    response_submitted_at DATETIME(3)       NULL,
    response_time_ms      INT UNSIGNED      NULL,
    PRIMARY KEY (session_id, trial_number),
    CONSTRAINT fk_training_trials_session FOREIGN KEY (session_id) REFERENCES test_sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;

-- 17 training_trial_responses（訓練の試行の回答（回答対象ごと））  出典: TableSpec_TestData.md 7.3
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS training_trial_responses;
CREATE TABLE training_trial_responses (
    session_id          BINARY(16)        NOT NULL,
    trial_number        SMALLINT UNSIGNED NOT NULL,
    target_id           VARCHAR(32)       NOT NULL,
    correct_answer_code VARCHAR(16)       NOT NULL,
    response_code       VARCHAR(16)       NULL,
    outcome             VARCHAR(10)       NOT NULL,
    PRIMARY KEY (session_id, trial_number, target_id),
    CONSTRAINT fk_training_trial_responses_trial FOREIGN KEY (session_id, trial_number) REFERENCES training_trials (session_id, trial_number) ON DELETE CASCADE,
    CONSTRAINT ck_training_trial_responses_outcome CHECK (outcome IN ('correct', 'incorrect', 'giveup')),
    CONSTRAINT ck_training_trial_responses_giveup  CHECK ((outcome = 'giveup') = (response_code IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;
