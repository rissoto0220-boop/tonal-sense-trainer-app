# テーブル仕様書：アカウント・ユーザ

基本方針（BasicPolicy.md）の「2. アカウント構成」「6.1 復旧コード」「9.3 スーパーユーザ」「9.4 生体認証（パスキー）」「10. 所属」に基づき、家族（アカウント）・ユーザ・パスキーを管理するテーブルを定義する。

## 0. 共通事項

- データベースは MySQL 8.4 を想定する（開発環境で `SELECT VERSION()` が `8.4.11` を返すことを確認済み）。
  - ストレージエンジンは InnoDB、文字コードは `utf8mb4` とする。
- 主キーは UUID とし、`BINARY(16)` で保存する。
  - 連番だと、ID から登録数や登録順が推測できるため。
  - インデックスの効率のため、生成順に並ぶ UUID v7 を推奨する。
    - MySQL には UUID v7 を生成する関数がないため、アプリケーションで生成する。
  - 文字列表現（`xxxxxxxx-xxxx-...`）との変換は `UUID_TO_BIN()` / `BIN_TO_UUID()` を使う（UUID v7 は生成順に並ぶため、第2引数の並べ替えは指定しない）。
- 日時はすべて `DATETIME(6)`（UTC）で保存する。
  - 接続時にセッションのタイムゾーンを `SET time_zone = '+00:00'` とする（`CURRENT_TIMESTAMP(6)` の既定値を UTC にするため）。
  - `TIMESTAMP` 型は 2038年問題があるため使わない。
- 文字列の照合順序（collation）は `utf8mb4_bin` とする。
  - MySQL 8.4 の既定（`utf8mb4_0900_ai_ci`）は大文字・小文字やアクセントを区別せず、UNIQUE 制約での重複判定がアプリケーションの意図とずれるため。
  - 大文字・小文字や全角・半角を同一とみなすかどうかは、アプリケーションの正規化で決める（3.3 参照）。
- メールアドレスなど個人情報に繋がる項目は持たない（基本方針 1.）。
- DDL を実行するための SQL（データベース `UECTSTDB` の作成、テーブルごとの個別のファイル、一括のファイル）は、`sql/` にある。DDL を変更したときは、本仕様書（TableSpec_Account.md・TableSpec_Auth.md・TableSpec_Belonging.md）と、`sql/` のすべてのファイルを更新すること。
- 本仕様書の対象外：
  - セッション（認証トークン）・仮登録・回数制限・WebAuthn の challenge：TableSpec_Auth.md を参照
  - 所属・所属のパスキー・所属のセッション・招待：TableSpec_Belonging.md を参照
  - ユーザごとの利用データ（テスト結果）：TableSpec_TestData.md を参照（退会・ユーザの削除の後も保持する。5.2 の規則に従う）

## 1. テーブル一覧

| テーブル名 | 論理名 | 概要 |
|---|---|---|
| `families` | 家族 | アカウントの単位。認証情報（復旧コード）とスーパーユーザのパスワード、所属先を持つ |
| `users` | ユーザ | 家族に属する利用者（1〜4名）。うち1名がスーパーユーザ。認証情報は持たない |
| `passkeys` | パスキー | スーパーユーザのパスワードの代わりに、家族向けの重要な操作の確認に使うパスキー（WebAuthn） |

```
families 1 ──── 1..4 users（うち1名がスーパーユーザ）
families 1 ──── 0..n passkeys
belongings 0..1 ──── 0..n families（所属。所属を削除すると families.belonging_id は NULL になる）
```

## 2. families（家族）

### 2.1 カラム

| カラム名 | 型 | NULL | 既定値 | 説明 |
|---|---|---|---|---|
| `id` | `BINARY(16)` | NOT NULL | | 主キー（UUID v7） |
| `recovery_code_hash` | `BINARY(32)` | NOT NULL | | 復旧コードの HMAC-SHA256 |
| `recovery_code_key_id` | `SMALLINT UNSIGNED` | NOT NULL | | HMAC に使った鍵の識別子（鍵の切り替えに備える） |
| `recovery_code_issued_at` | `DATETIME(6)` | NOT NULL | `CURRENT_TIMESTAMP(6)` | 復旧コードの発行日時（再発行時に更新） |
| `superuser_password_hash` | `VARCHAR(255)` | NULL | | スーパーユーザのパスワードのハッシュ（Argon2id の PHC 形式の文字列）。未設定は NULL |
| `superuser_password_failed_count` | `TINYINT UNSIGNED` | NOT NULL | `0` | パスワードの連続失敗回数 |
| `superuser_password_locked_until` | `DATETIME(6)` | NULL | | パスワードの入力をロックする期限。ロックしていなければ NULL |
| `belonging_id` | `BINARY(16)` | NULL | | 所属先（`belongings.id`）。NULL は、所属していない個人ユーザ（基本方針 10.） |
| `belonging_joined_at` | `DATETIME(6)` | NULL | | 所属した日時。所属していなければ NULL |
| `created_at` | `DATETIME(6)` | NOT NULL | `CURRENT_TIMESTAMP(6)` | 登録日時 |
| `updated_at` | `DATETIME(6)` | NOT NULL | `CURRENT_TIMESTAMP(6)` | 更新日時（`ON UPDATE CURRENT_TIMESTAMP(6)`） |

### 2.2 制約・インデックス

| 種類 | 名前 | 対象 | 説明 |
|---|---|---|---|
| PRIMARY KEY | | `id` | |
| UNIQUE | `uq_families_recovery_code_hash` | `recovery_code_hash` | 復旧コードは家族の識別子を兼ねるため、ログイン時はこのハッシュで家族を検索する |
| FOREIGN KEY | `fk_families_belonging` | `belonging_id` → `belongings.id` | `ON DELETE SET NULL`（所属を削除すると、所属していた家族は個人ユーザになる。基本方針 10.6） |
| INDEX | `ix_families_belonging` | `belonging_id` | 所属ごとの所属家族の一覧、所属が参照できる利用データの絞り込み（TableSpec_Belonging.md 6.） |

### 2.3 補足

- 復旧コードの扱い
  - 復旧コード本体は保存しない。発行時に一度だけ画面に表示する（基本方針 3.2）。
  - 形式は Crockford Base32 の25文字（乱数24文字・120bit ＋ チェック用1文字、基本方針 6.1）。乱数部分は暗号論的に安全な乱数から生成し、チェック用の文字は ApiSpec_Auth.md 0.6 の方法で計算する。
  - HMAC は、正規化（ハイフンの除去、大文字化、`O`→`0`・`I`/`L`→`1`。ApiSpec_Auth.md 0.6）後の25文字（チェック用の文字を含む）に対して計算する。発行時と照合時で同じ正規化をすること。
  - ハッシュは HMAC-SHA256 とし、鍵はデータベースとは別の場所（環境変数や KMS など）で管理する（基本方針 6.1）。
    - HMAC の計算はアプリケーションで行う（鍵を SQL 文に含めないため）。
  - 鍵を切り替えた場合も、旧鍵で作られたハッシュを照合できるよう、`recovery_code_key_id` で使った鍵を区別する。
  - ログイン時は、入力された復旧コードを有効なすべての鍵で HMAC 化し、`recovery_code_hash` を検索する。
- 復旧コードの再発行（基本方針 6.1）
  - `recovery_code_hash`・`recovery_code_key_id`・`recovery_code_issued_at` を更新する。
  - 旧コードは上書きにより無効になる。
  - 操作中の端末以外のセッションの失効は、セッションテーブル側で同じトランザクション内に行う。
- スーパーユーザのパスワード（基本方針 9.3）
  - パスワードは家族に1つで、スーパーユーザのユーザ（3.）ではなく家族に持たせる（スーパーユーザを他のユーザへ移しても、パスワードはそのまま使えるようにするため）。
  - ハッシュは Argon2id（OWASP の推奨値：メモリ 19 MiB、反復2回、並列度1）とし、ソルトとパラメータを含む PHC 形式の文字列で保存する。
    - Argon2id が使えない環境では bcrypt（コスト12以上）とする。この場合、bcrypt は72バイトまでしか扱わないため、パスワードの最大長に注意する。
  - 失敗回数とロック（家族単位の試行回数制限、基本方針 9.3）
    - 失敗するたびに `superuser_password_failed_count` を1増やす。
    - 5回に達したら、`superuser_password_locked_until` を現在時刻の15分後とし、`superuser_password_failed_count` を0に戻す。
    - ロック中（`superuser_password_locked_until` が現在時刻より後）は、パスワードを照合せずに拒否する。
    - 成功したら `superuser_password_failed_count` を0に戻す。
    - 同時に入力されても回数を正しく数えるため、照合時は家族の行を `SELECT ... FOR UPDATE` でロックする。
  - パスワードを削除（未設定に）した場合は、3つのカラムをすべて初期値（NULL・0・NULL）に戻す。
- 所属（基本方針 10.、11.）
  - 所属は、所属からの招待（TableSpec_Belonging.md 5.）を使って、`belonging_id` と `belonging_joined_at` を設定することで成立する。所属の解除は、2つのカラムを NULL に戻す。
  - 別の所属へ移る場合は、`belonging_id` を新しい所属に更新し、`belonging_joined_at` を更新する。
  - 所属の変更・解除は、家族向けの重要な操作（基本方針 9.2）として、確認の後に行う。
  - 所属が参照できる利用データは、現在の `belonging_id` で決まる（TableSpec_Belonging.md 6.）。
  - `families` の行を削除（退会）すると、所属の情報も一緒に消える。
  - 所属の削除では、外部キーの `ON DELETE SET NULL` は `belonging_id` だけを NULL にし、`belonging_joined_at` は残る。そのため、所属を削除する処理は、同じトランザクションの中で、先に所属家族の2つのカラムを NULL にしてから、所属の行を削除する（ApiSpec_Belonging.md 6.5）。`belonging_joined_at` は、`belonging_id` が NULL でないときだけ意味を持つ。
  - `belongings` を `families` より先に作成すること（外部キーの参照先のため）。

### 2.4 DDL

```sql
CREATE TABLE families (
    id                              BINARY(16)        NOT NULL,
    recovery_code_hash              BINARY(32)        NOT NULL,
    recovery_code_key_id            SMALLINT UNSIGNED NOT NULL,
    recovery_code_issued_at         DATETIME(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    superuser_password_hash         VARCHAR(255)      NULL,
    superuser_password_failed_count TINYINT UNSIGNED  NOT NULL DEFAULT 0,
    superuser_password_locked_until DATETIME(6)       NULL,
    belonging_id                 BINARY(16)        NULL,
    belonging_joined_at          DATETIME(6)       NULL,
    created_at                      DATETIME(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at                      DATETIME(6)       NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_families_recovery_code_hash (recovery_code_hash),
    KEY ix_families_belonging (belonging_id),
    CONSTRAINT fk_families_belonging FOREIGN KEY (belonging_id) REFERENCES belongings (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

## 3. users（ユーザ）

### 3.1 カラム

| カラム名 | 型 | NULL | 既定値 | 説明 |
|---|---|---|---|---|
| `id` | `BINARY(16)` | NOT NULL | | 主キー（UUID v7） |
| `family_id` | `BINARY(16)` | NOT NULL | | 所属する家族（`families.id`） |
| `name` | `VARCHAR(20)` | NOT NULL | | ユーザ名（ニックネーム推奨）。文字数は文字単位で数える |
| `slot` | `TINYINT UNSIGNED` | NOT NULL | | 家族内の枠番号（1〜4）。作成時に空いている番号を割り当て、変更しない。ユーザ数の上限を DB で保証するために使う |
| `display_order` | `TINYINT UNSIGNED` | NOT NULL | | 切り替え画面での表示順（1〜4）。並べ替えで変更する |
| `is_superuser` | `TINYINT(1)` | NOT NULL | `0` | スーパーユーザなら1。家族内にちょうど1人 |
| `created_at` | `DATETIME(6)` | NOT NULL | `CURRENT_TIMESTAMP(6)` | 登録日時 |
| `updated_at` | `DATETIME(6)` | NOT NULL | `CURRENT_TIMESTAMP(6)` | 更新日時（`ON UPDATE CURRENT_TIMESTAMP(6)`） |

### 3.2 制約・インデックス

| 種類 | 名前 | 対象 | 説明 |
|---|---|---|---|
| PRIMARY KEY | | `id` | |
| FOREIGN KEY | `fk_users_family` | `family_id` → `families.id` | `ON DELETE CASCADE`（家族を削除するとユーザも削除する） |
| UNIQUE | `uq_users_family_name` | `(family_id, name)` | 同じ家族内でユーザ名の重複を禁止する（切り替え時に区別できなくなるため） |
| UNIQUE | `uq_users_family_slot` | `(family_id, slot)` | 同じ家族内で枠番号の重複を禁止する。CHECK 制約（1〜4）と合わせて、5名以上にならないことを DB で保証する |
| UNIQUE | `uq_users_superuser` | `((IF(is_superuser = 1, family_id, NULL)))` | 関数インデックス。家族内にスーパーユーザが2人以上いないことを保証する（NULL は重複とみなされない） |
| CHECK | `ck_users_slot` | `slot BETWEEN 1 AND 4` | |
| CHECK | `ck_users_display_order` | `display_order BETWEEN 1 AND 4` | |
| CHECK | `ck_users_is_superuser` | `is_superuser IN (0, 1)` | |
| CHECK | `ck_users_name` | `CHAR_LENGTH(TRIM(name)) >= 1` | 空白のみのユーザ名を禁止する（最大文字数は `VARCHAR(20)` で制限される） |

- 外部キー `family_id` には `uq_users_family_name` の先頭列のインデックスが使われるため、`family_id` 単独のインデックスは作らない。
- 表示順（`display_order`）には UNIQUE 制約を付けない。
  - MySQL は UNIQUE 制約を1行ごとに検査するため、UNIQUE 制約があると、表示順を入れ替える UPDATE が途中で重複になり失敗する。
  - そのため、ユーザ数の上限の保証は、変更しない枠番号（`slot`）の UNIQUE 制約で行う。
- MySQL に部分インデックスはないため、スーパーユーザの一意性は関数インデックス（MySQL 8.0.13 以降）で保証する。

### 3.3 補足

- ユーザ数（1〜4名）の制約
  - 行数の制約は CHECK 制約で表現できないため、アプリケーションで保証する。
  - ユーザの追加・削除・並べ替え時は、同じトランザクション内で該当の `families` 行を `SELECT ... FOR UPDATE` でロックしてから件数を確認する（同時操作で上限を超えたり、0名になったりするのを防ぐため）。
  - `slot` の UNIQUE 制約と CHECK 制約（1〜4）により、ロック漏れがあっても5名以上にはならない。
  - 追加時は、空いている最小の `slot` を割り当て、`display_order` は「現在の人数＋1」（末尾）とする。
- 表示順
  - 家族内で1から連番になるよう、アプリケーションで保証する（重複・欠番なし）。
  - 並べ替えは、家族の行をロックしたうえで、各ユーザの `display_order` を新しい値に更新する。
  - ユーザを削除したら、後ろのユーザの `display_order` を1つずつ詰める。
- スーパーユーザ（基本方針 9.3）
  - 家族内にちょうど1人とする。
    - 2人以上にならないことは `uq_users_superuser` で保証する。
    - 0人にならないことはアプリケーションで保証する（スーパーユーザは削除できない。移す場合は同じトランザクションで旧スーパーユーザを0、新スーパーユーザを1にする。この順に更新すれば一意制約に反しない）。
  - 本登録時は、1人目のユーザをスーパーユーザとする。
- ユーザの削除
  - 物理削除とする（`users` の行を削除する）。
  - スーパーユーザは削除できない（先に他のユーザへ移す）。
  - ユーザごとの利用データは削除しない。利用データのテーブルは `users.id` への外部キーを持たない（5.2）。削除の後は、家族からは参照できなくなり、運用担当者のみが参照できる（基本方針 10.7）。
- ユーザ名
  - 保存前にアプリケーションで正規化する（前後の空白の除去、Unicode の正規化）。
    - `TRIM()` は半角スペースしか除去しないため、全角スペースなどの除去はアプリケーションで行う。
  - 照合順序は `utf8mb4_bin` のため、DB は正規化後の文字列が完全に一致する場合のみ重複とみなす。
    - 大文字・小文字や全角・半角を同一とみなす場合は、正規化を NFKC ＋ 小文字化とする（未決、4. 参照）。
- ユーザの切り替え（基本方針 5.）
  - クライアントは `users.id` を指定してリクエストする。
  - サーバは、指定された `users.id` の `family_id` が、セッションの家族と一致するかをリクエストのたびに確認する。

### 3.4 DDL

```sql
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
```

## 4. passkeys（パスキー）

基本方針 9.4 に基づき、スーパーユーザのパスワードの代わりに使うパスキー（WebAuthn の公開鍵クレデンシャル）を管理する。

### 4.1 カラム

| カラム名 | 型 | NULL | 既定値 | 説明 |
|---|---|---|---|---|
| `id` | `BINARY(16)` | NOT NULL | | 主キー（UUID v7）。一覧からの削除の指定に使う |
| `family_id` | `BINARY(16)` | NOT NULL | | 所属する家族（`families.id`） |
| `credential_id` | `VARBINARY(255)` | NOT NULL | | WebAuthn のクレデンシャル ID（認証器が生成する） |
| `public_key` | `VARBINARY(1024)` | NOT NULL | | 公開鍵（COSE 形式） |
| `sign_count` | `INT UNSIGNED` | NOT NULL | `0` | 署名カウンタ（複製された認証器の検出に使う） |
| `transports` | `VARCHAR(100)` | NULL | | 認証器の通信方式（`internal`・`hybrid` などをカンマ区切り）。確認時のヒントとして返す |
| `backup_eligible` | `TINYINT(1)` | NOT NULL | `0` | 同期パスキー（iCloud キーチェーンなどで他の端末に同期される）なら1 |
| `name` | `VARCHAR(50)` | NOT NULL | | 一覧に表示する名前（例：「iPhone / Safari で登録」）。登録時の User-Agent から作る |
| `created_at` | `DATETIME(6)` | NOT NULL | `CURRENT_TIMESTAMP(6)` | 登録日時 |
| `last_used_at` | `DATETIME(6)` | NULL | | 最終使用日時。未使用は NULL |

### 4.2 制約・インデックス

| 種類 | 名前 | 対象 | 説明 |
|---|---|---|---|
| PRIMARY KEY | | `id` | |
| UNIQUE | `uq_passkeys_credential_id` | `credential_id` | 確認時に、認証器が返したクレデンシャル ID で検索する |
| FOREIGN KEY | `fk_passkeys_family` | `family_id` → `families.id` | `ON DELETE CASCADE` |
| INDEX | `ix_passkeys_family` | `family_id` | 家族のパスキーの一覧 |
| CHECK | `ck_passkeys_backup_eligible` | `backup_eligible IN (0, 1)` | |

### 4.3 補足

- パスキーは家族（スーパーユーザ）に複数登録できる（親のスマホ、親の別の端末など）。
  - 上限は家族あたり10件とする（アプリケーションで保証する）。
- WebAuthn のユーザ ID（user handle）には `families.id`（16バイト）を使う。
  - メールアドレスや氏名などの個人情報を含まないため、基本方針 1. の要件に合う。
  - パスキーの管理画面（iOS の「パスワード」アプリなど）に表示される名前は、固定の文言（例：「家族の管理用」）とし、ユーザ名は使わない。
- 登録時・確認時の challenge（サーバが発行する使い捨ての乱数）は、短時間（5分）だけ使うため、このテーブルには持たず、セッションに紐付けて `webauthn_challenges` テーブルで扱う（TableSpec_Auth.md 4.2）。
- 署名カウンタ
  - 確認のたびに、認証器が返したカウンタを `sign_count` と比べる。
  - 同期パスキーは常に0を返すことがあるため、どちらも0の場合は検査しない。保存値より大きくない値（0を除く）が返った場合は、複製の疑いとして確認を拒否する。
- パスキーはスーパーユーザのパスワードの代わりの手段とする（基本方針 9.4）。
  - パスキーの登録は、パスワードが設定済みの家族のみ可能とする（パスキーが使えない環境でもパスワードで確認できるようにするため）。
  - パスキーが1件以上ある間は、パスワードを削除できない（先にパスキーを削除する）。
- スーパーユーザを他のユーザへ移しても、パスキーは家族に紐付くためそのまま残る。新しいスーパーユーザが使わない場合は、旧スーパーユーザのパスキーを削除するよう画面で案内する。
- パスキーはサイトのドメイン（RP ID）に結び付くため、運用開始後にドメインを変更すると、すべてのパスキーが使えなくなる（基本方針 9.4）。

### 4.4 DDL

```sql
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
```

## 5. 家族の削除（退会）と利用データの保持

### 5.1 家族の削除（退会）

- 退会時は `families` の行を物理削除する。
- `ON DELETE CASCADE` により、ユーザ・パスキー・セッション（TableSpec_Auth.md）が削除される。所属（`belonging_id`）も、家族の行とともに消える。
  - 認証器（端末）に残ったパスキー自体はサーバから削除できないため、退会後の画面で、端末のパスキーの管理画面から削除するよう案内する。
- 削除したアカウント情報（家族・ユーザ名・端末のログイン・所属）は復元できない（バックアップからの個別復元も行わない）。
- **ユーザごとの利用データは削除しない**（基本方針 10.7）。5.2 を参照。

### 5.2 利用データの保持の規則

ユーザごとの利用データ（テスト結果。TableSpec_TestData.md）のテーブルは、次の規則に従う。

- ユーザの識別に、`user_id BINARY(16) NOT NULL` を持つ。値は `users.id` と同じ UUID とする。
- **`users`・`families` への外部キーを定義しない**（`ON DELETE CASCADE` も `ON DELETE SET NULL` も使わない）。ユーザの削除・退会で、利用データが消えたり、書き換わったりしないようにするため。
- `user_id` にインデックスを付ける。
- 利用データに、ユーザ名・メールアドレス・氏名などを含めない。ユーザの削除・退会の後は、`user_id` から、ユーザ名や家族を特定できない。
- 利用データを登録する API は、リクエストの `userId` がログイン中の家族に属することを確認してから、`user_id` に保存する（ApiSpec_Auth.md 3.2）。
- 利用データを参照できる範囲は、TableSpec_Belonging.md 6. で定める。
- 利用データを削除する手段（運用担当者の SQL、運用担当者の機能）は別途定義する。

## 6. 未決事項

- ユーザ名の最大文字数（仮に20文字としている）
- ユーザ名の重複判定で、大文字・小文字や全角・半角を同一とみなすか（正規化を NFC にするか、NFKC ＋ 小文字化にするか）
- バックアップに残った退会済みの家族のアカウント情報の扱い（バックアップの保存期間）
- 利用データの削除の依頼への対応（退会・ユーザの削除の後は、`user_id` から本人を特定できない。基本方針 8.）
- 所属前に作られた利用データを、所属に参照させるか（現状は参照できる。`belonging_joined_at` を使えば、所属後のデータだけに絞れる）
