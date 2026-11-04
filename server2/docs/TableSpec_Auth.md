# テーブル仕様書：セッション・仮登録・回数制限・challenge

基本方針（BasicPolicy.md）の「3. 登録フロー」「4. 認証」に基づき、セッション・仮登録・回数制限のカウンター・WebAuthn の challenge を管理するテーブルを定義する。
家族・ユーザのテーブルは TableSpec_Account.md、組織のテーブルは TableSpec_Organization.md を参照。

## 0. 共通事項

- 共通事項（MySQL 8.4・主キー・日時の型・照合順序・個人情報を持たないこと）は TableSpec_Account.md の「0. 共通事項」に従う。
- トークンの扱い
  - 認証トークン・仮登録トークンは、暗号論的に安全な乱数で 256bit 以上を生成する。
  - トークン本体は保存せず、SHA-256 のハッシュのみを `BINARY(32)` で保存する。
    - 256bit の乱数であれば総当たりは不可能なため、復旧コード（HMAC-SHA256、TableSpec_Account.md 2.3）と違い鍵は不要。
- クライアントの IP アドレス・User-Agent の全文は保存しない（基本方針 4.4）。
  - 例外として、回数制限のため、IP アドレスの鍵付きハッシュ（HMAC）を、窓の長さの間だけ保存する（4.1）。元の IP アドレスは復元できない。

## 1. テーブル一覧

| テーブル名 | 論理名 | 概要 |
|---|---|---|
| `sessions` | セッション | 端末（ブラウザ）ごとのログイン状態。認証トークンのハッシュを持つ |
| `pending_registrations` | 仮登録 | 本登録URLのトークンのハッシュと有効期限のみを持つ |
| `rate_limit_counters` | 回数制限のカウンター | 短時間の回数の集計。キーはハッシュ化して持つ |
| `webauthn_challenges` | WebAuthn の challenge | パスキーの登録・確認で使う、使い捨ての乱数。5分で失効する |

```
families 1 ──── 0..n sessions
users    1 ──── 0..n sessions（選択中のユーザ）

pending_registrations（他のテーブルとの関連なし）
rate_limit_counters（他のテーブルとの関連なし）
webauthn_challenges（owner_id は sessions.id または organization_sessions.id。外部キーなし）
```

## 2. sessions（セッション）

### 2.1 カラム

| カラム名 | 型 | NULL | 既定値 | 説明 |
|---|---|---|---|---|
| `id` | `BINARY(16)` | NOT NULL | | 主キー（UUID v7）。端末一覧で、ログアウトさせる端末の指定に使う |
| `family_id` | `BINARY(16)` | NOT NULL | | ログイン中の家族（`families.id`） |
| `token_hash` | `BINARY(32)` | NOT NULL | | 認証トークンの SHA-256。Cookie の値はトークン本体 |
| `selected_user_id` | `BINARY(16)` | NULL | | この端末で最後に選択されたユーザ（`users.id`）。未選択は NULL |
| `device_label` | `VARCHAR(50)` | NOT NULL | | 端末一覧に表示する名前（例：「iPhone / Safari」） |
| `created_at` | `DATETIME(6)` | NOT NULL | `CURRENT_TIMESTAMP(6)` | ログイン日時 |
| `last_used_at` | `DATETIME(6)` | NOT NULL | `CURRENT_TIMESTAMP(6)` | 最終利用日時 |
| `expires_at` | `DATETIME(6)` | NOT NULL | | 有効期限。利用のたびに延長する（スライディング更新） |
| `elevated_until` | `DATETIME(6)` | NULL | | 家族向けの重要な操作を行える期限（スーパーユーザのパスワードなどで確認してから5分間）。確認していなければ NULL |

### 2.2 制約・インデックス

| 種類 | 名前 | 対象 | 説明 |
|---|---|---|---|
| PRIMARY KEY | | `id` | |
| UNIQUE | `uq_sessions_token_hash` | `token_hash` | リクエストのたびに、Cookie のトークンのハッシュで検索する |
| FOREIGN KEY | `fk_sessions_family` | `family_id` → `families.id` | `ON DELETE CASCADE` |
| FOREIGN KEY | `fk_sessions_selected_user` | `selected_user_id` → `users.id` | `ON DELETE SET NULL`（ユーザを削除したら未選択に戻す） |
| INDEX | `ix_sessions_family` | `family_id` | 端末一覧の表示、他の端末のログアウト |
| INDEX | `ix_sessions_selected_user` | `selected_user_id` | 外部キー用 |
| INDEX | `ix_sessions_expires_at` | `expires_at` | 期限切れセッションの定期削除 |

- `selected_user_id` のユーザが `family_id` と同じ家族に属することは、アプリケーションで保証する。
  - `(family_id, selected_user_id)` → `users (family_id, id)` の複合外部キーにすると、MySQL の `ON DELETE SET NULL` は `family_id`（NOT NULL）まで NULL にしようとするため使えない。
  - ユーザの選択時とリクエストのたびに家族の一致を確認しているため（2.3）、実害はない。

### 2.3 補足

- 発行
  - 本登録の完了時（基本方針 3.2）と、復旧コードによるログイン時（基本方針 6.）に1行作成する。
  - `device_label` は User-Agent から OS とブラウザの種類だけを取り出して作る（全文は保存しない）。
- 認証（リクエストごと）
  - Cookie のトークンを SHA-256 でハッシュ化し、`token_hash` で検索する。
  - 見つからない、または `expires_at` を過ぎている場合は未ログインとして扱う。
- 有効期限の延長（スライディング更新、基本方針 4.1）
  - 利用のたびに `last_used_at` と `expires_at` を更新し、Cookie の有効期限も延長する。
  - 書き込みを減らすため、更新は前回の更新から1時間以上経過した場合のみ行う。
  - 有効期限は、最終利用から365日とする（`expires_at` = 更新時刻 ＋ 365日）。
    - Cookie の有効期限の上限（Chrome は400日）以下で、年に1回程度しか使わない家族でもログイン状態が続く長さとする。
- 家族向けの重要な操作の確認（基本方針 9.2、9.3）
  - スーパーユーザのパスワード（未設定の場合は復旧コード）で確認したら、`elevated_until` を現在時刻の5分後とする。
  - 家族向けの重要な操作は、`elevated_until` が現在時刻より後の場合のみ実行できる。
  - 確認はセッション（端末）単位で、他の端末には影響しない。
- ユーザの選択（基本方針 5.）
  - ユーザを切り替えたら、そのユーザが同じ家族に属することを確認してから `selected_user_id` を更新し、次回の起動時にそのユーザを選択した状態で開く。
  - クライアントのローカルストレージではなくセッションに持つのは、Safari がローカルストレージを自動削除しても選択状態を保つため。
  - リクエストで指定された `users.id` が、セッションの `family_id` に属しているかの確認は、リクエストのたびに行う（TableSpec_Account.md 3.3）。
- ログアウト・失効
  - ログアウト、端末一覧からの他の端末のログアウトは、該当の行を物理削除する。
  - 復旧コードの再発行時は、同じトランザクション内で、操作中の端末以外の同じ家族の行を削除する（基本方針 6.1）。
- 期限切れの行は、定期的に削除する（5. 参照）。
- CSRF 対策（基本方針 4.3）
  - Origin ヘッダの検証、またはセッションから導出する署名付きトークン（セッションごとの値をサーバの鍵で HMAC 化したもの）で行い、CSRF トークン用のカラムは持たない。

### 2.4 DDL

```sql
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
```

## 3. pending_registrations（仮登録）

### 3.1 カラム

| カラム名 | 型 | NULL | 既定値 | 説明 |
|---|---|---|---|---|
| `id` | `BINARY(16)` | NOT NULL | | 主キー（UUID v7） |
| `token_hash` | `BINARY(32)` | NOT NULL | | 本登録URLのトークンの SHA-256 |
| `expires_at` | `DATETIME(6)` | NOT NULL | | 有効期限（作成から24時間を目安とする） |

### 3.2 制約・インデックス

| 種類 | 名前 | 対象 | 説明 |
|---|---|---|---|
| PRIMARY KEY | | `id` | |
| UNIQUE | `uq_pending_registrations_token_hash` | `token_hash` | 本登録URLのアクセス時に、トークンのハッシュで検索する |
| INDEX | `ix_pending_registrations_expires_at` | `expires_at` | 期限切れデータの定期削除 |

### 3.3 補足

- 保存するのはトークンのハッシュと有効期限のみとする（基本方針 3.1）。メールアドレスは保存しない。
- 作成日時（`created_at`）は持たない。
  - メール送信サービスの送信ログと突き合わせる手がかりを増やさないため（基本方針 8.）。
  - 必要であれば `expires_at` から逆算できる。
  - 主キーの UUID v7 にも生成時刻が含まれるため、気になる場合は仮登録の主キーのみ UUID v4（ランダム）とする（4. 未決事項）。
- 本登録（基本方針 3.2）
  - 本登録ページの照合 API（ApiSpec_Auth.md 1.2）では `token_hash` と `expires_at` で照合するのみで、行は変更しない。
  - 登録の POST では、トランザクションの最初に以下を実行し、影響行数（`ROW_COUNT()`）が1の場合のみ、`families`・`users`・`sessions` の作成を続ける。

    ```sql
    DELETE FROM pending_registrations
     WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(6);
    ```

    - 同じトークンで同時に POST された場合、行ロックにより片方の DELETE だけが1行を削除するため、二重登録にならない。
    - 家族などの作成に失敗した場合はロールバックし、仮登録の行も元に戻す（同じURLから再試行できる）。
- 期限切れの行は、定期的に削除する（5. 参照）。

### 3.4 DDL

```sql
CREATE TABLE pending_registrations (
    id         BINARY(16)  NOT NULL,
    token_hash BINARY(32)  NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pending_registrations_token_hash (token_hash),
    KEY ix_pending_registrations_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

## 4. 回数制限のカウンターと WebAuthn の challenge

短時間だけ必要なデータを、次の2つのテーブルで持つ（Redis などの外部のストアは使わない）。

### 4.1 rate_limit_counters（回数制限のカウンター）

#### カラム

| カラム名 | 型 | NULL | 既定値 | 説明 |
|---|---|---|---|---|
| `key_hash` | `BINARY(32)` | NOT NULL | | キーの HMAC-SHA256（主キー）。入力は下表のキーの元の文字列、鍵はアプリケーションの秘密鍵（データベースとは別の場所で管理する） |
| `hit_count` | `INT UNSIGNED` | NOT NULL | | 現在の窓での回数 |
| `expires_at` | `DATETIME(6)` | NOT NULL | | 窓の終了（最初の1件の時刻＋窓の長さ）。過ぎた後の最初のアクセスで、1から数え直す |

#### 制約・インデックス

| 種類 | 名前 | 対象 | 説明 |
|---|---|---|---|
| PRIMARY KEY | | `key_hash` | |
| INDEX | `ix_rate_limit_counters_expires_at` | `expires_at` | 期限切れの行の定期削除 |

#### キーの一覧

キーの元の文字列を HMAC 化して `key_hash` とする。IP アドレス・家族 ID・組織 ID などの元の値は保存しない（基本方針 4.4）。

| 用途 | キーの元の文字列 | 窓 |
|---|---|---|
| 仮登録メール・招待メールの送信回数（システム全体） | `mail:send:global` | 1時間 |
| 仮登録メールの送信回数（IP 単位、緩めの補助） | `mail:send:ip:<IP>` | 1時間 |
| 招待メールの送信回数（組織単位） | `invite:send:org:<組織ID>` | 1時間 |
| 本登録・招待の照合・所属の回数（IP 単位、緩めの補助） | `register:ip:<IP>` | 10分 |
| 復旧コードによるログインの失敗回数（システム全体） | `recovery:fail:global` | 1時間 |
| 復旧コードによるログインの失敗回数（IP 単位、緩めの補助） | `recovery:fail:ip:<IP>` | 1時間 |
| 復旧コードの再発行の回数（家族単位） | `recovery:reissue:<家族ID>` | 1時間 |
| challenge の発行の回数（セッション単位） | `challenge:<セッションID>` | 10分 |
| 組織のログインの失敗回数（システム全体） | `orglogin:fail:global` | 1時間 |
| 組織のログインの失敗回数（IP 単位、緩めの補助） | `orglogin:fail:ip:<IP>` | 1時間 |

- しきい値は ApiSpec_Auth.md「9. 回数制限」、ApiSpec_Organization.md「9. 回数制限」を参照。
- スーパーユーザのパスワードと、組織のパスワードの失敗回数は、家族単位・組織単位で確実にロックする必要があるため、このテーブルではなく、`families`（TableSpec_Account.md 2.3）と `organizations`（TableSpec_Organization.md 2.3）で管理する。

#### 補足

- 固定窓の方式とする。窓は、最初の1件の時刻から始まり、`expires_at` で終わる。
- 加算は、次の1文で行う（同時に実行されても、回数を正しく数えられる）。加算の後に `hit_count` を読み取り、しきい値と比べる。

  ```sql
  INSERT INTO rate_limit_counters (key_hash, hit_count, expires_at)
  VALUES (?, 1, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? SECOND)) AS new
  ON DUPLICATE KEY UPDATE
      hit_count  = IF(rate_limit_counters.expires_at <= UTC_TIMESTAMP(6), 1, rate_limit_counters.hit_count + 1),
      expires_at = IF(rate_limit_counters.expires_at <= UTC_TIMESTAMP(6), new.expires_at, rate_limit_counters.expires_at);
  ```

  - 行の別名（`AS new`）を付けると、修飾なしの列名（`expires_at`・`hit_count`）は、別名の列と区別できず、エラー（1052 `Column ... in field list is ambiguous`）になる。更新の式の中の、既存の行の列は、テーブル名で修飾すること。
  - `ON DUPLICATE KEY UPDATE` の代入は左から順に評価され、後の代入は先の代入の結果を見る。`hit_count` の代入を `expires_at` より先に書くこと（順序を変えると、窓の判定が狂う）。
  - 行の別名（`AS new`）による書き方は、MySQL 8.0.19 以降で使える。
- 超えた場合の `Retry-After` は、`expires_at` までの秒数とする。
- 失敗回数のように「失敗したときだけ数える」ものは、失敗が確定した時点で加算する。しきい値を超えているかの確認（加算せずに読み取る）は、加算の前に行う。
- 窓が固定のため、窓の境界をまたぐと、短時間に、しきい値の最大2倍まで受け付ける場合がある。回数制限の用途では許容する。
- 書き込みは、仮登録・本登録・復旧コード・challenge・組織のログインなど、利用頻度の低い API に限る。ログイン済みの通常のリクエストでは書き込まない。

#### DDL

```sql
CREATE TABLE rate_limit_counters (
    key_hash   BINARY(32)   NOT NULL,
    hit_count  INT UNSIGNED NOT NULL,
    expires_at DATETIME(6)  NOT NULL,
    PRIMARY KEY (key_hash),
    KEY ix_rate_limit_counters_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

### 4.2 webauthn_challenges（WebAuthn の challenge）

パスキーの登録・確認で、サーバが発行する使い捨ての乱数を持つ。

#### カラム

| カラム名 | 型 | NULL | 既定値 | 説明 |
|---|---|---|---|---|
| `id` | `BINARY(16)` | NOT NULL | | 主キー（UUID v7） |
| `owner_id` | `BINARY(16)` | NOT NULL | | challenge を発行したセッション。家族の `sessions.id` または `organization_sessions.id`。2つのテーブルを参照するため、外部キーは定義しない |
| `purpose` | `VARCHAR(30)` | NOT NULL | | 用途。`family_elevation`（家族の確認）、`family_registration`（家族のパスキーの登録）、`org_login`（組織のログインの確認）、`org_registration`（組織のパスキーの登録） |
| `challenge` | `VARBINARY(32)` | NOT NULL | | 32バイトの乱数 |
| `expires_at` | `DATETIME(6)` | NOT NULL | | 有効期限（発行から5分） |

#### 制約・インデックス

| 種類 | 名前 | 対象 | 説明 |
|---|---|---|---|
| PRIMARY KEY | | `id` | |
| UNIQUE | `uq_webauthn_challenges_owner_purpose` | `(owner_id, purpose)` | 同じセッション・同じ用途の challenge は、同時に1つだけ有効にする（新しく発行すると、前のものは上書きされる） |
| INDEX | `ix_webauthn_challenges_expires_at` | `expires_at` | 期限切れの行の定期削除 |

#### 補足

- 発行：次のように、同じ `(owner_id, purpose)` があれば上書きする。

  ```sql
  INSERT INTO webauthn_challenges (id, owner_id, purpose, challenge, expires_at)
  VALUES (?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 5 MINUTE)) AS new
  ON DUPLICATE KEY UPDATE
      challenge  = new.challenge,
      expires_at = new.expires_at;
  ```

- 使用：トランザクションの中で、`SELECT challenge ... WHERE owner_id = ? AND purpose = ? AND expires_at > UTC_TIMESTAMP(6) FOR UPDATE` で取り出し、**検証の成功・失敗にかかわらず、直ちに行を削除する**（同じ challenge の再利用を防ぐため）。取り出せなければ、検証に失敗として扱う。
- セッションが削除（ログアウト・失効）されても、challenge の行は、有効期限（5分）が切れるまで残る。定期処理で削除する（5.）。セッションに紐付かない challenge は使えないため、害はない。
- challenge は、家族・組織とも、元のセッションの Cookie がなければ使えない（`owner_id` は、リクエストのセッションの ID と一致する行だけが対象）。

#### DDL

```sql
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
```

## 5. 定期処理

| 処理 | SQL | 頻度の目安 |
|---|---|---|
| 期限切れの仮登録の削除 | `DELETE FROM pending_registrations WHERE expires_at < UTC_TIMESTAMP(6)` | 1時間ごと |
| 期限切れのセッションの削除 | `DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP(6)` | 1日ごと |
| 期限切れの回数制限カウンターの削除 | `DELETE FROM rate_limit_counters WHERE expires_at < UTC_TIMESTAMP(6)` | 1時間ごと |
| 期限切れの challenge の削除 | `DELETE FROM webauthn_challenges WHERE expires_at < UTC_TIMESTAMP(6)` | 1時間ごと |
| 期限切れの組織のセッションの削除 | `DELETE FROM organization_sessions WHERE expires_at < UTC_TIMESTAMP(6)` | 1時間ごと |
| 期限切れの招待の削除 | `DELETE FROM organization_invitations WHERE expires_at < UTC_TIMESTAMP(6)` | 1時間ごと |

- 実行には MySQL のイベントスケジューラ（`CREATE EVENT`）か、サーバの cron を使う。
  - イベントスケジューラを使う場合は `event_scheduler = ON` が必要。
- 判定には、接続のタイムゾーン設定に依存しない `UTC_TIMESTAMP(6)` を使う。

## 6. 未決事項

- 端末一覧に表示する `device_label` の粒度（OS・ブラウザの種類のみで足りるか）
- 回数制限の窓を、固定窓で足りるか（4.1。境界で、最大2倍まで受け付ける場合がある）
- 仮登録の主キーを UUID v4 にするか（UUID v7 に含まれる生成時刻を避けるか）