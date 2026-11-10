# Web API 仕様書：ユーザ管理・認証

基本方針（BasicPolicy.md）とテーブル仕様書（TableSpec_Account.md、TableSpec_Auth.md、TableSpec_Organization.md）に基づき、家族・ユーザの管理・認証の Web API を定義する。
組織（運用担当者を含む）の認証・管理の Web API は ApiSpec_Organization.md を参照。本仕様書の「10. 組織への所属」は、家族が組織に所属・解除する API である。

## 0. 共通事項

### 0.1 基本

- API はページと同一オリジンに置く（基本方針 4.1）。ベースパスは `/api/v1` とする。
- 通信はすべて HTTPS とし、HSTS（`Strict-Transport-Security`）を有効にする。
- リクエスト・レスポンスの本文は JSON（`Content-Type: application/json; charset=utf-8`）とする。
- ID は UUID の文字列表現（`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`、小文字）で受け渡す。
- 日時は ISO 8601 形式の UTC（例：`2026-11-04T09:30:00.000Z`）で返す。
- すべてのレスポンスに `Cache-Control: no-store` を付ける（復旧コードや家族の情報がキャッシュに残らないようにするため）。

### 0.2 認証（Cookie）

- 認証は Cookie のセッショントークンで行う（基本方針 4.）。

| 項目 | 値 |
|---|---|
| Cookie 名 | `__Host-sid` |
| 値 | 認証トークン本体（256bit の乱数を base64url で表したもの） |
| 属性 | `Secure; HttpOnly; SameSite=Lax; Path=/` （`Domain` 属性は付けない） |
| 有効期限 | `Max-Age=31536000`（365日）。最終利用から365日で切れる |

- 認証が必要な API で、Cookie がない、またはセッションが無効・期限切れの場合は `401 UNAUTHENTICATED` を返す。
  - セッションが無効・期限切れの場合は、レスポンスで Cookie を削除する（`Max-Age=0`）。
- スライディング更新（前回の更新から1時間以上経過したリクエスト、TableSpec_Auth.md 2.3）では、レスポンスで Cookie を再設定し、有効期限を延長する。

### 0.3 CSRF 対策

状態を変更するリクエスト（`POST`・`PUT`・`PATCH`・`DELETE`）では、以下をすべて満たさない場合に `403 FORBIDDEN_ORIGIN` を返す（基本方針 4.3）。

- `Origin` ヘッダが、このサービスのオリジンと完全に一致する。
- `Content-Type` が `application/json` である（本文のない `DELETE` を除く）。
  - HTML のフォームからは `application/json` で送信できないため、`SameSite=Lax` と合わせて、他サイトからの送信を防ぐ。

### 0.4 家族向けの重要な操作の確認

基本方針 9.2・9.3 の「家族向けの重要な操作」は、事前に確認（6.1）を済ませた端末でのみ実行できる。

- 確認は、スーパーユーザのパスワード、または登録済みのパスキー（生体認証、基本方針 9.4）で行う。パスワードが未設定の家族では、復旧コードで行う。
- 確認すると、その端末（セッション）で5分間、重要な操作を実行できる（`sessions.elevated_until`）。
- 確認していない、または5分を過ぎている場合、重要な操作の API は `403 ELEVATION_REQUIRED` を返す。
  - クライアントは、確認ダイアログ（パスワードの入力欄と「生体認証で確認」ボタン、または復旧コードの入力欄）を表示し、確認（6.1）の後に同じ操作をやり直す。
- ユーザの切り替えにはロックをかけない（基本方針 9.3 (a)）。確認は、どのユーザを選択中かに関係なく行える。

対象の操作（0.7 の一覧で「確認」欄が「必要」のもの）：

| 操作 | API |
|---|---|
| 他の端末のログアウト | #9 |
| ユーザの削除 | #14 |
| 復旧コードの再発行 | #16 |
| スーパーユーザのパスワードの設定・変更・削除 | #18・#19 |
| スーパーユーザを他のユーザへ移す | #20 |
| 退会 | #21 |
| パスキーの登録・削除 | #25・#26・#27 |
| 組織への所属の追加・解除 | #30・#31 |

### 0.5 エラーレスポンス

エラー時は、以下の形式で返す。

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "ユーザ名を入力してください。",
    "details": [
      { "field": "users[1].name", "code": "REQUIRED" }
    ]
  }
}
```

| 項目 | 説明 |
|---|---|
| `code` | エラーの種類（下表）。クライアントはこの値で処理を分ける |
| `message` | 利用者向けの日本語のメッセージ（画面にそのまま表示してよい） |
| `details` | 入力エラーの場合のみ。項目ごとのエラー |

| HTTP ステータス | `code` | 意味 |
|---|---|---|
| 400 | `BAD_REQUEST` | JSON として読めない、必須項目がない、型が違う |
| 401 | `UNAUTHENTICATED` | ログインしていない、セッションが無効・期限切れ |
| 401 | `INVALID_RECOVERY_CODE` | 復旧コードが一致しない |
| 401 | `INVALID_SUPERUSER_PASSWORD` | スーパーユーザのパスワードが一致しない |
| 401 | `PASSKEY_VERIFICATION_FAILED` | パスキーの検証に失敗した（署名・challenge・オリジンの不一致、未登録のパスキーなど） |
| 403 | `FORBIDDEN_ORIGIN` | CSRF 対策の検証に失敗した（0.3） |
| 403 | `ELEVATION_REQUIRED` | 家族向けの重要な操作の確認（0.4）が必要 |
| 404 | `NOT_FOUND` | 対象が存在しない、またはログイン中の家族に属していない。API のパスが存在しない場合も同じ |
| 405 | `METHOD_NOT_ALLOWED` | そのパスで使えないメソッド。`Allow` ヘッダに、使えるメソッドを付ける |
| 409 | `USER_LIMIT_REACHED` | ユーザが4名に達している |
| 409 | `LAST_USER` | 最後の1名のため削除できない |
| 409 | `SUPERUSER_CANNOT_BE_DELETED` | スーパーユーザは削除できない（先に他のユーザへ移す） |
| 409 | `DUPLICATE_USER_NAME` | 同じ家族内に同じユーザ名がある |
| 409 | `SUPERUSER_PASSWORD_NOT_SET` | パスワードが未設定の家族で、パスワードによる確認が要求された |
| 409 | `SUPERUSER_PASSWORD_ALREADY_SET` | パスワードが設定済みの家族で、復旧コードによる確認が要求された |
| 409 | `PASSKEYS_REGISTERED` | パスキーが登録されているため、パスワードを削除できない |
| 409 | `PASSKEY_LIMIT_REACHED` | パスキーが上限（10件）に達している |
| 409 | `ALREADY_MEMBER` | すでに同じ組織に所属している |
| 409 | `NOT_A_MEMBER` | 組織に所属していない |
| 410 | `REGISTRATION_TOKEN_INVALID` | 本登録URLのトークンが無効・期限切れ・使用済み |
| 410 | `INVITATION_INVALID` | 招待URLのトークンが無効・期限切れ・使用済み |
| 422 | `VALIDATION_FAILED` | 入力値が規則に合わない（`details` に項目ごとのエラー） |
| 422 | `CAPTCHA_FAILED` | CAPTCHA の検証に失敗した |
| 429 | `RATE_LIMITED` | 回数制限を超えた。`Retry-After` ヘッダに再試行までの秒数を付ける |
| 429 | `SUPERUSER_PASSWORD_LOCKED` | パスワードの連続失敗によりロック中。`Retry-After` ヘッダにロック解除までの秒数を付ける |
| 500 | `INTERNAL_ERROR` | サーバの内部エラー |
| 503 | `MAIL_SEND_FAILED` | 仮登録メールの送信に失敗した |

- 他の家族の ID を指定された場合は、存在しない場合と区別せず `404 NOT_FOUND` を返す（他の家族の ID の存在を推測させないため）。
- 確認が必要な操作では、`403 ELEVATION_REQUIRED` の判定を、他の検証（`404`・`409` など）より先に行う。

### 0.6 入力値の規則

| 項目 | 規則 |
|---|---|
| メールアドレス | 1〜254文字。`@` を含み、形式として妥当であること（実在の確認はしない） |
| ユーザ名 | 正規化（前後の空白の除去、Unicode の正規化）後に1〜20文字（TableSpec_Account.md 3.3） |
| 復旧コード | Crockford Base32 の25文字（乱数24文字＋チェック用1文字。例：`7K3QM-X9TPA-H2W8R-DF6NB-4CJZ3`、基本方針 6.1）。下記の正規化の後に25文字で、使える文字だけで構成され、チェック用の文字が正しいこと |
| スーパーユーザのパスワード | 4〜64文字。文字の種類は問わない（数字だけの PIN も可）。前後の空白も含めてそのまま扱う |

- 復旧コードの正規化（照合の前にサーバで行う。クライアントでも入力中に同じ変換をして表示してよい）
  1. ハイフン（`-`、全角の `－`・`ー` を含む）と空白（全角を含む）を除去する。
  2. 全角英数字を半角にし、小文字を大文字にする。
  3. 紛らわしい文字を置き換える：`O` → `0`、`I`・`L` → `1`。
  4. 25文字でない、または `U` など使えない文字が残っていれば `422 VALIDATION_FAILED`（照合せず、失敗回数にも数えない）。
  5. チェック用の文字が正しくなければ `422 VALIDATION_FAILED`（`details` の `code` は `CHECK_CHARACTER_MISMATCH`。照合せず、失敗回数にも数えない）。
- クライアントも、送信前に 4.・5. を検査し、誤りがあれば「入力ミスがあります。もう一度確かめてください」と表示する。
- チェック用の文字（Luhn mod 32）の計算方法
  - 文字の値は、Crockford Base32 の並び `0123456789ABCDEFGHJKMNPQRSTVWXYZ` での位置（0〜31）とする。
  - 発行時（乱数24文字から25文字目を求める）：
    1. 乱数24文字を右から順に見て、係数を 2, 1, 2, 1, … と交互に掛ける（右端が2）。
    2. 掛けた値 `a` を `floor(a / 32) + (a mod 32)` に置き換えて、すべて足す（合計 `s`）。
    3. `(32 − (s mod 32)) mod 32` の位置の文字をチェック用の文字とする。
  - 検査時（25文字すべて）：右端（チェック用の文字）から係数を 1, 2, 1, 2, … と掛けて同様に足し、合計が32で割り切れれば正しい。
  - 1文字の誤りはすべて検出できる。隣り合う2文字の入れ替えも、ほぼすべて検出できる。
  - 例：乱数 `7K3QMX9TPAH2W8RDF6NB4CJZ` のチェック用の文字は `3`（`7K3QM-X9TPA-H2W8R-DF6NB-4CJZ3`）。
- スーパーユーザのパスワードは、ログイン済みの端末での確認にのみ使い、ログインには使わないため、短いものも認める（基本方針 9.3）。総当たりは家族単位のロック（TableSpec_Account.md 2.3）で防ぐ。

### 0.7 API 一覧

| # | メソッド | パス | 認証 | 確認 | 概要 |
|---|---|---|---|---|---|
| 1 | POST | `/api/v1/registrations` | 不要 | | 仮登録（本登録URLをメールで送る） |
| 2 | POST | `/api/v1/registrations/verify` | 不要 | | 本登録URLのトークンの照合（DB は変更しない） |
| 3 | POST | `/api/v1/registrations/complete` | 不要 | | 本登録（家族・ユーザの作成、ログイン。招待経由の場合は組織に所属） |
| 4 | POST | `/api/v1/sessions` | 不要 | | 復旧コードによるログイン |
| 5 | GET | `/api/v1/sessions/current` | 必要 | | ログイン状態と家族の情報の取得 |
| 6 | DELETE | `/api/v1/sessions/current` | 必要 | | ログアウト |
| 7 | PUT | `/api/v1/sessions/current/selected-user` | 必要 | | ユーザの切り替え |
| 8 | GET | `/api/v1/sessions` | 必要 | | ログイン中の端末一覧 |
| 9 | DELETE | `/api/v1/sessions/{sessionId}` | 必要 | 必要 | 他の端末のログアウト |
| 10 | GET | `/api/v1/users` | 必要 | | ユーザ一覧 |
| 11 | POST | `/api/v1/users` | 必要 | | ユーザの追加 |
| 12 | PATCH | `/api/v1/users/{userId}` | 必要 | | ユーザ名の変更 |
| 13 | PUT | `/api/v1/users/order` | 必要 | | ユーザの並べ替え |
| 14 | DELETE | `/api/v1/users/{userId}` | 必要 | 必要 | ユーザの削除 |
| 15 | POST | `/api/v1/elevation` | 必要 | | 家族向けの重要な操作の確認（パスワードまたは復旧コード） |
| 16 | POST | `/api/v1/recovery-code` | 必要 | 必要 | 復旧コードの再発行 |
| 17 | GET | `/api/v1/superuser` | 必要 | | スーパーユーザとパスワードの設定状況の取得 |
| 18 | PUT | `/api/v1/superuser/password` | 必要 | 必要 | パスワードの設定・変更 |
| 19 | DELETE | `/api/v1/superuser/password` | 必要 | 必要 | パスワードの削除（未設定に戻す） |
| 20 | PUT | `/api/v1/superuser` | 必要 | 必要 | スーパーユーザを他のユーザへ移す |
| 21 | DELETE | `/api/v1/family` | 必要 | 必要 | 退会（家族とすべてのデータの削除） |
| 22 | POST | `/api/v1/superuser/password/reset` | 必要 | | パスワードを忘れた場合の再設定（復旧コードで確認） |
| 23 | POST | `/api/v1/elevation/passkey-options` | 必要 | | パスキーによる確認の開始（challenge の発行） |
| 24 | GET | `/api/v1/superuser/passkeys` | 必要 | | パスキーの一覧 |
| 25 | POST | `/api/v1/superuser/passkeys/registration-options` | 必要 | 必要 | パスキーの登録の開始（challenge の発行） |
| 26 | POST | `/api/v1/superuser/passkeys` | 必要 | 必要 | パスキーの登録 |
| 27 | DELETE | `/api/v1/superuser/passkeys/{passkeyId}` | 必要 | 必要 | パスキーの削除 |
| 28 | POST | `/api/v1/invitations/verify` | 不要 | | 組織の招待URLのトークンの照合（DB は変更しない） |
| 29 | GET | `/api/v1/organization-membership` | 必要 | | 所属している組織の取得 |
| 30 | POST | `/api/v1/organization-membership` | 必要 | 必要 | 登録済みの家族の組織への所属（招待を使う） |
| 31 | DELETE | `/api/v1/organization-membership` | 必要 | 必要 | 組織への所属の解除 |

### 0.8 共通のデータ形式

**ユーザ（`User`）**

```json
{ "id": "0192f3a0-...", "name": "おとうさん", "displayOrder": 1, "isSuperuser": true }
```

**家族（`Family`）**

```json
{
  "users": [
    { "id": "0192f3a0-...", "name": "おとうさん", "displayOrder": 1, "isSuperuser": true },
    { "id": "0192f3a1-...", "name": "はなこ", "displayOrder": 2, "isSuperuser": false }
  ],
  "selectedUserId": "0192f3a0-...",
  "superuserPasswordSet": true,
  "superuserPasskeyRegistered": true,
  "organization": { "name": "○○大学", "joinedAt": "2026-11-04T09:30:00.000Z" }
}
```

| 項目 | 説明 |
|---|---|
| `users` | 表示順に並べる |
| `selectedUserId` | この端末で選択中のユーザ。未選択（選択中のユーザが削除された場合など）は `null` |
| `superuserPasswordSet` | スーパーユーザのパスワードが設定済みなら `true`。確認（6.1）でパスワードと復旧コードのどちらを求めるかの判断に使う |
| `superuserPasskeyRegistered` | パスキーが1件以上登録されていれば `true`。確認ダイアログに「生体認証で確認」ボタンを表示するかの判断に使う |
| `organization` | 所属している組織。所属していない（個人ユーザ）なら `null`。`name` は組織名、`joinedAt` は所属した日時（基本方針 10.） |

## 1. 登録

### 1.1 仮登録 `POST /api/v1/registrations`

入力されたメールアドレスに本登録URLを送る（基本方針 3.1）。

**リクエスト**

```json
{
  "email": "user@example.com",
  "captchaToken": "（CAPTCHA ウィジェットが発行したトークン）"
}
```

**処理**

1. CAPTCHA のトークンを検証する。失敗したら `422 CAPTCHA_FAILED`。
2. 回数制限（システム全体・IP 単位）を確認する。超えていたら `429 RATE_LIMITED`。
3. メールアドレスの形式を検証する。不正なら `422 VALIDATION_FAILED`。
4. トークンを生成し、`pending_registrations` にハッシュと有効期限のみを保存する。
5. 本登録URL（`https://<ホスト>/register#token=<トークン>`）をメールで送る。
   - トークンはフラグメントに含め、サーバのアクセスログに残らないようにする（基本方針 3.2、7.）。
6. 送信に失敗した場合は、エラーログにメールアドレスと失敗理由を記録し（基本方針 7.）、4. の行を削除して `503 MAIL_SEND_FAILED` を返す。

- メールアドレスは保存しない。送信成功時はログにも記録しない（基本方針 3.1、7.）。

**レスポンス** `202 Accepted`

```json
{
  "sender": "no-reply@example.com"
}
```

| 項目 | 説明 |
|---|---|
| `sender` | 送信元アドレス。送信完了画面で、迷惑メールフォルダの確認とあわせて案内する（基本方針 3.1） |

**エラー**：`422 CAPTCHA_FAILED`、`422 VALIDATION_FAILED`、`429 RATE_LIMITED`、`503 MAIL_SEND_FAILED`

### 1.2 本登録URLのトークンの照合 `POST /api/v1/registrations/verify`

本登録ページ（`/register#token=...`）が表示時に呼び出し、ユーザ名入力画面を表示してよいかを確認する。

- DB は変更しない（基本方針 3.2）。JavaScript を実行するリンクスキャナーがページを開いても、トークンは消費されない。
- ページ自体の GET（`/register`）でも DB を変更しない。サーバにはフラグメントが届かないため、ページの GET ではトークンを扱わない。

**本登録ページ（クライアント）の処理**

1. `location.hash` からトークンを読み取る。
   - フラグメントにトークンがなければ、`sessionStorage` に保持したトークンを使う（再読み込みの場合）。どちらにもなければ、「メールのリンクを開き直してください」と表示する。
2. トークンを `sessionStorage` に保持し、`history.replaceState(null, '', '/register')` で URL からフラグメントを消す。
3. この API を呼び出し、`200` ならユーザ名入力画面を、`410` なら「リンクが無効または期限切れです」と表示する。
4. 本登録（1.3）が成功したら、`sessionStorage` のトークンを削除する。

- 本登録ページには、URL 全体を外部に送るアクセス解析などのスクリプトを読み込まない。

**リクエスト**

```json
{
  "token": "（本登録URLのトークン）"
}
```

**レスポンス** `200 OK`

```json
{
  "expiresAt": "2026-11-05T09:30:00.000Z"
}
```

**エラー**：`410 REGISTRATION_TOKEN_INVALID`、`429 RATE_LIMITED`

### 1.3 本登録 `POST /api/v1/registrations/complete`

家族とユーザを作成し、この端末でログインした状態にする（基本方針 3.2）。

**リクエスト**

```json
{
  "token": "（本登録URLのトークン）",
  "users": [
    { "name": "おとうさん" },
    { "name": "はなこ" }
  ]
}
```

| 項目 | 規則 |
|---|---|
| `users` | 1〜4件。配列の順が表示順（`displayOrder` 1〜）。**1件目のユーザがスーパーユーザになる** |
| `users[].name` | 0.6 の規則。配列内で重複しないこと |

- ユーザ名入力画面では、「1人目は家族の管理をする人（保護者など）にしてください」と案内する。

**招待経由の本登録**（基本方針 11.3）

- `token` の代わりに `invitationToken`（招待URLのトークン）を指定する。どちらか一方だけを指定する（両方、またはどちらもない場合は `400 BAD_REQUEST`）。
- 招待メールが届いたことがメールアドレスの確認になるため、仮登録（#1）は不要。招待ページ（基本方針 11.1）の「新しく登録する」から呼び出す。

```json
{
  "invitationToken": "（招待URLのトークン）",
  "users": [
    { "name": "おとうさん" }
  ]
}
```

- 処理は下記と同じとする。ただし、次の点が異なる。
  - 1. は、`pending_registrations` ではなく、`organization_invitations` から招待を取り出して削除する（TableSpec_Organization.md 5.3）。取り出せなければ `410 INVITATION_INVALID`。
  - 2. で `families` を作成するときに、`organization_id`（招待した組織）と `organization_joined_at`（現在時刻）を設定する。
- レスポンスの `family` の `organization` に、所属した組織が入る。

**処理**（1つのトランザクション）

1. `pending_registrations` から、トークンのハッシュが一致し有効期限内の行を削除する。影響行数が1でなければ `410 REGISTRATION_TOKEN_INVALID`（TableSpec_Auth.md 3.3）。
2. `families` を作成し、復旧コードを生成して HMAC を保存する（スーパーユーザのパスワードは未設定）。
3. `users` を作成する（1件目を `is_superuser = 1` とする）。
4. `sessions` を作成する（`selected_user_id` は1人目のユーザ）。
5. コミット後、Cookie を設定する。

- 入力値のエラーは、トークンを消費する前（1. の前）に検証して返す。入力をやり直せば同じトークンで再試行できる。

**レスポンス** `201 Created`（`Set-Cookie: __Host-sid=...`）

```json
{
  "recoveryCode": "7K3QM-X9TPA-H2W8R-DF6NB-4CJZ3",
  "family": { "users": [ ... ], "selectedUserId": "0192f3a0-...", "superuserPasswordSet": false }
}
```

| 項目 | 説明 |
|---|---|
| `recoveryCode` | 復旧コード。**このレスポンスでのみ返す**。画面に表示して控えてもらい、「復旧コードと Cookie の両方を失うと復旧できない」ことを明示する |
| `family` | 0.8 の `Family` |

- 復旧コードは5文字ずつハイフンで区切った形式で返す（基本方針 6.1）。
- クライアントは、復旧コードの控え方として、表示・コピー・テキストファイルでの保存・印刷を用意し、「控えました」にチェックを付けるまで次の画面へ進めないようにする（復旧コードの再発行（6.3）でも同じ）。
- 本登録の完了画面で、スーパーユーザのパスワードの設定（7.2）を案内する。

**エラー**：`410 REGISTRATION_TOKEN_INVALID`、`410 INVITATION_INVALID`（招待経由の場合）、`422 VALIDATION_FAILED`、`429 RATE_LIMITED`

## 2. ログイン・ログアウト

### 2.1 復旧コードによるログイン `POST /api/v1/sessions`

Cookie が消えた場合や、別のブラウザ・端末で利用する場合にログインする（基本方針 6.）。

**リクエスト**

```json
{
  "recoveryCode": "7K3QM-X9TPA-H2W8R-DF6NB-4CJZ3"
}
```

**処理**

1. 回数制限（システム全体・IP 単位）を確認する。超えていたら `429 RATE_LIMITED`。
2. 復旧コードを正規化（0.6）し、有効なすべての鍵で HMAC 化して `families.recovery_code_hash` を検索する（TableSpec_Account.md 2.3）。
3. 見つからなければ、失敗回数を加算して `401 INVALID_RECOVERY_CODE`。
4. `sessions` を作成し、Cookie を設定する。
   - リクエストに有効な Cookie がある場合は、そのセッションを削除してから作成する（同じブラウザに古いセッションを残さないため）。
   - `selected_user_id` は表示順が最初のユーザとする。
   - `elevated_until` は NULL とする（ログインしただけでは、重要な操作の確認は済んでいない扱いとする）。

**レスポンス** `201 Created`（`Set-Cookie: __Host-sid=...`）

```json
{
  "family": { "users": [ ... ], "selectedUserId": "0192f3a0-...", "superuserPasswordSet": true }
}
```

**エラー**：`401 INVALID_RECOVERY_CODE`、`422 VALIDATION_FAILED`、`429 RATE_LIMITED`

### 2.2 ログイン状態の取得 `GET /api/v1/sessions/current`

アプリの起動時に呼び出し、ログイン状態と家族の情報を取得する。

**レスポンス** `200 OK`

```json
{
  "session": {
    "id": "0192f3a0-...",
    "deviceLabel": "iPhone / Safari",
    "createdAt": "2026-11-04T09:30:00.000Z",
    "expiresAt": "2027-11-04T09:30:00.000Z",
    "elevatedUntil": null
  },
  "family": { "users": [ ... ], "selectedUserId": "0192f3a0-...", "superuserPasswordSet": true }
}
```

| 項目 | 説明 |
|---|---|
| `session.elevatedUntil` | 重要な操作を実行できる期限（0.4）。確認していない、または期限を過ぎていれば `null` |
| `family` | 0.8 の `Family` |

**エラー**：`401 UNAUTHENTICATED`（未ログイン。クライアントは復旧コードの入力画面または登録画面を表示する）

### 2.3 ログアウト `DELETE /api/v1/sessions/current`

この端末のセッションを削除し、Cookie を削除する（`Max-Age=0`）。確認（0.4）は不要。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`

## 3. ユーザの切り替え

### 3.1 ユーザの切り替え `PUT /api/v1/sessions/current/selected-user`

この端末で使用するユーザを切り替える（基本方針 5.）。次回の起動時も、このユーザを選択した状態で開く。ロックはかけない（基本方針 9.3 (a)）。

**リクエスト**

```json
{
  "userId": "0192f3a0-..."
}
```

**処理**：指定されたユーザがログイン中の家族に属することを確認し、`sessions.selected_user_id` を更新する。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`、`404 NOT_FOUND`

### 3.2 ユーザごとの利用データの API について

- ユーザごとの利用データを扱う API（本仕様書の対象外）は、パスに `userId` を含める（例：`/api/v1/users/{userId}/...`）。
- サーバは、リクエストのたびに `userId` がログイン中の家族に属することを確認し、属していなければ `404 NOT_FOUND` を返す（基本方針 5.）。
- `selected_user_id` は次回起動時の初期表示のためのもので、利用データの API の認可には使わない（同じ端末の複数のタブで別のユーザを開いても正しく動くようにするため）。
- 利用データは、ユーザの削除・退会の後も保持される（基本方針 10.7）。利用データを登録する API は、`userId` がログイン中の家族に属することを確認したうえで、`user_id` に保存する（TableSpec_Account.md 5.2）。削除されたユーザの `userId` を指定した API は、`404 NOT_FOUND` を返す。
- 組織・運用担当者が利用データを参照する API は、ApiSpec_Organization.md の対象とする。

## 4. 端末の管理

### 4.1 ログイン中の端末一覧 `GET /api/v1/sessions`

**レスポンス** `200 OK`

```json
{
  "sessions": [
    {
      "id": "0192f3a0-...",
      "deviceLabel": "iPhone / Safari",
      "createdAt": "2026-11-04T09:30:00.000Z",
      "lastUsedAt": "2026-11-04T12:00:00.000Z",
      "current": true
    },
    {
      "id": "0192f3a1-...",
      "deviceLabel": "Android / Chrome",
      "createdAt": "2026-10-01T08:00:00.000Z",
      "lastUsedAt": "2026-11-03T19:20:00.000Z",
      "current": false
    }
  ]
}
```

| 項目 | 説明 |
|---|---|
| `sessions` | 最終利用日時の新しい順。期限切れのものは含めない |
| `current` | このリクエストを送った端末なら `true` |
| `lastUsedAt` | スライディング更新の間隔（1時間）の分だけ、実際より古い場合がある |

**エラー**：`401 UNAUTHENTICATED`

### 4.2 他の端末のログアウト `DELETE /api/v1/sessions/{sessionId}`

端末を紛失した場合などに、他の端末のセッションを削除する。**確認（0.4）が必要**。

- 自分の端末（`current` が `true`）を指定した場合は、確認なしで削除し、Cookie を削除する（2.3 と同じ動作）。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`、`403 ELEVATION_REQUIRED`、`404 NOT_FOUND`

## 5. ユーザの管理

### 5.1 ユーザ一覧 `GET /api/v1/users`

**レスポンス** `200 OK`

```json
{
  "users": [
    { "id": "0192f3a0-...", "name": "おとうさん", "displayOrder": 1, "isSuperuser": true },
    { "id": "0192f3a1-...", "name": "はなこ", "displayOrder": 2, "isSuperuser": false }
  ]
}
```

- 2.2 の `family.users` と同じ内容。ユーザの追加・削除・並べ替え後の再取得に使う。

**エラー**：`401 UNAUTHENTICATED`

### 5.2 ユーザの追加 `POST /api/v1/users`

**リクエスト**

```json
{
  "name": "たろう"
}
```

**処理**（1つのトランザクション）

1. `families` の行を `SELECT ... FOR UPDATE` でロックする（TableSpec_Account.md 3.3）。
2. ユーザが4名なら `409 USER_LIMIT_REACHED`。
3. 空いている最小の `slot` と、末尾の表示順（現在の人数＋1）を割り当てて `users` を作成する（`is_superuser = 0`）。同じユーザ名があれば `409 DUPLICATE_USER_NAME`。

**レスポンス** `201 Created`

```json
{
  "user": { "id": "0192f3a2-...", "name": "たろう", "displayOrder": 3, "isSuperuser": false }
}
```

**エラー**：`401 UNAUTHENTICATED`、`409 USER_LIMIT_REACHED`、`409 DUPLICATE_USER_NAME`、`422 VALIDATION_FAILED`

### 5.3 ユーザ名の変更 `PATCH /api/v1/users/{userId}`

**リクエスト**

```json
{
  "name": "たろちゃん"
}
```

**レスポンス** `200 OK`

```json
{
  "user": { "id": "0192f3a2-...", "name": "たろちゃん", "displayOrder": 3, "isSuperuser": false }
}
```

**エラー**：`401 UNAUTHENTICATED`、`404 NOT_FOUND`、`409 DUPLICATE_USER_NAME`、`422 VALIDATION_FAILED`

### 5.4 ユーザの並べ替え `PUT /api/v1/users/order`

切り替え画面での表示順を変更する。

**リクエスト**

```json
{
  "userIds": ["0192f3a1-...", "0192f3a0-...", "0192f3a2-..."]
}
```

| 項目 | 規則 |
|---|---|
| `userIds` | 家族のすべてのユーザの ID を、新しい表示順に並べたもの。過不足・重複があれば `422 VALIDATION_FAILED` |

**処理**（1つのトランザクション）

1. `families` の行を `SELECT ... FOR UPDATE` でロックする。
2. `userIds` が家族のユーザとちょうど一致することを確認する（並べ替え画面を開いた後に、他の端末でユーザが追加・削除された場合を検出するため）。
3. 各ユーザの `display_order` を、配列の位置（1〜）に更新する。

**レスポンス** `200 OK`

```json
{
  "users": [ ... ]
}
```

- `users` は 5.1 と同じ形式（新しい表示順）。

**エラー**：`401 UNAUTHENTICATED`、`422 VALIDATION_FAILED`

- `422` の場合、クライアントはユーザ一覧（5.1）を取得し直して並べ替え画面を更新する。

### 5.5 ユーザの削除 `DELETE /api/v1/users/{userId}`

ユーザを削除する（基本方針 5.）。**確認（0.4）が必要**。

- **そのユーザの利用データは削除しない**（基本方針 10.7）。削除の後、その記録は、家族からは見られなくなり、運用担当者のみが参照できる。
- 確認ダイアログはクライアントで表示する。ダイアログには、「このユーザの記録（テスト結果）は、アプリから見られなくなるが、削除はされず、研究のために保持される」ことを明示する。
- このユーザを選択中の端末は、`selected_user_id` が `NULL` になる（TableSpec_Auth.md 2.2）。

**処理**（1つのトランザクション）

1. `families` の行を `SELECT ... FOR UPDATE` でロックする。
2. 対象がスーパーユーザなら `409 SUPERUSER_CANNOT_BE_DELETED`。
3. ユーザが1名なら `409 LAST_USER`（スーパーユーザは削除できないため、通常は 2. で止まる）。
4. `users` の行を削除する（利用データは、外部キーを持たないため、そのまま残る。TableSpec_Account.md 5.2）。
5. 後ろのユーザの `display_order` を1つずつ詰める。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`、`403 ELEVATION_REQUIRED`、`404 NOT_FOUND`、`409 SUPERUSER_CANNOT_BE_DELETED`、`409 LAST_USER`

## 6. 確認と復旧コード

### 6.1 家族向けの重要な操作の確認 `POST /api/v1/elevation`

スーパーユーザのパスワード・パスキー（未設定の家族では復旧コード）を確認し、この端末で5分間、重要な操作を実行できるようにする（0.4）。

**リクエスト**（いずれか1つ）

```json
{ "superuserPassword": "1234" }
```

```json
{
  "passkey": {
    "id": "（クレデンシャル ID、base64url）",
    "rawId": "（同上）",
    "type": "public-key",
    "response": {
      "clientDataJSON": "（base64url）",
      "authenticatorData": "（base64url）",
      "signature": "（base64url）",
      "userHandle": "（base64url）"
    }
  }
}
```

```json
{ "recoveryCode": "7K3QM-X9TPA-H2W8R-DF6NB-4CJZ3" }
```

- `passkey` は、`navigator.credentials.get()` が返した `PublicKeyCredential` を JSON にしたもの（`toJSON()` の形式）。事前に #23 で challenge を受け取っておく。
- パスワードが設定済みの家族では `superuserPassword` または `passkey`、未設定の家族では `recoveryCode` のみを受け付ける。
  - 設定済みの家族に `recoveryCode` が送られたら `409 SUPERUSER_PASSWORD_ALREADY_SET`、未設定の家族に `superuserPassword` が送られたら `409 SUPERUSER_PASSWORD_NOT_SET`。
  - パスワードが設定済みの家族で復旧コードによる確認を認めないのは、パスワードを設定した意味（日常の確認はパスワードで行う）を保つため。
  - パスワードを忘れた場合は、復旧コードでパスワードを再設定する（7.5）。

**処理（パスワードの場合）**（1つのトランザクション）

1. `families` の行を `SELECT ... FOR UPDATE` でロックする。
2. ロック中なら `429 SUPERUSER_PASSWORD_LOCKED`（`Retry-After` にロック解除までの秒数）。
3. パスワードを照合する。一致しなければ失敗回数を加算し（5回でロック、TableSpec_Account.md 2.3）、`401 INVALID_SUPERUSER_PASSWORD`。
4. 一致したら失敗回数を0に戻し、`sessions.elevated_until` を現在時刻の5分後とする。

**処理（パスキーの場合）**

1. このセッションの challenge（#23 で発行）を `webauthn_challenges` から取り出して削除する（TableSpec_Auth.md 4.2）。なければ `401 PASSKEY_VERIFICATION_FAILED`。
2. `credential_id` で `passkeys` を検索し、ログイン中の家族のものであることを確認する。なければ `401 PASSKEY_VERIFICATION_FAILED`。
3. WebAuthn の手順に従って検証する（サーバ側の WebAuthn ライブラリを使う）。
   - challenge・オリジン・RP ID が一致すること
   - ユーザ検証（生体認証または端末のパスコード）が行われたこと（UV フラグ）
   - 公開鍵で署名が検証できること
   - 署名カウンタ（TableSpec_Account.md 4.3）
   - いずれかに失敗したら `401 PASSKEY_VERIFICATION_FAILED`。
4. 成功したら、`passkeys` の `sign_count`・`last_used_at` を更新し、`sessions.elevated_until` を現在時刻の5分後とする。

- パスキーの失敗は、パスワードの失敗回数（家族単位のロック）に数えない。パスキーは推測による総当たりができないため。

**処理（復旧コードの場合）**

1. 回数制限（復旧コードによるログインと同じ IP 単位の失敗回数）を確認する。超えていたら `429 RATE_LIMITED`。
2. 復旧コードを HMAC 化し、ログイン中の家族の `recovery_code_hash` と照合する。一致しなければ失敗回数を加算し、`401 INVALID_RECOVERY_CODE`。
3. 一致したら、`sessions.elevated_until` を現在時刻の5分後とする。

**レスポンス** `200 OK`

```json
{
  "elevatedUntil": "2026-11-04T09:35:00.000Z"
}
```

**エラー**：`401 UNAUTHENTICATED`、`401 INVALID_SUPERUSER_PASSWORD`、`401 PASSKEY_VERIFICATION_FAILED`、`401 INVALID_RECOVERY_CODE`、`409 SUPERUSER_PASSWORD_NOT_SET`、`409 SUPERUSER_PASSWORD_ALREADY_SET`、`422 VALIDATION_FAILED`、`429 SUPERUSER_PASSWORD_LOCKED`、`429 RATE_LIMITED`

### 6.2 パスキーによる確認の開始 `POST /api/v1/elevation/passkey-options`

パスキーで確認する前に、challenge を発行する。

**リクエスト**：本文なし（`{}`）

**処理**

1. パスワードが未設定、またはパスキーが登録されていない家族なら `409 SUPERUSER_PASSWORD_NOT_SET` または `404 NOT_FOUND`。
2. 32バイトの challenge を生成し、このセッションに紐付けて5分間保持する（`webauthn_challenges`、`purpose` は `family_elevation`。TableSpec_Auth.md 4.2）。

**レスポンス** `200 OK`

`navigator.credentials.get({ publicKey })` にそのまま渡せる形式（`PublicKeyCredentialRequestOptions` の JSON 表現）で返す。

```json
{
  "challenge": "（base64url）",
  "rpId": "example.com",
  "timeout": 300000,
  "userVerification": "required",
  "allowCredentials": [
    { "type": "public-key", "id": "（クレデンシャル ID、base64url）", "transports": ["internal", "hybrid"] }
  ]
}
```

- `allowCredentials` には、家族のパスキーをすべて含める。
- `userVerification` は `required` とする（生体認証または端末のパスコードを必ず求める）。

**エラー**：`401 UNAUTHENTICATED`、`404 NOT_FOUND`、`409 SUPERUSER_PASSWORD_NOT_SET`、`429 RATE_LIMITED`

### 6.3 復旧コードの再発行 `POST /api/v1/recovery-code`

復旧コードを新しくし、旧コードを無効にする（基本方針 6.1）。**確認（0.4）が必要**。

**リクエスト**：本文なし（`{}`）

**処理**（1つのトランザクション）

1. 回数制限（家族単位）を確認する。超えていたら `429 RATE_LIMITED`。
2. 新しい復旧コードを生成し、`families` の `recovery_code_hash`・`recovery_code_key_id`・`recovery_code_issued_at` を更新する。
3. 操作中の端末以外の、同じ家族の `sessions` を削除する。

**レスポンス** `200 OK`

```json
{
  "recoveryCode": "M8RQ2-ZT4KD-W7HXA-9CNPF-3BJE1",
  "revokedSessionCount": 2
}
```

| 項目 | 説明 |
|---|---|
| `recoveryCode` | 新しい復旧コード。**このレスポンスでのみ返す** |
| `revokedSessionCount` | ログアウトさせた他の端末の数 |

**エラー**：`401 UNAUTHENTICATED`、`403 ELEVATION_REQUIRED`、`429 RATE_LIMITED`

## 7. スーパーユーザ

### 7.1 スーパーユーザとパスワードの設定状況の取得 `GET /api/v1/superuser`

**レスポンス** `200 OK`

```json
{
  "superuserId": "0192f3a0-...",
  "passwordSet": true,
  "passwordLockedUntil": null
}
```

| 項目 | 説明 |
|---|---|
| `superuserId` | スーパーユーザの `users.id` |
| `passwordSet` | パスワードが設定済みなら `true` |
| `passwordLockedUntil` | パスワードの入力がロック中なら解除日時。ロックしていなければ `null` |

**エラー**：`401 UNAUTHENTICATED`

### 7.2 パスワードの設定・変更 `PUT /api/v1/superuser/password`

スーパーユーザのパスワードを設定する（設定済みなら変更する）。**確認（0.4）が必要**。

- 未設定の家族は復旧コードで、設定済みの家族は現在のパスワード（またはパスキー）で確認してから実行する。
- 子供がパスワードを設定・変更して、親が重要な操作をできなくなることを防ぐため、設定にも確認を求める。

**リクエスト**

```json
{
  "newPassword": "4821"
}
```

| 項目 | 規則 |
|---|---|
| `newPassword` | 0.6 の規則 |

- 確認のための再入力（2回入力）はクライアントで行う。

**処理**：パスワードを Argon2id でハッシュ化して `families.superuser_password_hash` に保存し、失敗回数とロックを初期値に戻す。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`、`403 ELEVATION_REQUIRED`、`422 VALIDATION_FAILED`

### 7.3 パスワードの削除 `DELETE /api/v1/superuser/password`

パスワードを未設定に戻す。以降の確認は復旧コードで行う。**確認（0.4）が必要**。

**処理**

1. パスキーが1件以上登録されていれば `409 PASSKEYS_REGISTERED`（先にパスキーを削除する。TableSpec_Account.md 4.3）。
2. `families` の `superuser_password_hash`・`superuser_password_failed_count`・`superuser_password_locked_until` を初期値（NULL・0・NULL）に戻す。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`、`403 ELEVATION_REQUIRED`、`409 PASSKEYS_REGISTERED`

### 7.4 スーパーユーザを他のユーザへ移す `PUT /api/v1/superuser`

**確認（0.4）が必要**。パスワードは家族に1つのため、移した後も同じパスワードを使う（TableSpec_Account.md 2.3）。

**リクエスト**

```json
{
  "userId": "0192f3a1-..."
}
```

**処理**（1つのトランザクション）

1. `families` の行を `SELECT ... FOR UPDATE` でロックする。
2. 指定されたユーザがログイン中の家族に属することを確認する。
3. 現在のスーパーユーザを `is_superuser = 0` に、指定されたユーザを `is_superuser = 1` に、この順に更新する（TableSpec_Account.md 3.3）。
   - 指定されたユーザが既にスーパーユーザなら、何もしない。

**レスポンス** `200 OK`

```json
{
  "users": [ ... ]
}
```

- `users` は 5.1 と同じ形式。

**エラー**：`401 UNAUTHENTICATED`、`403 ELEVATION_REQUIRED`、`404 NOT_FOUND`

### 7.5 パスワードの再設定 `POST /api/v1/superuser/password/reset`

パスワードを忘れた場合に、復旧コードで本人確認をしてパスワードを再設定する。確認（0.4）は不要（リクエストの復旧コードで確認する）。

- クライアントは、確認ダイアログ（6.1）の「パスワードを忘れた場合」からこの画面を開く。

**リクエスト**

```json
{
  "recoveryCode": "7K3QM-X9TPA-H2W8R-DF6NB-4CJZ3",
  "newPassword": "7390"
}
```

**処理**（1つのトランザクション）

1. 回数制限（復旧コードによるログインと同じ IP 単位の失敗回数）を確認する。超えていたら `429 RATE_LIMITED`。
2. 復旧コードを HMAC 化し、ログイン中の家族の `recovery_code_hash` と照合する。一致しなければ失敗回数を加算し、`401 INVALID_RECOVERY_CODE`。
3. 新しいパスワードを保存し、失敗回数とロックを初期値に戻す（ロック中でも再設定できる）。
4. `sessions.elevated_until` を現在時刻の5分後とする（再設定の直後に重要な操作を続けられるようにするため）。

**レスポンス** `200 OK`

```json
{
  "elevatedUntil": "2026-11-04T09:35:00.000Z"
}
```

**エラー**：`401 UNAUTHENTICATED`、`401 INVALID_RECOVERY_CODE`、`422 VALIDATION_FAILED`、`429 RATE_LIMITED`

### 7.6 パスキーの一覧 `GET /api/v1/superuser/passkeys`

**レスポンス** `200 OK`

```json
{
  "passkeys": [
    {
      "id": "0192f3b0-...",
      "name": "iPhone / Safari で登録",
      "synced": true,
      "createdAt": "2026-11-04T09:30:00.000Z",
      "lastUsedAt": "2026-11-04T12:00:00.000Z"
    }
  ]
}
```

| 項目 | 説明 |
|---|---|
| `passkeys` | 登録日時の新しい順 |
| `synced` | 同期パスキー（`backup_eligible`）なら `true`。「同じ Apple ID / Google アカウントの他の端末でも使えます」と表示する |
| `lastUsedAt` | 未使用は `null` |

**エラー**：`401 UNAUTHENTICATED`

### 7.7 パスキーの登録の開始 `POST /api/v1/superuser/passkeys/registration-options`

**確認（0.4）が必要**。パスキーを登録する前に、challenge を発行する。

**リクエスト**：本文なし（`{}`）

**処理**

1. パスワードが未設定なら `409 SUPERUSER_PASSWORD_NOT_SET`（パスキーの登録はパスワードが設定済みの家族のみ。TableSpec_Account.md 4.3）。
2. パスキーが10件なら `409 PASSKEY_LIMIT_REACHED`。
3. 32バイトの challenge を生成し、このセッションに紐付けて5分間保持する（`webauthn_challenges`、`purpose` は `family_registration`）。

**レスポンス** `200 OK`

`navigator.credentials.create({ publicKey })` にそのまま渡せる形式（`PublicKeyCredentialCreationOptions` の JSON 表現）で返す。

```json
{
  "challenge": "（base64url）",
  "rp": { "id": "example.com", "name": "（サービス名）" },
  "user": {
    "id": "（families.id、base64url）",
    "name": "家族の管理用",
    "displayName": "家族の管理用"
  },
  "pubKeyCredParams": [
    { "type": "public-key", "alg": -7 },
    { "type": "public-key", "alg": -257 }
  ],
  "timeout": 300000,
  "attestation": "none",
  "authenticatorSelection": {
    "residentKey": "preferred",
    "userVerification": "required"
  },
  "excludeCredentials": [
    { "type": "public-key", "id": "（登録済みのクレデンシャル ID、base64url）" }
  ]
}
```

| 項目 | 説明 |
|---|---|
| `user.id` | `families.id`。個人情報を含まない（TableSpec_Account.md 4.3） |
| `user.name`・`user.displayName` | 端末のパスキーの管理画面に表示される名前。ユーザ名は使わず、固定の文言とする |
| `pubKeyCredParams` | ES256（-7）と RS256（-257） |
| `attestation` | `none`（認証器の機種の証明は求めない） |
| `excludeCredentials` | 登録済みのパスキー。同じ認証器に二重に登録しないようにする |

- クライアントは、パスキーを登録する前に「家族共用のタブレットでは、子供も端末のパスコードで確認を通過できる場合があります。共用の端末ではパスワードでの確認をおすすめします」と案内する（基本方針 9.4）。

**エラー**：`401 UNAUTHENTICATED`、`403 ELEVATION_REQUIRED`、`409 SUPERUSER_PASSWORD_NOT_SET`、`409 PASSKEY_LIMIT_REACHED`、`429 RATE_LIMITED`

### 7.8 パスキーの登録 `POST /api/v1/superuser/passkeys`

**確認（0.4）が必要**。

**リクエスト**

```json
{
  "credential": {
    "id": "（クレデンシャル ID、base64url）",
    "rawId": "（同上）",
    "type": "public-key",
    "response": {
      "clientDataJSON": "（base64url）",
      "attestationObject": "（base64url）",
      "transports": ["internal", "hybrid"]
    }
  }
}
```

- `credential` は、`navigator.credentials.create()` が返した `PublicKeyCredential` を JSON にしたもの（`toJSON()` の形式）。

**処理**

1. このセッションの challenge（7.7 で発行）を `webauthn_challenges` から取り出して削除する。なければ `401 PASSKEY_VERIFICATION_FAILED`。
2. WebAuthn の手順に従って検証する（challenge・オリジン・RP ID の一致、UV フラグ）。失敗したら `401 PASSKEY_VERIFICATION_FAILED`。
3. パスキーが10件なら `409 PASSKEY_LIMIT_REACHED`（7.7 の後に他の端末で登録された場合）。
4. `passkeys` に、クレデンシャル ID・公開鍵・署名カウンタ・通信方式・同期パスキーかどうか・名前（User-Agent から作る）を保存する。

**レスポンス** `201 Created`

```json
{
  "passkey": {
    "id": "0192f3b0-...",
    "name": "iPhone / Safari で登録",
    "synced": true,
    "createdAt": "2026-11-04T09:30:00.000Z",
    "lastUsedAt": null
  }
}
```

**エラー**：`401 UNAUTHENTICATED`、`401 PASSKEY_VERIFICATION_FAILED`、`403 ELEVATION_REQUIRED`、`409 PASSKEY_LIMIT_REACHED`

### 7.9 パスキーの削除 `DELETE /api/v1/superuser/passkeys/{passkeyId}`

**確認（0.4）が必要**。

- サーバの `passkeys` の行を削除する。端末（認証器）に残ったパスキー自体はサーバから削除できないため、クライアントは「端末のパスキーの管理画面からも削除してください」と案内する。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`、`403 ELEVATION_REQUIRED`、`404 NOT_FOUND`

## 8. 退会

### 8.1 退会 `DELETE /api/v1/family`

家族と、すべてのユーザ・セッション・パスキー・組織への所属を削除する（TableSpec_Account.md 5.1）。**利用データは削除せず、保持する**（基本方針 10.7）。**確認（0.4）が必要**。

- 削除したアカウント情報は復元できない。クライアントは、削除される内容（すべてのユーザ名、すべての端末のログイン、組織への所属）を表示し、確認ダイアログで同意を得てから呼び出す。
- ダイアログには、「記録（テスト結果）は削除されず、研究のために保持されること」と「退会の後は、自分では見られなくなること」を明示する。
- 他の端末のセッションも削除されるため、他の端末は次のリクエストで `401 UNAUTHENTICATED` になる。

**処理**：`families` の行を削除する（`ON DELETE CASCADE` で、ユーザ・パスキー・セッションが削除される。利用データは、外部キーを持たないため、そのまま残る。TableSpec_Account.md 5.2）。Cookie を削除する（`Max-Age=0`）。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`、`403 ELEVATION_REQUIRED`

## 9. 回数制限

| 対象 API | 単位 | しきい値（初期値） | 超えた場合 | 関連する基本方針 |
|---|---|---|---|---|
| #1 仮登録 | システム全体 | 1,000通／1時間 | `429 RATE_LIMITED`、運用者に通知 | 3.1 |
| #1 仮登録 | IP | 10通／1時間 | `429 RATE_LIMITED` | 3.1、4.4 |
| #2・#3 本登録 | IP | 60回／10分 | `429 RATE_LIMITED` | 4.4 |
| #28・#30 招待の照合・所属 | IP | 60回／10分（#2・#3 と同じカウンター） | `429 RATE_LIMITED` | 4.4、10.5 |
| #4 復旧コードによるログイン | システム全体 | 失敗 500回／1時間 | 運用者に通知のみ（拒否はしない） | 6.1 |
| #4 復旧コードによるログイン | IP | 失敗 20回／1時間 | `429 RATE_LIMITED` | 6.1、4.4 |
| #15・#22 の復旧コードによる確認 | IP | #4 と同じカウンターで数える | `429 RATE_LIMITED` | 6.1、4.4 |
| #15 パスワードによる確認 | 家族 | 連続失敗 5回で15分ロック（DB で管理） | `429 SUPERUSER_PASSWORD_LOCKED` | 9.3 |
| #16 復旧コードの再発行 | 家族 | 3回／1時間 | `429 RATE_LIMITED` | 6.1 |
| #23・#25 challenge の発行 | セッション | 30回／10分 | `429 RATE_LIMITED` | 9.4 |

- しきい値は初期値とし、利用状況を見て調整する。
- カウンターは `rate_limit_counters` テーブルで持つ（TableSpec_Auth.md 4.1）。IP アドレスは、鍵付きのハッシュとして保存する（基本方針 4.4）。
- 組織の招待メールの送信（ApiSpec_Organization.md 4.1）は、システム全体の送信数に、#1 と合算して数える（`mail:send:global`）。
- IP 単位の制限は、CGNAT で多数の利用者が同じ IP を共有することを考え、緩めの値としている（基本方針 4.4）。
- 復旧コードによるログインのシステム全体の失敗数は、拒否すると全利用者がログインできなくなるため、通知のみとする（総当たりへの主な対策は、復旧コードの強度。基本方針 6.1）。
- 超えた場合は `Retry-After` ヘッダに、カウンターの有効期限が切れるまでの秒数を付ける。

## 10. 組織への所属

家族が組織に所属する・解除する API。組織が招待を送る API は、ApiSpec_Organization.md 4. を参照する。基本方針 10.、11. に基づく。

### 10.1 招待の照合 `POST /api/v1/invitations/verify`

招待ページ（`/invite#token=...`）が表示時に呼び出し、招待が有効かどうかと、所属先の組織名を取得する（基本方針 11.1）。

- DB は変更しない。リンクスキャナーが招待ページを開いても、招待は消費されない（本登録URLの照合（1.2）と同じ）。
- 招待ページ（クライアント）は、本登録ページ（1.2）と同じく、`location.hash` からトークンを読み取り、`sessionStorage` に保持し、`history.replaceState()` でフラグメントを消す。所属の完了時に、`sessionStorage` のトークンを削除する。

**リクエスト**

```json
{
  "token": "（招待URLのトークン）"
}
```

**レスポンス** `200 OK`

```json
{
  "organizationName": "○○大学",
  "expiresAt": "2026-11-11T09:30:00.000Z"
}
```

**エラー**：`410 INVITATION_INVALID`、`429 RATE_LIMITED`

### 10.2 所属している組織の取得 `GET /api/v1/organization-membership`

**レスポンス** `200 OK`

```json
{
  "organization": { "name": "○○大学", "joinedAt": "2026-11-04T09:30:00.000Z" }
}
```

- 所属していない場合は、`"organization": null`。2.2 の `family.organization` と同じ内容で、所属の追加・解除の後の再取得に使う。

**エラー**：`401 UNAUTHENTICATED`

### 10.3 登録済みの家族の所属 `POST /api/v1/organization-membership`

すでに本アプリに登録している家族が、招待を使って、組織に所属する（基本方針 11.4）。新しく登録する場合は、招待経由の本登録（1.3）を使う。**確認（0.4）が必要**。

**リクエスト**

```json
{
  "invitationToken": "（招待URLのトークン）"
}
```

**処理**（1つのトランザクション）

1. `families` の行を `SELECT ... FOR UPDATE` でロックする。
2. 招待を取り出す（TableSpec_Organization.md 5.3）。取り出せなければ `410 INVITATION_INVALID`。
3. 家族がすでに、招待の組織に所属していれば `409 ALREADY_MEMBER`（ロールバックし、招待は消費しない）。
4. `families.organization_id` を招待の組織に、`organization_joined_at` を現在時刻に更新し、招待を削除する。
   - すでに別の組織に所属している場合は、その組織から移る。元の組織は、以降、この家族のデータを参照できなくなる（基本方針 10.4）。
   - 別の組織から移ることは、クライアントが警告して同意を得る（基本方針 11.4）。必要なら、事前に 10.2 で現在の所属を確認する。

**レスポンス** `200 OK`

```json
{
  "organization": { "name": "○○大学", "joinedAt": "2026-11-04T09:30:00.000Z" },
  "previousOrganization": { "name": "△△研究室" }
}
```

- `previousOrganization`：移る前に所属していた組織。所属していなかった場合は `null`。

**エラー**：`401 UNAUTHENTICATED`、`403 ELEVATION_REQUIRED`、`409 ALREADY_MEMBER`、`410 INVITATION_INVALID`、`429 RATE_LIMITED`

### 10.4 組織への所属の解除 `DELETE /api/v1/organization-membership`

組織への所属を解除し、個人ユーザに戻る（基本方針 10.6）。**確認（0.4）が必要**。

**処理**（1つのトランザクション）

1. `families` の行を `SELECT ... FOR UPDATE` でロックする。
2. 所属していなければ `409 NOT_A_MEMBER`。
3. `organization_id` と `organization_joined_at` を NULL にする。

**レスポンス** `204 No Content`

- 解除すると、組織は、以降、この家族のユーザの利用データを参照できなくなる。組織がすでにダウンロードしたデータは、消えない（クライアントは、確認ダイアログでこれを案内する）。

**エラー**：`401 UNAUTHENTICATED`、`403 ELEVATION_REQUIRED`、`409 NOT_A_MEMBER`

## 11. 未決事項

- スーパーユーザのパスワードの規則（4〜64文字としている）
- 基本方針 9.5 のパスキーによるログイン（新しい端末から、復旧コードなしでログインする）を提供するか
- 所属前に作られた利用データを、組織に参照させるか（基本方針 8.）
