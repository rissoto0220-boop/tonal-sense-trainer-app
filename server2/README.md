# server2

TonalSenseTrainer のユーザ・組織の管理と認証の API（素の PHP）と、API を呼び出す JavaScript のクラス。
仕様は `docs/`（BasicPolicy.md、TableSpec_*.md、ApiSpec_*.md）を参照。

## 構成

| ディレクトリ | 内容 |
|---|---|
| `public/` | **公開する唯一のディレクトリ**。`index.php`（入口）、`js/uectst-api/`（JavaScript のクラス） |
| `src/` | アプリ本体（PSR-4、名前空間 `UecTst`）。公開しない |
| `config/` | 設定。`*.sample.json` だけを Git で管理する |
| `bin/` | 運用用のスクリプト |
| `tests/` | PHPUnit（`Unit`、`Integration`）と、JavaScript のテスト（`js`） |
| `storage/` | ログなど。Git で管理しない |
| `docs/` | 仕様書、`sql/`（データベース・テーブルの作成） |

## 開発環境の準備

必要なもの: PHP 8.2 以上（pdo_mysql、sodium、mbstring、intl、curl）、Composer、MySQL 8.4、Node.js（JavaScript のテスト用）。

```bash
composer install
cp config/DBConfig.sample.json config/DBConfig.json    # DB の接続先を書き換える
cp config/AppConfig.sample.json config/AppConfig.json  # オリジン・Cookie などを書き換える
```

データベースとテーブルは、`docs/sql/create_all.sql` で作る（`UECTSTDB` を削除して作り直す）。

```bash
php bin/check-db.php        # DBConfig.json の接続を確認する（パスワードは表示しない）
php bin/create-super-organization.php [ログインID] [組織名]   # 最初の研究者の組織を作る（初期パスワードは標準入力）
```

研究者の組織は自己登録できない。上のスクリプトで最初の1つを作り、最初のログインでパスワードの変更とパスキーの登録を行う
（`docs/TableSpec_Organization.md` 7.）。ほかの組織は、研究者の組織が API（O18）で登録する。

## 開発用サーバー

PHP の組み込みサーバーを、`public/` をルートにして起動する（本番と同じ構造。`config/` や `src/` は URL で届かない）。

```bash
php -S 127.0.0.1:8890 -t public
```

## テスト

```bash
vendor/bin/phpunit            # PHP（Integration は config/DBConfig.json の DB を使う。接続できなければスキップ）
npm test                      # JavaScript
```

## 設定ファイル

環境（開発・本番）ごとに変わる値は、コードではなく、次のファイルで指定する。**本物の設定ファイルは Git に入れない**。

| ファイル | 内容 | 環境変数で場所を指定 |
|---|---|---|
| `config/DBConfig.json` | DB の接続情報（ホスト、ポート、データベース、ユーザ、パスワード、SSL） | `UECTST_DB_CONFIG` |
| `config/AppConfig.json` | 動作環境、許可するオリジン（CSRF 対策）、メールのリンクの基準 URL、Cookie の属性、メール・CAPTCHA の設定、秘密の鍵、プロキシのヘッダ、利用データのダウンロードの上限、ログの出力先 | `UECTST_APP_CONFIG` |

`AppConfig.json` の主な項目（`config/AppConfig.sample.json` が開発用の例）:

| 項目 | 内容 |
|---|---|
| `publicBaseUrl` | メールに書く、画面の基準 URL（本登録のリンクなど） |
| `mail` | `driver`（`log`: ファイルに書くだけ／本番用の送信方式）、`from`（送信元）、`logFile` |
| `captcha` | `driver`（`none`／`turnstile`）、`secretKey`。本番では `turnstile` を使う |
| `secrets.recoveryCodeKeys` | 復旧コードの HMAC 鍵（ID → Base64）。鍵を増やしても、古い鍵のコードでログインできる。`currentRecoveryCodeKeyId` が新規発行に使う鍵 |
| `secrets.rateLimitKey` | 回数制限のキー（IP など）をハッシュする鍵 |
| `webauthn` | パスキーの `rpId`（サイトのドメイン。省略時は `publicBaseUrl` のホスト名）と `rpName`（サービス名）。**運用開始後に `rpId` を変えると、登録済みのパスキーがすべて使えなくなる**。パスキーが使えるのは HTTPS または `localhost` のみ（IP アドレスは不可） |
| `testData.exportMaxSessions` | 利用データ（テスト結果）の1回のダウンロードで取り出せるセッション数の上限。省略時は `5000`（1〜100000 の整数）。超える範囲の要求は `422 EXPORT_TOO_LARGE` で断る。大きくするほど、1回の要求がサーバとデータベースを長く使う（理由は ApiSpec_TestData.md 4.2） |
| `trustedProxyHeader` | リバースプロキシ配下のとき、クライアント IP を入れるヘッダ名（例: `X-Forwarded-For`）。直接公開なら `null` |

**`secrets` の開発用の値は、本番で絶対に使わないこと**（本番では、乱数で作った別の値にする）。

- 本番では、`public/` の外に置き、リリースを切り替えても引き継がれる場所（`shared/`）へのシンボリックリンクにする。
- `production` では、Cookie の `secure`・`useHostPrefix` を `true` にし、オリジンは `https` のみとする（満たさない設定は、起動時に拒否される）。

## Web サーバの設定

- 公開ルートは `public/`。存在しないパスは、すべて `index.php` に渡す。
  - Apache：`public/.htaccess`（`mod_rewrite` が有効な場合）。`server2/.htaccess` は、リポジトリ全体が公開される配置でも、`public/` 以外に届かないようにする多重の防御。
  - nginx：`try_files $uri /index.php;` を設定する（`.htaccess` は無効）。
- `display_errors` は、`public/index.php` で常に無効にする。エラーの原因は、PHP のエラーログに残る。
