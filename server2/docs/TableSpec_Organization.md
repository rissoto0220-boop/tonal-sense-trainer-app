# テーブル仕様書：組織

基本方針（BasicPolicy.md）の「10. 組織」「11. 招待メールを受け取ったユーザの操作」に基づき、組織・組織のパスキー・組織のセッション・招待を管理するテーブルを定義する。
家族・ユーザ・パスキーのテーブルは TableSpec_Account.md、家族のセッション・仮登録・回数制限・challenge のテーブルは TableSpec_Auth.md を参照。

## 0. 共通事項

- 共通事項（MySQL 8.4・主キー・日時の型・照合順序・個人情報を持たないこと）は TableSpec_Account.md の「0. 共通事項」に従う。
- トークンの扱いは TableSpec_Auth.md の「0. 共通事項」に従う（256bit 以上の乱数を生成し、SHA-256 のハッシュのみを `BINARY(32)` で保存する）。
- 組織は個人情報を持たない。保持するのは、組織名・ログインID・パスワードのハッシュなどに限る。担当者のメールアドレスは保持しない（基本方針 10.1）。
- 家族の認証（`sessions`・`__Host-sid`）とは別の経路とし、組織のセッションは `organization_sessions`・`__Host-org-sid` で管理する（基本方針 10.3）。

## 1. テーブル一覧

| テーブル名 | 論理名 | 概要 |
|---|---|---|
| `organizations` | 組織 | 組織のログインアカウント。研究者（スーパー）の組織は `is_super = 1` |
| `organization_passkeys` | 組織のパスキー | 研究者の組織のログインで、パスワードに加えて確認に使うパスキー（WebAuthn） |
| `organization_sessions` | 組織のセッション | 組織のログイン状態。認証トークンのハッシュを持つ |
| `organization_invitations` | 招待 | 招待URLのトークンのハッシュと有効期限のみを持つ |

```
organizations 1 ──── 0..n families（TableSpec_Account.md。所属。families.organization_id）
organizations 1 ──── 0..n organization_passkeys
organizations 1 ──── 0..n organization_sessions
organizations 1 ──── 0..n organization_invitations
```

- 作成の順序：`organizations` を最初に作る（`families`・`organization_*` が参照するため）。

## 2. organizations（組織）

### 2.1 カラム

| カラム名 | 型 | NULL | 既定値 | 説明 |
|---|---|---|---|---|
| `id` | `BINARY(16)` | NOT NULL | | 主キー（UUID v7） |
| `name` | `VARCHAR(100)` | NOT NULL | | 組織名。招待ページに、所属先として表示する。文字数は文字単位で数える |
| `login_id` | `VARCHAR(64)` | NOT NULL | | ログインID。英小文字・数字・`.`・`_`・`-` のみ（ApiSpec_Organization.md 0.5） |
| `password_hash` | `VARCHAR(255)` | NOT NULL | | パスワードのハッシュ（Argon2id の PHC 形式の文字列） |
| `password_change_required` | `TINYINT(1)` | NOT NULL | `1` | 1なら、次のログインでパスワードの変更を求める。発行時・再発行時に1、変更後に0 |
| `password_failed_count` | `TINYINT UNSIGNED` | NOT NULL | `0` | パスワードの連続失敗回数 |
| `password_locked_until` | `DATETIME(6)` | NULL | | パスワードの入力をロックする期限。ロックしていなければ NULL |
| `is_super` | `TINYINT(1)` | NOT NULL | `0` | 研究者（スーパー）の組織なら1。全体で1つだけ |
| `created_at` | `DATETIME(6)` | NOT NULL | `CURRENT_TIMESTAMP(6)` | 登録日時 |
| `updated_at` | `DATETIME(6)` | NOT NULL | `CURRENT_TIMESTAMP(6)` | 更新日時（`ON UPDATE CURRENT_TIMESTAMP(6)`） |

### 2.2 制約・インデックス

| 種類 | 名前 | 対象 | 説明 |
|---|---|---|---|
| PRIMARY KEY | | `id` | |
| UNIQUE | `uq_organizations_login_id` | `login_id` | ログイン時に、ログインIDで検索する |
| UNIQUE | `uq_organizations_name` | `name` | 組織名の重複を禁止する（招待ページで区別できなくなるため） |
| UNIQUE | `uq_organizations_super` | `((IF(is_super = 1, 1, NULL)))` | 関数インデックス。研究者の組織が2つ以上にならないことを保証する（NULL は重複とみなされない） |
| CHECK | `ck_organizations_name` | `CHAR_LENGTH(TRIM(name)) >= 1` | 空白のみの組織名を禁止する |
| CHECK | `ck_organizations_login_id` | `CHAR_LENGTH(login_id) >= 4` | |
| CHECK | `ck_organizations_is_super` | `is_super IN (0, 1)` | |
| CHECK | `ck_organizations_password_change_required` | `password_change_required IN (0, 1)` | |

### 2.3 補足

- ログインID
  - 保存前に、アプリケーションで小文字に正規化する。照合順序は `utf8mb4_bin` のため、正規化後の文字列が完全に一致する場合のみ重複とみなす。
- パスワード
  - ハッシュは Argon2id（OWASP の推奨値：メモリ 19 MiB、反復2回、並列度1）とする。家族のスーパーユーザのパスワード（TableSpec_Account.md 2.3）と同じ扱い。
  - 失敗回数とロック（組織単位の試行回数制限。基本方針 10.3）
    - 失敗するたびに `password_failed_count` を1増やす。
    - 5回に達したら、`password_locked_until` を現在時刻の15分後とし、`password_failed_count` を0に戻す。
    - ロック中（`password_locked_until` が現在時刻より後）は、パスワードを照合せずに拒否する。
    - 成功したら `password_failed_count` を0に戻す。
    - 同時に入力されても回数を正しく数えるため、照合時は組織の行を `SELECT ... FOR UPDATE` でロックする。
  - 研究者の組織が、ロックされても、パスワードの再発行（運用者の SQL）で復旧できる（7.）。
  - 発行時・再発行時は、ランダムな初期パスワードを作って保存し、`password_change_required = 1` にする。初期パスワードは、画面に1回だけ表示する。
- 研究者（スーパー）の組織
  - `is_super = 1` は、全体で1つだけ。最初の1つは、運用者が SQL で作成する（7.）。
  - 研究者の組織は削除できない（アプリケーションで保証する）。`is_super` の値は、アプリケーションからは変更しない。
- 組織の削除
  - 物理削除とする。`families.organization_id` は `ON DELETE SET NULL` で NULL になり、所属していた家族は個人ユーザになる（TableSpec_Account.md 2.2）。
  - `organization_passkeys`・`organization_sessions`・`organization_invitations` は `ON DELETE CASCADE` で削除される。
  - 利用データは、削除しない（TableSpec_Account.md 5.2）。

### 2.4 DDL

```sql
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
```

## 3. organization_passkeys（組織のパスキー）

基本方針 10.3 に基づき、研究者の組織のログインで、パスワードに加えて確認に使うパスキー（WebAuthn の公開鍵クレデンシャル）を管理する。家族のパスキー（TableSpec_Account.md 4.）と同じ考え方で、別のテーブルとする。

### 3.1 カラム

| カラム名 | 型 | NULL | 既定値 | 説明 |
|---|---|---|---|---|
| `id` | `BINARY(16)` | NOT NULL | | 主キー（UUID v7）。一覧からの削除の指定に使う |
| `organization_id` | `BINARY(16)` | NOT NULL | | 所属する組織（`organizations.id`） |
| `credential_id` | `VARBINARY(255)` | NOT NULL | | WebAuthn のクレデンシャル ID（認証器が生成する） |
| `public_key` | `VARBINARY(1024)` | NOT NULL | | 公開鍵（COSE 形式） |
| `sign_count` | `INT UNSIGNED` | NOT NULL | `0` | 署名カウンタ（複製された認証器の検出に使う） |
| `transports` | `VARCHAR(100)` | NULL | | 認証器の通信方式（カンマ区切り）。確認時のヒントとして返す |
| `backup_eligible` | `TINYINT(1)` | NOT NULL | `0` | 同期パスキーなら1 |
| `name` | `VARCHAR(50)` | NOT NULL | | 一覧に表示する名前（例：「Mac / Safari で登録」）。登録時の User-Agent から作る |
| `created_at` | `DATETIME(6)` | NOT NULL | `CURRENT_TIMESTAMP(6)` | 登録日時 |
| `last_used_at` | `DATETIME(6)` | NULL | | 最終使用日時。未使用は NULL |

### 3.2 制約・インデックス

| 種類 | 名前 | 対象 | 説明 |
|---|---|---|---|
| PRIMARY KEY | | `id` | |
| UNIQUE | `uq_organization_passkeys_credential_id` | `credential_id` | 確認時に、認証器が返したクレデンシャル ID で検索する |
| FOREIGN KEY | `fk_organization_passkeys_organization` | `organization_id` → `organizations.id` | `ON DELETE CASCADE` |
| INDEX | `ix_organization_passkeys_organization` | `organization_id` | 組織のパスキーの一覧 |
| CHECK | `ck_organization_passkeys_backup_eligible` | `backup_eligible IN (0, 1)` | |

### 3.3 補足

- 現時点では、研究者の組織（`is_super = 1`）のみがパスキーを登録・使用する（基本方針 10.3）。通常の組織には、求めない。
- 上限は組織あたり10件とする（アプリケーションで保証する）。
- 研究者の組織は、パスキーを1件以上登録していなければならない。最後の1件は削除できない（アプリケーションで保証する）。
- WebAuthn のユーザ ID（user handle）には `organizations.id`（16バイト）を使う。個人情報を含まない。
- 署名カウンタ・challenge の扱いは、家族のパスキーと同じ（TableSpec_Account.md 4.3、TableSpec_Auth.md 4.2。`purpose` は `org_login`・`org_registration`）。
- パスキーはサイトのドメイン（RP ID）に結び付くため、運用開始後にドメインを変更すると、すべてのパスキーが使えなくなる。

### 3.4 DDL

```sql
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
```

## 4. organization_sessions（組織のセッション）

### 4.1 カラム

| カラム名 | 型 | NULL | 既定値 | 説明 |
|---|---|---|---|---|
| `id` | `BINARY(16)` | NOT NULL | | 主キー（UUID v7）。パスキーの challenge の `owner_id` に使う |
| `organization_id` | `BINARY(16)` | NOT NULL | | ログイン中の組織（`organizations.id`） |
| `token_hash` | `BINARY(32)` | NOT NULL | | 認証トークンの SHA-256。Cookie の値はトークン本体 |
| `auth_stage` | `TINYINT UNSIGNED` | NOT NULL | `0` | ログインの段階。0：パスワードの確認済み（パスキーの確認が未了）、1：ログイン完了 |
| `created_at` | `DATETIME(6)` | NOT NULL | `CURRENT_TIMESTAMP(6)` | ログイン日時（パスワードを確認した日時） |
| `last_used_at` | `DATETIME(6)` | NOT NULL | `CURRENT_TIMESTAMP(6)` | 最終利用日時 |
| `expires_at` | `DATETIME(6)` | NOT NULL | | 有効期限（2.3 参照） |
| `elevated_until` | `DATETIME(6)` | NULL | | 破壊的な操作を行える期限（パスワードを再入力してから5分間）。確認していなければ NULL |

### 4.2 制約・インデックス

| 種類 | 名前 | 対象 | 説明 |
|---|---|---|---|
| PRIMARY KEY | | `id` | |
| UNIQUE | `uq_organization_sessions_token_hash` | `token_hash` | リクエストのたびに、Cookie のトークンのハッシュで検索する |
| FOREIGN KEY | `fk_organization_sessions_organization` | `organization_id` → `organizations.id` | `ON DELETE CASCADE` |
| INDEX | `ix_organization_sessions_organization` | `organization_id` | 組織のすべてのセッションの失効（パスワード変更時など） |
| INDEX | `ix_organization_sessions_expires_at` | `expires_at` | 期限切れセッションの定期削除 |
| CHECK | `ck_organization_sessions_auth_stage` | `auth_stage IN (0, 1)` | |

### 4.3 補足

- 発行
  - パスワードの確認に成功したときに、1行作成する。
  - 通常の組織は `auth_stage = 1`（ログイン完了）で作成する。研究者の組織は `auth_stage = 0` で作成し、パスキーの確認に成功したら 1 に更新する（ApiSpec_Organization.md 1.）。
  - 既存の Cookie に有効なセッションがある場合は、そのセッションを削除してから作成する。
- 認証（リクエストごと）
  - Cookie のトークンを SHA-256 でハッシュ化し、`token_hash` で検索する。見つからない、または `expires_at` を過ぎている場合は、未ログインとして扱う。
  - `auth_stage = 0` のセッションは、パスキーの確認・登録、ログアウトなど、限られた API だけを使える（ApiSpec_Organization.md 0.2）。
- 有効期限（初期値。9. 未決事項）
  - `auth_stage = 0`：作成から10分。10分以内にパスキーの確認を完了しなければ、ログインし直す。
  - `auth_stage = 1`：最終利用から8時間（スライディング）。ただし、作成から24時間を超えない。更新は前回の更新から5分以上経過した場合のみ行う。
  - 組織のセッションの Cookie は、有効期限を持たないセッション Cookie とする（ブラウザを閉じると消える）。
- 破壊的な操作の確認
  - 組織の削除など、取り消せない操作は、パスワードを再入力して確認してから5分間のみ実行できる（`elevated_until`。ApiSpec_Organization.md 0.4）。
- ログアウト・失効
  - ログアウトは、該当の行を物理削除する。
  - パスワードの変更時は、同じトランザクション内で、操作中の端末以外の同じ組織の行を削除する。
- 期限切れの行は、定期的に削除する（TableSpec_Auth.md 5.）。

### 4.4 DDL

```sql
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
```

## 5. organization_invitations（招待）

### 5.1 カラム

| カラム名 | 型 | NULL | 既定値 | 説明 |
|---|---|---|---|---|
| `id` | `BINARY(16)` | NOT NULL | | 主キー（UUID v7） |
| `organization_id` | `BINARY(16)` | NOT NULL | | 招待した組織（`organizations.id`） |
| `token_hash` | `BINARY(32)` | NOT NULL | | 招待URLのトークンの SHA-256 |
| `expires_at` | `DATETIME(6)` | NOT NULL | | 有効期限（作成から7日を目安とする） |

### 5.2 制約・インデックス

| 種類 | 名前 | 対象 | 説明 |
|---|---|---|---|
| PRIMARY KEY | | `id` | |
| UNIQUE | `uq_organization_invitations_token_hash` | `token_hash` | 招待URLのアクセス時に、トークンのハッシュで検索する |
| FOREIGN KEY | `fk_organization_invitations_organization` | `organization_id` → `organizations.id` | `ON DELETE CASCADE`（組織を削除すると、未使用の招待も削除する） |
| INDEX | `ix_organization_invitations_organization` | `organization_id` | 組織ごとの未使用の招待の件数、取り消し |
| INDEX | `ix_organization_invitations_expires_at` | `expires_at` | 期限切れデータの定期削除 |

### 5.3 補足

- 保存するのは、トークンのハッシュ・組織・有効期限のみとする（基本方針 10.5）。招待先のメールアドレスは保存しない。
- 作成日時（`created_at`）は持たない。メール送信サービスの送信ログと突き合わせる手がかりを増やさないため（`pending_registrations` と同じ。TableSpec_Auth.md 3.3）。必要であれば `expires_at` から逆算できる。
  - 主キーの UUID v7 にも生成時刻が含まれる。気になる場合は、招待の主キーのみ UUID v4（ランダム）とする（9. 未決事項）。
- 招待は1回限り有効（使い切り）とする。
- 照合（基本方針 11.1）
  - 照合の API（ApiSpec_Auth.md 10.1）では、`token_hash` と `expires_at` で確認するのみで、行は変更しない。
- 消費（基本方針 11.3、11.4）
  - 新規登録（ApiSpec_Auth.md 1.3）と、登録済みの家族の所属（ApiSpec_Auth.md 10.3）のトランザクションの中で、次のように取り出して削除する。

    ```sql
    SELECT id, organization_id FROM organization_invitations
     WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(6) FOR UPDATE;

    DELETE FROM organization_invitations WHERE id = ?;
    ```

    - 行が取り出せなければ、招待が無効（使用済み・期限切れ）として扱う。
    - 同じ招待で同時に実行された場合、行ロックにより、片方だけが取り出せる。
    - 家族の作成・所属の更新に失敗した場合はロールバックし、招待の行も元に戻す（同じURLから再試行できる）。
    - すでに同じ組織に所属している家族が、その組織の招待を使った場合は、招待を消費せずにロールバックする（基本方針 11.4）。
- 未使用の招待の件数は、`SELECT COUNT(*) ... WHERE organization_id = ? AND expires_at > UTC_TIMESTAMP(6)` で求める（組織の画面に表示する）。
- 期限切れの行は、定期的に削除する（TableSpec_Auth.md 5.）。

### 5.4 DDL

```sql
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
```

## 6. 利用データの参照権限

基本方針 10.4 の参照範囲を、データベースで実現する方法を定める。利用データのテーブル（別途定義する）は、`user_id`（`users.id` の値、外部キーなし）を持つ（TableSpec_Account.md 5.2）。

| 参照する者 | 参照できる利用データ | 条件（`d` は利用データのテーブル） |
|---|---|---|
| 家族のユーザ | 自分の家族の、現存するユーザのデータ | `d.user_id` が、ログイン中の家族の `users.id` のいずれか |
| 通常の組織 | 現在その組織に所属している家族の、現存するユーザのデータ | 下記のクエリ |
| 研究者（スーパー） | すべて（個人ユーザ・退会した家族・削除されたユーザのデータを含む） | 条件なし |

通常の組織の絞り込み：

```sql
SELECT d.*
  FROM <利用データのテーブル> d
  JOIN users    u ON u.id = d.user_id
  JOIN families f ON f.id = u.family_id
 WHERE f.organization_id = :organization_id;
```

- 内部結合のため、ユーザの削除・退会（`users` の行がない）のデータは、通常の組織の結果に含まれない。研究者のみが参照できる（基本方針 10.4）。
- 個人ユーザ（`f.organization_id IS NULL`）のデータも、通常の組織の結果に含まれない。
- 所属・解除・組織の削除は、`families.organization_id` の更新で反映される。過去のデータも、現在の所属で参照できる組織が決まる。
  - 所属前のデータを組織に見せない場合は、`d` の作成日時と `f.organization_joined_at` を比べる条件を足す（9. 未決事項）。
- 利用データのテーブルには、`user_id` のインデックスが必要である（TableSpec_Account.md 5.2）。
- 組織が参照できるのは、利用データと、ユーザ名（`users.name`）のみ。`families`・`sessions`・`passkeys` の内容は参照できない。

## 7. 最初の研究者の組織の作成と運用の SQL

研究者の組織は、自己登録できない。最初の1つは、運用者がデータベースに直接作成する。

1. 運用者の端末で、初期パスワードのハッシュを作る。パスワードをコマンドラインに直接書かない（シェルの履歴に残るため）。

   ```bash
   php -r 'echo password_hash(trim(fgets(STDIN)), PASSWORD_ARGON2ID, ["memory_cost" => 19456, "time_cost" => 2, "threads" => 1]), PHP_EOL;'
   ```

   - 標準入力にパスワードを入力して、Enter を押す。出力されたハッシュ（`$argon2id$...`）を、次の SQL に入れる。
2. UUID v7 を生成する（MySQL の `UUID()` は UUID v7 ではないため使わない）。アプリケーションの管理用スクリプトなどで生成する。
3. 次の SQL を実行する。

   ```sql
   INSERT INTO organizations (id, name, login_id, password_hash, password_change_required, is_super)
   VALUES (UUID_TO_BIN('<UUID v7>'), '研究者', 'researcher', '<ハッシュ>', 1, 1);
   ```

4. 研究者の担当者が、最初にログインする。パスワードの変更、続いてパスキーの登録を行う（ApiSpec_Organization.md 1.）。

運用で SQL を使う場面：

| 場面 | SQL |
|---|---|
| 研究者がパスキーを紛失した | `DELETE FROM organization_passkeys WHERE organization_id = (SELECT id FROM organizations WHERE is_super = 1);`（次のログインで、パスキーの登録からやり直す） |
| 研究者のパスワードの再発行・ロックの解除 | `UPDATE organizations SET password_hash = '<ハッシュ>', password_change_required = 1, password_failed_count = 0, password_locked_until = NULL WHERE is_super = 1;` |

- パスキーの削除は、研究者のアカウントを守る最後の手段である。実行できる運用者を限定し、実行の記録を残す。

## 8. 定期処理

期限切れの組織のセッション・招待の削除は、TableSpec_Auth.md の「5. 定期処理」に含める。

## 9. 未決事項

- 組織のセッションの有効期限（`auth_stage = 1` は最終利用から8時間・最大24時間としている。`auth_stage = 0` は10分）
- 通常の組織にも、パスキーを任意で登録できるようにするか
- 組織名の最大文字数（仮に100文字としている）
- 招待の主キーを UUID v4 にするか（UUID v7 に含まれる生成時刻を避けるか）
- 所属前に作られた利用データを、組織に参照させるか（6.。現状は参照できる）
- 研究者の組織のパスワードがロックされた場合の運用（攻撃者がロックを繰り返すと、研究者がログインできなくなる。7. の SQL で復旧できるが、頻発する場合の対策）
