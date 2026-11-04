-- データベース UECTSTDB と、すべてのテーブルを作成する。
-- 警告: UECTSTDB がすでに存在する場合は、中のテーブルとデータをすべて削除してから作り直す。
-- このファイルは、00_database.sql と、01_〜11_ の各テーブルのファイルを、この順に連結したもの。
-- DDL を変更したときは、仕様書（TableSpec_*.md）、個別のファイル、このファイルのすべてを更新すること。
-- テーブルを1つだけ作り直す場合は、個別のファイル（01_〜11_）を実行する。
-- 注意: Linux の MySQL（本番など）では、データベース名・テーブル名の大文字・小文字が区別される。UECTSTDB は大文字で指定すること。

DROP DATABASE IF EXISTS UECTSTDB;
CREATE DATABASE UECTSTDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

USE UECTSTDB;

-- 01 organizations（組織）  出典: TableSpec_Organization.md 2.4
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
    organization_id                 BINARY(16)        NULL,
    organization_joined_at          DATETIME(6)       NULL,
    created_at                      DATETIME(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at                      DATETIME(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_families_recovery_code_hash (recovery_code_hash),
    KEY ix_families_organization (organization_id),
    CONSTRAINT fk_families_organization FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE SET NULL
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

-- 09 organization_passkeys（組織のパスキー）  出典: TableSpec_Organization.md 3.4
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS organization_passkeys;
CREATE TABLE organization_passkeys (
    id              BINARY(16)      NOT NULL,
    organization_id BINARY(16)      NOT NULL,
    credential_id   VARBINARY(255)  NOT NULL,
    public_key      VARBINARY(1024) NOT NULL,
    sign_count      INT UNSIGNED    NOT NULL DEFAULT 0,
    transports      VARCHAR(100)    NULL,
    backup_eligible TINYINT(1)      NOT NULL DEFAULT 0,
    name            VARCHAR(50)     NOT NULL,
    created_at      DATETIME(6)     NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_used_at    DATETIME(6)     NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_organization_passkeys_credential_id (credential_id),
    KEY ix_organization_passkeys_organization (organization_id),
    CONSTRAINT fk_organization_passkeys_organization FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT ck_organization_passkeys_backup_eligible CHECK (backup_eligible IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;

-- 10 organization_sessions（組織のセッション）  出典: TableSpec_Organization.md 4.4
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS organization_sessions;
CREATE TABLE organization_sessions (
    id              BINARY(16)       NOT NULL,
    organization_id BINARY(16)       NOT NULL,
    token_hash      BINARY(32)       NOT NULL,
    auth_stage      TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at      DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_used_at    DATETIME(6)      NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at      DATETIME(6)      NOT NULL,
    elevated_until  DATETIME(6)      NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_organization_sessions_token_hash (token_hash),
    KEY ix_organization_sessions_organization (organization_id),
    KEY ix_organization_sessions_expires_at   (expires_at),
    CONSTRAINT fk_organization_sessions_organization FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT ck_organization_sessions_auth_stage   CHECK (auth_stage IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
SET FOREIGN_KEY_CHECKS = 1;

-- 11 organization_invitations（招待）  出典: TableSpec_Organization.md 5.4
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
