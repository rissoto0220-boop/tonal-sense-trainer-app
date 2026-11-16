# server2

TonalSenseTrainer のユーザ・組織の管理と認証の API（素の PHP）と、API を呼び出す JavaScript のクラス。
仕様は `docs/`（BasicPolicy.md、TableSpec_*.md、ApiSpec_*.md）を参照。画面・仕様書・コードで使っている用語は、`docs/Glossary.md`（用語集）にまとめている。

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
php bin/create-super-organization.php [ログインID] [組織名]   # 最初の運用担当者の組織を作る（初期パスワードは標準入力）
```

運用担当者の組織は自己登録できない。上のスクリプトで最初の1つを作り、最初のログインでパスワードの変更とパスキーの登録を行う
（`docs/TableSpec_Organization.md` 7.）。ほかの組織は、運用担当者の組織が API（O18）で登録する。

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
| `debug` | デバッグ状態（下の「デバッグ状態」）。`enabled`（大元のスイッチ）と、`features`（機能ごとのスイッチ）。省略時は、すべて無効 |
| `captcha` | `driver`（`none`／`turnstile`）、`secretKey`。本番では `turnstile` を使う |
| `secrets.recoveryCodeKeys` | 復旧コードの HMAC 鍵（ID → Base64）。鍵を増やしても、古い鍵のコードでログインできる。`currentRecoveryCodeKeyId` が新規発行に使う鍵 |
| `secrets.rateLimitKey` | 回数制限のキー（IP など）をハッシュする鍵 |
| `webauthn` | パスキーの `rpId`（サイトのドメイン。省略時は `publicBaseUrl` のホスト名）と `rpName`（サービス名）。**運用開始後に `rpId` を変えると、登録済みのパスキーがすべて使えなくなる**。パスキーが使えるのは HTTPS または `localhost` のみ（IP アドレスは不可） |
| `testData.exportMaxSessions` | 利用データ（テスト結果）の1回のダウンロードで取り出せるセッション数の上限。省略時は `5000`（1〜100000 の整数）。超える範囲の要求は `422 EXPORT_TOO_LARGE` で断る。大きくするほど、1回の要求がサーバとデータベースを長く使う（理由は ApiSpec_TestData.md 4.2） |
| `trustedProxyHeader` | リバースプロキシ配下のとき、クライアント IP を入れるヘッダ名（例: `X-Forwarded-For`）。直接公開なら `null` |

**`secrets` の開発用の値は、本番で絶対に使わないこと**（本番では、乱数で作った別の値にする）。

- 本番では、`public/` の外に置き、リリースを切り替えても引き継がれる場所（`shared/`）へのシンボリックリンクにする。
- `production` では、Cookie の `secure`・`useHostPrefix` を `true` にし、オリジンは `https` のみとする（満たさない設定は、起動時に拒否される）。

### デバッグ状態

開発中に便利な機能を、`AppConfig.json` の `debug` で有効にできる。**大元の `enabled` が `false`（または `debug` の記載なし）なら、`features` の値に関係なく、すべて無効**。`enabled` を `true` にしたうえで、使いたい機能だけを `true` にする。

```json
"debug": { "enabled": true, "features": { "mailViewer": true, "indexPage": true } }
```

- `production` では `enabled` を `true` にできない（起動時に拒否される）。`features` の名前を間違えたときも、起動時に拒否される。
- `enabled` が `true` のとき、すべてのレスポンスに `X-Debug-Mode: on` ヘッダが付く（意図せず有効のまま公開していないか、確認できる）。
- 接続元による制限は行わない（スマートフォンのブラウザからも使えるようにするため）。デバッグ状態のサーバは、**認証なしで機能が使える**ので、インターネットに公開しないこと。

| 機能 | 内容 |
|---|---|
| `indexPage` | 入口（`GET /`）の案内ページ。メール表示ページへのリンクと、API の基準パス（クライアントの `basePath` に指定する値）、有効なデバッグ機能を表示する。無効のときは、`/` は 404 |
| `mailViewer` | メール表示ページ。仮登録の本登録URLや、組織の招待メールなど、送ったことにしたメールの内容を `GET /debug/mails` で表示する（新しい順。数秒おきに自動で更新される）。メールを送る API（#1・O12）のレスポンスには `debug.mailViewUrl`（`/debug/mails?highlight=<メールID>`）が加わり、クライアント（`ApiClient`）が、これを見て別タブ（名前: `uectst-debug-mail`）で自動的に開く。ポップアップブロックで開けない場合は、`/debug/mails` を一度開いておけばよい。メールの内容は `mail.logFile`（1行1件の JSON）に記録される |

## 仮実装の画面（`public/app/`）

API の動作確認のための、仮の画面（見た目・文言は今後作り直す）。HTML・CSS・JavaScript だけで、フレームワークは使わない。`public/js/uectst-api/` のクライアントを使う。

| 画面 | パス（`public/app/` から） | 内容 |
|---|---|---|
| 仮登録 | `signup/` | メールアドレスの入力 → 確認 → 送信 → 送信完了（#1）。CAPTCHA は未実装（`captcha.driver` が `none` のときだけ動く） |
| 本登録 | `register/` | メールのリンク（`register#token=…`）で開く。トークンを読み取って URL から消し、照合（#2）→ ユーザ名（1〜4人）の入力 → 本登録（#3）→ 復旧コードの表示（コピー・テキスト保存・印刷。「控えました」にチェックするまで次へ進めない） |
| 組織の招待 | `invite/` | 招待メールのリンク（`invite#token=…`）で開く。トークンを読み取って URL から消し、照合（#28。招待は使われない）→ 組織名と共有される内容の表示 → 「新しく登録する」（同意 → ユーザ名の入力 → 招待経由の本登録（#3）→ 復旧コード。組織に所属した状態で登録される）または「登録済みの家族に所属を追加する」（未ログインなら復旧コードでログイン → 別の組織から移るときは警告 → 確認（パスワードまたは復旧コード）→ 所属（#30）。同じ組織なら、何もしない）。無効・期限切れ・使用済みのときは、その旨を表示する |
| ログイン | `login/` | 復旧コードでログイン（#4）。チェック用の文字の誤りは、サーバへ送る前に検出する |
| 組織のログイン | `org/` | 運用担当者・組織向け。ログインID＋パスワード（O1）→ 初回はパスワードの変更（O6）→ 運用担当者のみパスキーの登録（O9・O10）または確認（O2・O3）→ 完了の表示（O4）、ログアウト（O5）。ログインの段階に応じて、1つのページで画面を切り替える。パスキーは、HTTPS または `localhost` でだけ使える。**ログイン後は、左にメニュー、右に内容の枠**になり、メニューの項目は運用担当者かどうかで変わる（運用担当者のみ: 家族の管理・組織の管理・パスキーの管理）。URL のフラグメント（`#invitations` など）で項目を切り替える。現在は、ホーム、「招待」（招待メールの送信・未使用の招待の件数・すべて取り消し）、「所属している家族」（一覧・ユーザ名での絞り込み・所属から外す）、「家族の管理」（運用担当者のみ。すべての家族の一覧・ユーザ名／組織名での絞り込み・所属の解除・家族の削除。解除と削除はパスワードの再入力で確認）、「組織の管理」（一覧・検索・並べ替え・追加・名前の変更・パスワードの再発行・削除。再発行と削除はパスワードの再入力で確認）、「パスキーの管理」（一覧・追加・削除。追加と削除はパスワードの再入力で確認。最後の1件は削除できない）、「アカウント」（パスワードの変更）が実装済みで、「利用データ」は「準備中」の表示。狭い画面では、メニューは ☰ ボタンで開閉する。期限切れ（401）のときは、ログイン画面へ戻る |
| ホーム | `./` | 起動時にユーザの一覧を表示し（#5）、選択すると（#7）そのユーザのホームへ移る。ホームには「絶対音感テスト」「相対音感テスト」「調性感テスト」「調性感訓練」のボタン（遷移先は準備中）を表示する。スーパーユーザのホームには「家族を編集」のボタンも表示し、ユーザの追加・名前の変更・削除（#10〜#12、#14。削除は #15 の確認あり）ができる。ログアウト（#6）。未ログインならログイン画面へ移る |

- メールのリンクの基準 URL（`publicBaseUrl`）は、これらの画面の置き場所（`…/app`）にする。例: `http://localhost:8888/uec-tst/server2/public/app`
- 画面は、API の基準パスを、自分の置き場所から決める（`…/public/index.php/api/v1`）。ドキュメントルートに置いても、サブパスに置いても動く。

## Web サーバの設定

- 公開ルートは `public/`。存在しないパスは、すべて `index.php` に渡す。
  - Apache：`public/.htaccess`（`mod_rewrite` が有効な場合）。`server2/.htaccess` は、リポジトリ全体が公開される配置でも、`public/` 以外に届かないようにする多重の防御。
  - nginx：`try_files $uri /index.php;` を設定する（`.htaccess` は無効）。
- `display_errors` は、`public/index.php` で常に無効にする。エラーの原因は、PHP のエラーログに残る。
