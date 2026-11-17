# デプロイ手順（uec-tst.koto.jp）

`server2` を、`https://uec-tst.koto.jp/server2/` に配置する手順。既存の `/server/`（CSV ファイル保存。データベースも認証も使わない）は、そのまま動かし続ける。

## 0. 前提と方針

| 項目 | 内容 |
|---|---|
| 配置 | `uec-tst` 全体（`server/` と `server2/` を含む）を、Transmit でドロップする。`server2/` は、`/server/` と並ぶ |
| URL | `https://uec-tst.koto.jp/server2/public/...`（`public/` が URL に入る） |
| 動作環境の設定 | `environment: "development"`（HTTPS・安全な Cookie を有効にする）。`production` は、メールの送信と CAPTCHA（Turnstile）が実装されるまで、使えない |
| メール | 実際には送らない。**メール表示ページ**で、送信内容を見る（デバッグ機能。アクセス制限なし） |
| データベース | Amazon RDS for MySQL 8.4。新しく `UECTSTDB` を作る（`/server/` はデータベースを使わないため、衝突しない） |
| データ | 空の状態から始める（移行なし） |

### 運用上の注意（メール表示ページは、アクセス制限なし）

メール表示ページ（`…/server2/public/index.php/debug/mails`）は、URL を知っていれば、誰でも開ける。仮登録メールと招待メールの**リンク（トークン付き）が、すべて見える**ため、次のことが起きる。

- 他人が、登録の途中のリンクを開いて、その登録を完了できる。
- 招待のリンクを使って、組織に所属できる。
- ただし、メールアドレスは、サーバーに保存しない（画面にも出ない）。

試験運用の期間・参加者を限って、使うこと。広く公開する前に、メール送信の実装と、`production` への切り替えを行う。

## 1. 事前の確認（サーバー）

- PHP 8.2 以上（8.3 以上を推奨）。拡張: `pdo_mysql`、`sodium`、`mbstring`、`intl`、`curl`
- Composer が使える（なければ、手元で `vendor/` を作ってアップロードする）
- Apache: `mod_rewrite` が有効。`server2/` の下で、`.htaccess` が効く（`AllowOverride All`）
- `https://uec-tst.koto.jp/` が HTTPS で配信されている（Cookie の `Secure`・`__Host-` 接頭辞、パスキーが、HTTPS を要求する）
- RDS に、Web サーバーから接続できる（セキュリティグループで、Web サーバーを許可）。`mysql` クライアントがある

## 2. RDS（データベース）の準備

> **順序:** この節は、`docs/sql/` を使うため、**3. のファイルの配置と `composer install` の後に、サーバーで**実行する。RDS には、Web サーバーから接続する（セキュリティグループが、Web サーバーだけを許可しているため）。
> 以下は、`<DocumentRoot>/server2` で実行する。RDS の接続先は、ホスト `database-1.clais42k2xvo.ap-northeast-1.rds.amazonaws.com`、ポート `3306`。

管理者のユーザ（`admin`）で接続して、データベースと、専用のユーザを作る。**パスワードは、そのつど、自分で入力する**（コマンドや設定ファイルには、書かない）。

1. 接続を確認する（`8.4.x` と表示されれば、OK）。

```bash
mysql -h database-1.clais42k2xvo.ap-northeast-1.rds.amazonaws.com -P 3306 -u admin -p -e "SELECT VERSION()"
```

2. データベースとテーブルを作る。

```bash
mysql -h database-1.clais42k2xvo.ap-northeast-1.rds.amazonaws.com -P 3306 -u admin -p < docs/sql/create_all.sql
```

`create_all.sql` は、`UECTSTDB` を**削除して**作り直し、すべてのテーブルを作る。初回なので問題ないが、**再実行すると、データがすべて消える**。

3. アプリ専用のユーザを作る。対話式の画面に入り、SQL を貼り付ける（パスワードを、コマンドの引数に書かないため）。

```bash
mysql -h database-1.clais42k2xvo.ap-northeast-1.rds.amazonaws.com -P 3306 -u admin -p
```

```sql
CREATE USER 'uectst_app'@'%' IDENTIFIED BY '<パスワード>';
GRANT SELECT, INSERT, UPDATE, DELETE ON UECTSTDB.* TO 'uectst_app'@'%';
```

> アプリは、テーブルの作成・変更を行わない（DDL は、手で実行する）。`DROP`・`CREATE` の権限は、与えない。
> この権限だけで、全機能が動くかは、実機で確認していない。`command denied` のエラーが出たら、権限を見直す。

## 3. ファイルの配置

ファイルは、Transmit で、**`uec-tst` 全体（`server/` も `server2/` も含む）**を、ドラッグ＆ドロップして配置する。

### 3.1 デプロイ用のフォルダを作る（手元の PC）

```bash
bash bin/make-release.sh
```

デスクトップに、`uec-tst-release/uec-tst/` ができる（Finder で開く。実行のたびに作り直す）。作業ツリーの現在の状態（コミットしていない変更も含む）が、コピーされる。

**Transmit は、`.gitignore` を見ずに、すべてをアップロードする。** そのため、`uec-tst` を、そのままドロップせず、**このスクリプトで作ったフォルダ**をドロップすること。次のものが、あらかじめ除かれている。

| 除くもの | 理由 |
|---|---|
| `server2/config/AppConfig.json`、`DBConfig.json` | 手元の MAMP 用の設定。サーバーの設定（鍵を含む）を壊す |
| `server2/vendor/` | サーバーで `composer install` する |
| `server2/tests/` | 不要 |
| `*.log` | メールのリンク（トークン）を含む |
| `server/data/` の中身 | サーバーの CSV データを、手元のもので、置き換えないため |
| `.git/`、`node_modules/`、`dev/`、`.DS_Store` | 不要。`.git` は、公開されると、履歴が読める |

### 3.2 Transmit でアップロードする

1. Transmit で、`uec-tst.koto.jp` に接続する。
2. これまで、`uec-tst` を置いていた場所と、**同じ場所**を開く（`/server/` の親が、そこになる）。
3. 手元の `uec-tst-release/` の中の **`uec-tst` フォルダ**を、ドラッグ＆ドロップする。
4. 同名のファイルがあると聞かれたら、「置き換える」を選ぶ。

> **注意**
> - `uec-tst-release` ではなく、**その中の `uec-tst`** を、ドロップする。
> - Transmit の「同期（Synchronize）」を使う場合は、**「コピー元にないファイルを削除する」を、有効にしない**。サーバーにしかない `server2/vendor/`、`server2/config/AppConfig.json`、`DBConfig.json`、`server2/storage/`、`server/data/` の CSV が、消える。
> - 実行のたびに、`public/` の音声ファイルなど、変更のないファイルも、送られる。Transmit が、変更のないファイルを、スキップする設定なら、それを使う。

### 3.3 サーバーで、依存ライブラリを入れる

サーバーに、SSH で接続して（`vendor/` は、アップロードしない）:

```bash
cd <DocumentRoot>/server2 && composer install --no-dev --optimize-autoloader
```

`<DocumentRoot>` は、`/server/` が置かれている親のディレクトリ。

## 4. 設定ファイル（サーバー）

### 4.1 AppConfig.json

```bash
bash bin/generate-app-config.sh
```

`config/AppConfig.deploy.sample.json` をもとに、`config/AppConfig.json` を作る。**鍵は、新しく生成される**（権限 600）。

- `secrets.recoveryCodeKeys` を失うと、**登録済みの家族の復旧コードが、すべて使えなくなる**。`config/AppConfig.json` を、安全な場所にバックアップする。
- 内容: `environment: "development"`、`allowedOrigins: ["https://uec-tst.koto.jp"]`、`publicBaseUrl: "https://uec-tst.koto.jp/server2/public/app"`、Cookie の `secure`・`useHostPrefix` は true、`webauthn.rpId: "uec-tst.koto.jp"`、デバッグは `mailViewer` のみ有効。
- ドメインやパスが違う場合は、`config/AppConfig.deploy.sample.json` を、先に直す。
- リバースプロキシ・ロードバランサの内側の場合は、`trustedProxyHeader` に、クライアントの IP を渡すヘッダ名（例: `X-Forwarded-For`）を指定する。

### 4.2 DBConfig.json

```bash
cp config/DBConfig.deploy.sample.json config/DBConfig.json
chmod 600 config/DBConfig.json
```

次の項目を、書き換える。

| 項目 | 値 |
|---|---|
| `host` | `database-1.clais42k2xvo.ap-northeast-1.rds.amazonaws.com` |
| `port` | `3306`（ひな形のまま） |
| `database`・`user` | `UECTSTDB`・`uectst_app`（ひな形のまま） |
| `password` | 2. の 3. で決めたパスワード |

SSL は、`ssl.enabled: true`（通信を暗号化する）、`ssl.verifyServerCert: false`・`ssl.caFile: ""`（サーバー証明書は、検証しない。`mysql` コマンドの既定と同じ）にする。
同じ VPC 内の試験運用を想定している。接続先のなりすましは、防げない。広く公開する前に、`verifyServerCert: true` と、RDS の CA 証明書（`ssl.caFile`）に、切り替える。

### 4.3 権限

PHP を動かすユーザ（Apache や php-fpm のユーザ）が、`config/` を読めて、`storage/` に書けること。

```bash
chown -R <PHP のユーザ> config storage
chmod -R u+rwX storage
```

## 5. 初期化と確認（サーバー）

```bash
php bin/check-db.php
```

DB への接続（SSL を含む）と、テーブルの数（17）を確認する。パスワードは、表示されない。

最初の運用担当者の所属を作る（初期パスワードは、実行中に、標準入力で入力する）:

```bash
php bin/create-super-belonging.php operator 運用担当者
```

### 動作確認

| 確認 | 期待する結果 |
|---|---|
| `https://uec-tst.koto.jp/server2/public/index.php/api/v1/sessions/current` | `401`（ログインしていない状態の、正しい応答） |
| `https://uec-tst.koto.jp/server2/` の直下のファイル（例: `…/server2/config/AppConfig.json`、`…/server2/src/`） | `403`（外部から読めない） |
| `https://uec-tst.koto.jp/server2/public/app/` | ホーム（「ログインしていません」） |
| `https://uec-tst.koto.jp/server2/public/app/console/` | 運用担当者・所属のログイン。初期パスワードでログイン → パスワードの変更 → パスキーの登録 |
| ホームの「新規ユーザ登録」でメールアドレスを入力 | メール表示ページが、別のタブで開き、本登録のリンクが読める |

`index.php/...` の URL が `404` になる場合は、Apache が `PATH_INFO` を渡していない。`AcceptPathInfo On` を設定する。

## 6. 更新（2回目以降）

1. 手元で、`bash bin/make-release.sh`
2. Transmit で、`uec-tst-release/uec-tst` を、同じ場所に、ドラッグ＆ドロップして、置き換える（3.2 の注意を守る。本物の `config/`、`vendor/`、`storage/`、`server/data/` のファイルは、デプロイ用のフォルダに含まれないため、上書きされない）
3. `composer.lock` が変わったときだけ、サーバーで `composer install --no-dev --optimize-autoloader`
4. テーブルの構造が変わったときは、変更の SQL を、手で実行する（`create_all.sql` は、データを消すため、再実行しない）
5. アップロードしたファイルの所有者が、SFTP のユーザになるため、PHP が `config/` を読めて、`storage/` に書けるか、確認する（4.3）

## 7. 後で行うこと（`production` への切り替えの前に）

- メールの送信（現在は `mail.driver = "log"` のみ）
- 新規登録の画面への CAPTCHA（Cloudflare Turnstile）の組み込み
- デバッグ機能（メール表示ページ）の無効化
- `environment: "production"` への変更（`debug` を外し、`captcha.driver = "turnstile"`）
