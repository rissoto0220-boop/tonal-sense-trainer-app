# Web API 仕様書：所属（運用担当者を含む）

基本方針（BasicPolicy.md）の「10. 所属」「11. 招待メールを受け取ったユーザの操作」とテーブル仕様書（TableSpec_Belonging.md ほか）に基づき、所属の認証・管理の Web API を定義する。
家族・ユーザの API は ApiSpec_Auth.md を参照する。家族が所属を追加・解除する API は、ApiSpec_Auth.md「10. 所属」にある。

## 0. 共通事項

### 0.1 基本

- API はページと同一オリジンに置く。ベースパスは `/api/v1/blg` とする。
- 通信はすべて HTTPS とし、HSTS を有効にする。
- リクエスト・レスポンスの本文、ID・日時の形式、`Cache-Control: no-store`、エラーレスポンスの形式は、ApiSpec_Auth.md の 0.1・0.5 に従う。

### 0.2 認証（Cookie）と段階

- 所属の認証は、所属専用の Cookie のセッショントークンで行う（基本方針 10.3）。家族の Cookie（`__Host-sid`）とは別とし、所属の API は所属の Cookie だけを、家族の API は家族の Cookie だけを見る。

| 項目 | 値 |
|---|---|
| Cookie 名 | `__Host-blg-sid` |
| 値 | 認証トークン本体（256bit の乱数を base64url で表したもの） |
| 属性 | `Secure; HttpOnly; SameSite=Lax; Path=/` （`Domain` 属性は付けない） |
| 有効期限 | 付けない（セッション Cookie。ブラウザを閉じると消える）。サーバ側の有効期限は TableSpec_Belonging.md 4.3 |

- 認証が必要な API で、Cookie がない、またはセッションが無効・期限切れの場合は `401 UNAUTHENTICATED` を返し、Cookie を削除する（`Max-Age=0`）。
- 有効期限の延長は、ログイン完了後のセッションで、前回の更新から5分以上経過したリクエストのときに行う（TableSpec_Belonging.md 4.3）。

**ログインの段階**（`belonging_sessions.auth_stage`）

| 段階 | 状態 | 使える API |
|---|---|---|
| 0 | パスワードの確認済み。パスキーの確認が未了（運用担当者の所属のみ） | B2、B3（パスキーの確認）、B4、B5、B6（パスワードの変更）、B9、B10（パスキーが1件もない場合の登録） |
| 1 | ログイン完了 | すべての API（運用担当者のみの API は、運用担当者の所属のみ） |

- 通常の所属は、パスワードの確認に成功すると、段階1になる。運用担当者の所属は、パスワードの確認の後、パスキーの確認（B2・B3）に成功すると段階1になる。
- 運用担当者の所属で、パスキーが1件も登録されていない場合（最初のログイン）は、パスワードの変更（B6）の後、パスキーの登録（B9・B10）を行う。最初のパスキーの登録に成功したら、ログイン完了（段階1）とする。
- 段階0のセッションで、使えない API を呼んだ場合は `403 PASSKEY_REQUIRED` を返す。
- `password_change_required = 1` の間は、B4・B5・B6 以外の API は `403 PASSWORD_CHANGE_REQUIRED` を返す。
- 検証の順序：`401` → `403 PASSKEY_REQUIRED` → `403 PASSWORD_CHANGE_REQUIRED` → `403 SUPER_ONLY` → `403 ELEVATION_REQUIRED` → `404`・`409` など。

### 0.3 CSRF 対策

ApiSpec_Auth.md の 0.3 と同じ（`Origin` ヘッダの検証と、`Content-Type: application/json`）。

### 0.4 破壊的な操作の確認

取り消せない操作・他の所属に影響する操作は、事前にパスワードを再入力して確認（B7）した端末（セッション）でのみ、5分間実行できる（`belonging_sessions.elevated_until`）。

- 確認していない、または5分を過ぎている場合は `403 ELEVATION_REQUIRED` を返す。
- 対象の操作：パスキーの削除（B11）、所属のパスワードの再発行（B20）、所属の削除（B21）、家族の所属の解除（B28）、家族の削除（B29）。

### 0.5 入力値の規則

| 項目 | 規則 |
|---|---|
| ログインID | 英小文字・数字・`.`・`_`・`-` のみの4〜64文字。保存前に小文字に正規化する |
| 所属名 | 正規化（前後の空白の除去、Unicode の正規化）後に1〜100文字 |
| パスワード | 12〜128文字。文字の種類は問わない。前後の空白も含めてそのまま扱う |
| メールアドレス | ApiSpec_Auth.md 0.6 と同じ |

- 初期パスワード（所属の発行・再発行時にサーバが作る）：紛らわしい文字（`0`・`O`・`1`・`l`・`I`）を除いた英大小文字と数字からなる、暗号論的に安全な乱数の16文字。

### 0.6 エラーコード（所属の API で追加するもの）

ApiSpec_Auth.md 0.5 のコード（`BAD_REQUEST`、`UNAUTHENTICATED`、`FORBIDDEN_ORIGIN`、`ELEVATION_REQUIRED`、`NOT_FOUND`、`PASSKEY_VERIFICATION_FAILED`、`PASSKEY_LIMIT_REACHED`、`VALIDATION_FAILED`、`RATE_LIMITED`、`MAIL_SEND_FAILED`、`INTERNAL_ERROR`）に加えて、次を使う。

| HTTP ステータス | `code` | 意味 |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | ログインIDまたはパスワードが一致しない（ログインIDの有無を区別しない） |
| 403 | `PASSKEY_REQUIRED` | パスキーの確認が済んでいない（段階0） |
| 403 | `PASSWORD_CHANGE_REQUIRED` | パスワードの変更が必要 |
| 403 | `SUPER_ONLY` | 運用担当者の所属のみが実行できる |
| 409 | `DUPLICATE_BELONGING_NAME` | 同じ所属名がある |
| 409 | `DUPLICATE_LOGIN_ID` | 同じログインIDがある |
| 409 | `NOT_A_MEMBER` | 家族が、どこにも所属していない（B28） |
| 409 | `SUPER_BELONGING_PROTECTED` | 運用担当者の所属は、名前の変更・パスワードの再発行・削除の対象外 |
| 409 | `LAST_PASSKEY` | 最後のパスキーは削除できない |
| 429 | `BELONGING_PASSWORD_LOCKED` | パスワードの連続失敗によりロック中。`Retry-After` ヘッダにロック解除までの秒数を付ける |

### 0.7 API 一覧

| # | メソッド | パス | 認証 | 確認 | 運用担当者のみ | 概要 |
|---|---|---|---|---|---|---|
| B1 | POST | `/api/v1/blg/sessions` | 不要 | | | ログイン（ログインID＋パスワード） |
| B2 | POST | `/api/v1/blg/sessions/passkey-options` | 段階0 | | 運用担当者 | パスキーによるログインの確認の開始（challenge の発行） |
| B3 | POST | `/api/v1/blg/sessions/passkey` | 段階0 | | 運用担当者 | パスキーによるログインの確認（ログインの完了） |
| B4 | GET | `/api/v1/blg/sessions/current` | 段階0・1 | | | ログイン状態と所属の情報の取得 |
| B5 | DELETE | `/api/v1/blg/sessions/current` | 段階0・1 | | | ログアウト |
| B6 | PUT | `/api/v1/blg/password` | 段階0・1 | | | パスワードの変更 |
| B7 | POST | `/api/v1/blg/elevation` | 段階1 | | | 破壊的な操作の確認（パスワードの再入力） |
| B8 | GET | `/api/v1/blg/passkeys` | 段階1 | | 運用担当者 | パスキーの一覧 |
| B9 | POST | `/api/v1/blg/passkeys/registration-options` | 段階0・1 | 段階1で必要 | 運用担当者 | パスキーの登録の開始（challenge の発行） |
| B10 | POST | `/api/v1/blg/passkeys` | 段階0・1 | 段階1で必要 | 運用担当者 | パスキーの登録 |
| B11 | DELETE | `/api/v1/blg/passkeys/{passkeyId}` | 段階1 | 必要 | 運用担当者 | パスキーの削除 |
| B12 | POST | `/api/v1/blg/invitations` | 段階1 | | | 招待メールの送信 |
| B13 | GET | `/api/v1/blg/invitations` | 段階1 | | | 未使用の招待の件数の取得 |
| B14 | DELETE | `/api/v1/blg/invitations` | 段階1 | | | 未使用の招待の取り消し |
| B15 | GET | `/api/v1/blg/members` | 段階1 | | | 所属している家族の一覧 |
| B16 | DELETE | `/api/v1/blg/members/{familyId}` | 段階1 | | | 所属している家族を所属から外す |
| B17 | GET | `/api/v1/blg/belongings` | 段階1 | | 運用担当者 | 所属の一覧 |
| B18 | POST | `/api/v1/blg/belongings` | 段階1 | | 運用担当者 | 所属の登録（ログインアカウントの発行） |
| B19 | PATCH | `/api/v1/blg/belongings/{belongingId}` | 段階1 | | 運用担当者 | 所属名・読み仮名の変更 |
| B20 | POST | `/api/v1/blg/belongings/{belongingId}/password-reset` | 段階1 | 必要 | 運用担当者 | パスワードの再発行 |
| B21 | DELETE | `/api/v1/blg/belongings/{belongingId}` | 段階1 | 必要 | 運用担当者 | 所属の削除 |
| B27 | GET | `/api/v1/blg/families` | 段階1 | | 運用担当者 | すべての家族の一覧 |
| B28 | DELETE | `/api/v1/blg/families/{familyId}/belonging` | 段階1 | 必要 | 運用担当者 | 家族の所属の解除 |
| B29 | DELETE | `/api/v1/blg/families/{familyId}` | 段階1 | 必要 | 運用担当者 | 家族の削除（アカウントの削除） |

### 0.8 共通のデータ形式

**所属（`Belonging`）**

```json
{
  "id": "0192f3c0-...",
  "name": "○○大学",
  "loginId": "example-univ",
  "isSuper": false,
  "passwordChangeRequired": false
}
```

## 1. ログイン・ログアウト

### 1.1 ログイン `POST /api/v1/blg/sessions`（B1）

ログインID＋パスワードで確認する（基本方針 10.3）。

**リクエスト**

```json
{
  "loginId": "example-univ",
  "password": "（パスワード）"
}
```

**処理**

1. 回数制限（IP 単位の失敗回数。9.）を確認する。超えていたら `429 RATE_LIMITED`。
2. ログインIDを正規化し、`belongings` を検索する。
   - 見つからなければ、IP 単位の失敗回数を加算して `401 INVALID_CREDENTIALS`。処理時間の差でログインIDの有無が分からないよう、ダミーのハッシュ計算を行う。
3. 所属の行を `SELECT ... FOR UPDATE` でロックする。ロック中なら `429 BELONGING_PASSWORD_LOCKED`（`Retry-After` にロック解除までの秒数）。
4. パスワードを照合する。一致しなければ、所属の失敗回数を加算し（5回でロック、TableSpec_Belonging.md 2.3）、IP 単位の失敗回数も加算して `401 INVALID_CREDENTIALS`。
5. 一致したら、失敗回数を0に戻し、`belonging_sessions` を作成して Cookie を設定する。
   - 運用担当者の所属は段階0、通常の所属は段階1とする。
   - リクエストに有効な Cookie がある場合は、そのセッションを削除してから作成する。

**レスポンス** `201 Created`（`Set-Cookie: __Host-blg-sid=...`）

```json
{
  "belonging": { "id": "0192f3c0-...", "name": "運用担当者", "loginId": "operator", "isSuper": true, "passwordChangeRequired": false },
  "authStage": 0,
  "passkeyRegistered": true
}
```

| 項目 | 説明 |
|---|---|
| `authStage` | 0：パスキーの確認が必要（運用担当者の所属）。1：ログイン完了 |
| `passkeyRegistered` | 運用担当者の所属で、パスキーが1件以上登録されていれば `true`。通常の所属は常に `false`。段階0で `false` の場合は、パスキーの登録（3.）に進む |

- クライアントは、`belonging.passwordChangeRequired` が `true` ならパスワードの変更（2.1）、`authStage` が 0 で `passkeyRegistered` が `true` ならパスキーの確認（1.2・1.3）、`false` ならパスキーの登録（3.2・3.3）の画面を表示する。

**エラー**：`401 INVALID_CREDENTIALS`、`422 VALIDATION_FAILED`、`429 RATE_LIMITED`、`429 BELONGING_PASSWORD_LOCKED`

### 1.2 パスキーによるログインの確認の開始 `POST /api/v1/blg/sessions/passkey-options`（B2）

段階0のセッションで、challenge を発行する。

**リクエスト**：本文なし（`{}`）

**処理**

1. 運用担当者の所属でなければ `403 SUPER_ONLY`。すでにログインが完了している（段階1）セッションなら `400 BAD_REQUEST`。パスキーが1件もなければ `404 NOT_FOUND`。
2. 回数制限（セッション単位の challenge の発行回数。9.）を確認する。
3. 32バイトの challenge を生成し、このセッションに紐付けて5分間保持する（`webauthn_challenges`、`purpose` は `blg_login`。TableSpec_Auth.md 4.2）。

**レスポンス** `200 OK`

ApiSpec_Auth.md 6.2 と同じ形式（`PublicKeyCredentialRequestOptions` の JSON 表現。`allowCredentials` には、所属のパスキーをすべて含める。`userVerification` は `required`）。

**エラー**：`400 BAD_REQUEST`、`401 UNAUTHENTICATED`、`403 SUPER_ONLY`、`404 NOT_FOUND`、`429 RATE_LIMITED`

### 1.3 パスキーによるログインの確認 `POST /api/v1/blg/sessions/passkey`（B3）

パスキーで確認し、ログインを完了する（段階0 → 1）。

**リクエスト**

```json
{
  "passkey": { "id": "...", "rawId": "...", "type": "public-key", "response": { "clientDataJSON": "...", "authenticatorData": "...", "signature": "...", "userHandle": "..." } }
}
```

- `passkey` は、`navigator.credentials.get()` が返した `PublicKeyCredential` を JSON にしたもの（ApiSpec_Auth.md 6.1 と同じ）。

**処理**

1. このセッションの challenge（B2 で発行）を取り出して削除する。なければ `401 PASSKEY_VERIFICATION_FAILED`。
2. `credential_id` で `belonging_passkeys` を検索し、ログイン中の所属のものであることを確認する。なければ `401 PASSKEY_VERIFICATION_FAILED`。
3. WebAuthn の手順に従って検証する（challenge・オリジン・RP ID の一致、ユーザ検証（UV フラグ）、署名、署名カウンタ。ApiSpec_Auth.md 6.1 と同じ）。失敗したら `401 PASSKEY_VERIFICATION_FAILED`。
4. 成功したら、`belonging_passkeys` の `sign_count`・`last_used_at` を更新し、セッションを段階1にして、有効期限を延ばす（TableSpec_Belonging.md 4.3）。

**レスポンス** `200 OK`

```json
{
  "belonging": { "id": "0192f3c0-...", "name": "運用担当者", "loginId": "operator", "isSuper": true, "passwordChangeRequired": false },
  "authStage": 1
}
```

- すでにログインが完了している（段階1）セッションでは、`400 BAD_REQUEST`（B2 と同じ）。

**エラー**：`400 BAD_REQUEST`、`401 UNAUTHENTICATED`、`401 PASSKEY_VERIFICATION_FAILED`、`403 SUPER_ONLY`

### 1.4 ログイン状態の取得 `GET /api/v1/blg/sessions/current`（B4）

**レスポンス** `200 OK`

```json
{
  "session": {
    "id": "0192f3d0-...",
    "authStage": 1,
    "createdAt": "2026-11-04T09:30:00.000Z",
    "expiresAt": "2026-11-04T17:30:00.000Z",
    "elevatedUntil": null
  },
  "belonging": { "id": "0192f3c0-...", "name": "○○大学", "loginId": "example-univ", "isSuper": false, "passwordChangeRequired": false }
}
```

**エラー**：`401 UNAUTHENTICATED`

### 1.5 ログアウト `DELETE /api/v1/blg/sessions/current`（B5）

この端末のセッションを削除し、Cookie を削除する（`Max-Age=0`）。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`

## 2. パスワードと確認

### 2.1 パスワードの変更 `PUT /api/v1/blg/password`（B6）

**リクエスト**

```json
{
  "currentPassword": "（現在のパスワード。初回は発行された初期パスワード）",
  "newPassword": "（新しいパスワード）"
}
```

| 項目 | 規則 |
|---|---|
| `newPassword` | 0.5 の規則。`currentPassword` と同じなら `422 VALIDATION_FAILED`（`details` の `code` は `SAME_PASSWORD`） |

**処理**（1つのトランザクション）

1. 所属の行を `SELECT ... FOR UPDATE` でロックする。ロック中なら `429 BELONGING_PASSWORD_LOCKED`。
2. 現在のパスワードを照合する。一致しなければ、失敗回数を加算し（5回でロック）、`401 INVALID_CREDENTIALS`。
3. 新しいパスワードを Argon2id でハッシュ化して保存し、`password_change_required` を0に、失敗回数とロックを初期値に戻す。
4. 操作中の端末以外の、同じ所属のセッションを削除する。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`、`401 INVALID_CREDENTIALS`、`422 VALIDATION_FAILED`、`429 BELONGING_PASSWORD_LOCKED`

### 2.2 破壊的な操作の確認 `POST /api/v1/blg/elevation`（B7）

パスワードを再入力して確認し、この端末で5分間、破壊的な操作（0.4）を実行できるようにする。

**リクエスト**

```json
{
  "password": "（パスワード）"
}
```

**処理**：2.1 の 1.〜2. と同じ（ロック・失敗回数）。一致したら、`belonging_sessions.elevated_until` を現在時刻の5分後とする。

**レスポンス** `200 OK`

```json
{
  "elevatedUntil": "2026-11-04T09:35:00.000Z"
}
```

**エラー**：`401 UNAUTHENTICATED`、`401 INVALID_CREDENTIALS`、`403 PASSKEY_REQUIRED`、`429 BELONGING_PASSWORD_LOCKED`

## 3. パスキー（運用担当者の所属のみ）

通常の所属が呼び出した場合は、`403 SUPER_ONLY` を返す。

### 3.1 パスキーの一覧 `GET /api/v1/blg/passkeys`（B8）

**レスポンス** `200 OK`

ApiSpec_Auth.md 7.6 と同じ形式（`passkeys`：`id`・`name`・`synced`・`createdAt`・`lastUsedAt`。登録日時の新しい順）。

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`

### 3.2 パスキーの登録の開始 `POST /api/v1/blg/passkeys/registration-options`（B9）

**確認（0.4）が必要**（段階1の場合）。段階0で、パスキーが1件も登録されていない場合（最初のログイン）は、確認なしで呼び出せる。

**リクエスト**：本文なし（`{}`）

**処理**

1. 段階0で、すでにパスキーが登録されていれば `403 PASSKEY_REQUIRED`（段階0では、パスキーの確認だけを行える）。
2. パスキーが10件なら `409 PASSKEY_LIMIT_REACHED`。
3. 回数制限（セッション単位の challenge の発行回数）を確認し、32バイトの challenge を生成して、このセッションに紐付けて5分間保持する（`purpose` は `blg_registration`）。

**レスポンス** `200 OK`

ApiSpec_Auth.md 7.7 と同じ形式（`PublicKeyCredentialCreationOptions` の JSON 表現）。次の点が異なる。

| 項目 | 値 |
|---|---|
| `user.id` | `belongings.id`（base64url）。個人情報を含まない |
| `user.name` | 所属のログインID |
| `user.displayName` | 所属名 |

**エラー**：`401 UNAUTHENTICATED`、`403 PASSKEY_REQUIRED`、`403 PASSWORD_CHANGE_REQUIRED`、`403 SUPER_ONLY`、`403 ELEVATION_REQUIRED`、`409 PASSKEY_LIMIT_REACHED`、`429 RATE_LIMITED`

### 3.3 パスキーの登録 `POST /api/v1/blg/passkeys`（B10）

**確認（0.4）が必要**（段階1の場合）。

**リクエスト**：ApiSpec_Auth.md 7.8 と同じ（`credential`）。

**処理**：ApiSpec_Auth.md 7.8 と同じ（challenge の取り出し、検証、10件の上限、保存。保存先は `belonging_passkeys`）。**段階0で、最初のパスキーの登録に成功した場合は、セッションを段階1にして、ログインを完了する。**

**レスポンス** `201 Created`

```json
{
  "passkey": { "id": "0192f3b0-...", "name": "Mac / Safari で登録", "synced": true, "createdAt": "2026-11-04T09:30:00.000Z", "lastUsedAt": null },
  "authStage": 1
}
```

**エラー**：`401 UNAUTHENTICATED`、`401 PASSKEY_VERIFICATION_FAILED`、`403 PASSKEY_REQUIRED`、`403 SUPER_ONLY`、`403 ELEVATION_REQUIRED`、`409 PASSKEY_LIMIT_REACHED`

### 3.4 パスキーの削除 `DELETE /api/v1/blg/passkeys/{passkeyId}`（B11）

**確認（0.4）が必要**。

**処理**：最後の1件なら `409 LAST_PASSKEY`（運用担当者の所属は、パスキーが1件以上必要）。そうでなければ、`belonging_passkeys` の行を削除する。端末（認証器）に残ったパスキー自体は、サーバから削除できないため、クライアントは「端末のパスキーの管理画面からも削除してください」と案内する。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`、`403 ELEVATION_REQUIRED`、`404 NOT_FOUND`、`409 LAST_PASSKEY`

## 4. 招待

### 4.1 招待メールの送信 `POST /api/v1/blg/invitations`（B12）

指定されたメールアドレスに、所属への招待メールを送る（基本方針 10.5）。

**リクエスト**

```json
{
  "email": "user@example.com"
}
```

**処理**

1. 回数制限（所属単位、システム全体。9.）を確認する。超えていたら `429 RATE_LIMITED`。
2. メールアドレスの形式を検証する（ApiSpec_Auth.md 0.6）。不正なら `422 VALIDATION_FAILED`。
3. 招待トークンを生成し、`belonging_invitations` に、ハッシュ・所属・有効期限（7日）のみを保存する。
4. 招待URL（`https://<ホスト>/invite/#token=<トークン>`）と所属名を、メールで送る。
   - トークンはフラグメントに含め、サーバのアクセスログに残らないようにする（基本方針 3.2、10.5）。
5. 送信に失敗した場合は、エラーログにメールアドレスと失敗理由を記録し（基本方針 7.）、3. の行を削除して `503 MAIL_SEND_FAILED` を返す。

- メールアドレスは保存しない。送信成功時はログにも記録しない（基本方針 10.5）。

**レスポンス** `202 Accepted`

```json
{
  "sender": "no-reply@example.com",
  "expiresAt": "2026-11-11T09:30:00.000Z"
}
```

**エラー**：`401 UNAUTHENTICATED`、`422 VALIDATION_FAILED`、`429 RATE_LIMITED`、`503 MAIL_SEND_FAILED`

### 4.2 未使用の招待の件数 `GET /api/v1/blg/invitations`（B13）

**レスポンス** `200 OK`

```json
{
  "pendingCount": 3
}
```

- 有効期限内で、まだ使われていない招待の件数。誰に送ったかは分からない（基本方針 10.5）。

**エラー**：`401 UNAUTHENTICATED`

### 4.3 未使用の招待の取り消し `DELETE /api/v1/blg/invitations`（B14）

有効期限内の、未使用の招待をすべて取り消す（誤って送った場合など）。個別の招待は区別できないため、すべて取り消す。

**レスポンス** `200 OK`

```json
{
  "revokedCount": 3
}
```

**エラー**：`401 UNAUTHENTICATED`

## 5. 所属している家族の管理

### 5.1 所属している家族の一覧 `GET /api/v1/blg/members`（B15）

自所属に、現在所属している家族の一覧を返す。

**レスポンス** `200 OK`

```json
{
  "families": [
    {
      "id": "0192f3e0-...",
      "joinedAt": "2026-11-04T09:30:00.000Z",
      "users": [
        { "id": "0192f3a0-...", "name": "おとうさん" },
        { "id": "0192f3a1-...", "name": "はなこ" }
      ]
    }
  ]
}
```

- 家族は、所属した日時の新しい順。`users` は、表示順。
- 所属が参照できるのは、家族の ID・所属日時・ユーザの ID とユーザ名のみ（TableSpec_Belonging.md 6.）。

**エラー**：`401 UNAUTHENTICATED`

### 5.2 所属している家族を外す `DELETE /api/v1/blg/members/{familyId}`（B16）

自所属に属している家族を、所属から外す（基本方針 10.6）。家族は個人ユーザになる。

**処理**：指定された家族が、自所属に属していなければ（他の所属の家族、存在しない家族を含む）`404 NOT_FOUND`。そうでなければ、`families.belonging_id`・`belonging_joined_at` を NULL にする。

**レスポンス** `204 No Content`

- 外された家族のユーザの利用データは、以降、この所属から参照できなくなる。所属がすでにダウンロードしたデータは、消えない。

**エラー**：`401 UNAUTHENTICATED`、`404 NOT_FOUND`

## 6. 所属・家族の管理（運用担当者の所属のみ）

通常の所属が呼び出した場合は、`403 SUPER_ONLY` を返す。運用担当者の所属は、一覧（6.1）には表示されるが、名前の変更・パスワードの再発行・削除の対象外である（`409 SUPER_BELONGING_PROTECTED`）。

### 6.1 所属の一覧 `GET /api/v1/blg/belongings`（B17）

**レスポンス** `200 OK`

```json
{
  "belongings": [
    {
      "id": "0192f3c0-...",
      "name": "○○大学",
      "nameKana": "まるまるだいがく",
      "loginId": "example-univ",
      "isSuper": false,
      "memberFamilyCount": 12,
      "createdAt": "2026-11-04T09:30:00.000Z"
    }
  ]
}
```

- 作成日時の新しい順。`memberFamilyCount` は、現在所属している家族の数。`nameKana` は、所属名の読み仮名（未登録は `null`）。
- 所属名順に並べるときは、クライアントが、第1キーを読み仮名、第2キーを所属名の文字コード順にする（読み仮名が未登録の所属は、読み仮名のある所属の後ろに、所属名の文字コード順で並べる）。

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`

### 6.2 所属の登録 `POST /api/v1/blg/belongings`（B18）

所属のログインアカウントを発行する（基本方針 10.3）。

**リクエスト**

```json
{
  "name": "○○大学",
  "nameKana": "まるまるだいがく",
  "loginId": "example-univ"
}
```

- `nameKana`（読み仮名）は省略できる（省略・空文字は未登録）。ひらがな・長音符・半角の英数字・半角の空白のみ、100文字まで。カタカナは、ひらがなに変換して保存する。他の所属と重複してもよい。違反は `422 VALIDATION_FAILED`（`field: "nameKana"`、`INVALID_CHARACTER`・`TOO_LONG`）。

**処理**：ログインIDと所属名・読み仮名を検証する。重複があれば `409 DUPLICATE_LOGIN_ID`・`409 DUPLICATE_BELONGING_NAME`。初期パスワードを生成し、Argon2id でハッシュ化して、`password_change_required = 1` で `belongings` を作成する。

**レスポンス** `201 Created`

```json
{
  "belonging": { "id": "0192f3c0-...", "name": "○○大学", "nameKana": "まるまるだいがく", "loginId": "example-univ", "isSuper": false, "passwordChangeRequired": true },
  "initialPassword": "（16文字の初期パスワード）"
}
```

- `initialPassword` は、**このレスポンスでのみ返す**。運用担当者は、安全な方法で、所属の担当者に伝える。所属は、最初のログインで、パスワードを変更する（2.1）。

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`、`409 DUPLICATE_LOGIN_ID`、`409 DUPLICATE_BELONGING_NAME`、`422 VALIDATION_FAILED`

### 6.3 所属名・読み仮名の変更 `PATCH /api/v1/blg/belongings/{belongingId}`（B19）

**リクエスト**（`name`・`nameKana` のうち、変更する項目だけを送る。どちらもなければ `400 BAD_REQUEST`）

```json
{
  "name": "○○大学 情報学部",
  "nameKana": "まるまるだいがく じょうほうがくぶ"
}
```

- `nameKana` を空文字または `null` にすると、読み仮名を未登録に戻す。規則は、6.2 と同じ。

**レスポンス** `200 OK`

```json
{
  "belonging": { "id": "0192f3c0-...", "name": "○○大学 情報学部", "nameKana": "まるまるだいがく じょうほうがくぶ", "loginId": "example-univ", "isSuper": false, "passwordChangeRequired": false }
}
```

- 変更した所属名は、以降の招待メール・招待ページに表示される。すでに送られた招待メールの本文は変わらない。

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`、`404 NOT_FOUND`、`409 DUPLICATE_BELONGING_NAME`、`409 SUPER_BELONGING_PROTECTED`、`422 VALIDATION_FAILED`

### 6.4 パスワードの再発行 `POST /api/v1/blg/belongings/{belongingId}/password-reset`（B20）

所属がパスワードを忘れた場合などに、新しい初期パスワードを発行する。**確認（0.4）が必要**。

**処理**（1つのトランザクション）

1. 新しい初期パスワードを生成し、ハッシュ化して保存する。
2. `password_change_required` を1に、失敗回数とロックを初期値に戻す。
3. その所属のすべてのセッションを削除する。

**レスポンス** `200 OK`

```json
{
  "initialPassword": "（16文字の初期パスワード）"
}
```

- `initialPassword` は、このレスポンスでのみ返す。

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`、`403 ELEVATION_REQUIRED`、`404 NOT_FOUND`、`409 SUPER_BELONGING_PROTECTED`

### 6.5 所属の削除 `DELETE /api/v1/blg/belongings/{belongingId}`（B21）

所属を削除する。**確認（0.4）が必要**。

- 所属していた家族は、所属していない個人ユーザになる（基本方針 10.6）。利用データは削除されず、運用担当者のみが参照できる。
- 所属のパスキー・セッション・未使用の招待は削除される。
- クライアントは、影響を受ける家族の数を表示して確認を求める（一覧の `memberFamilyCount`）。

**処理**（1つのトランザクション）

1. 所属している家族の数を数える。
2. 所属していた家族の `belonging_id` と `belonging_joined_at` を NULL にする（外部キーの `ON DELETE SET NULL` は、`belonging_joined_at` を NULL にしないため。TableSpec_Account.md 2.3）。
3. `belongings` の行を削除する（`belonging_*` のテーブルは `ON DELETE CASCADE` で削除される）。

**レスポンス** `200 OK`

```json
{
  "releasedFamilyCount": 12
}
```

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`、`403 ELEVATION_REQUIRED`、`404 NOT_FOUND`、`409 SUPER_BELONGING_PROTECTED`

### 6.6 すべての家族の一覧 `GET /api/v1/blg/families`（B27）

登録されているすべての家族（個人ユーザの家族を含む）の一覧を返す。通常の所属が呼び出した場合は `403 SUPER_ONLY`。

**レスポンス** `200 OK`

```json
{
  "families": [
    {
      "id": "0192f3e0-...",
      "createdAt": "2026-11-04T09:30:00.000Z",
      "belonging": { "id": "0192f3c0-...", "name": "○○大学" },
      "joinedAt": "2026-11-04T09:30:00.000Z",
      "users": [
        { "id": "0192f3a0-...", "name": "おとうさん" },
        { "id": "0192f3a1-...", "name": "はなこ" }
      ]
    }
  ]
}
```

- 家族は、登録が新しい順。`users` は、表示順。所属していない家族は、`belonging` と `joinedAt` が `null`。
- 参照できるのは、家族の ID・登録日時・所属・ユーザの ID とユーザ名のみ。復旧コード・パスワード・端末のログインは、参照できない。
- 件数が多くなった場合のページングは、未決（10.）。

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`

### 6.7 家族の所属の解除 `DELETE /api/v1/blg/families/{familyId}/belonging`（B28）

家族を、所属先から外す（基本方針 10.6）。**確認（0.4）が必要**。家族は、個人ユーザになる。家族のアカウントは削除されない。

**処理**（1つのトランザクション）：指定された家族を、行ロックして読む。存在しなければ `404 NOT_FOUND`。どこにも所属していなければ `409 NOT_A_MEMBER`。そうでなければ、`families.belonging_id`・`belonging_joined_at` を NULL にする。

**レスポンス** `204 No Content`

- 外された家族のユーザの利用データは、以降、元の所属から参照できなくなる。所属がすでにダウンロードしたデータは、消えない。運用担当者は、引き続き参照できる。
- 自所属の家族を外す B16 と違い、他の所属の家族も対象にできる。

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`、`403 ELEVATION_REQUIRED`、`404 NOT_FOUND`、`409 NOT_A_MEMBER`

### 6.8 家族の削除 `DELETE /api/v1/blg/families/{familyId}`（B29）

家族（アカウント）を削除する。**確認（0.4）が必要**。家族自身の退会（ApiSpec_Auth.md #21）と同じ結果になる。

- `families` の行を削除する。ユーザ・パスキー・端末のログインは、外部キーの `ON DELETE CASCADE` で削除される。所属は、行ごとなくなる。
- **利用データは削除しない**（基本方針 10.7）。外部キーを持たないため、そのまま残り、運用担当者のみが参照できる（7.）。
- 削除した家族は、復旧コードでもログインできない。取り消せない。
- クライアントは、家族のユーザ名と、取り消せないこと・利用データは残ることを、確認画面に表示する。

**処理**（1つのトランザクション）：指定された家族を、行ロックして読む。存在しなければ `404 NOT_FOUND`。そうでなければ、`families` の行を削除する。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`、`403 ELEVATION_REQUIRED`、`404 NOT_FOUND`

## 7. 利用データの参照

- 利用データ（テスト結果）の参照・ダウンロード・削除の API（B22〜B26）は、ApiSpec_TestData.md で定義する。
- 参照できる範囲は、TableSpec_Belonging.md 6. に従う。
  - 通常の所属：現在その所属先に所属している家族の、現存するユーザのデータのみ。
  - 運用担当者：すべて（個人ユーザ・退会した家族・削除されたユーザのデータを含む）。
- パスは、`/api/v1/blg/` の下に置く（`/api/v1/blg/users/{userId}/...`、`/api/v1/blg/test-exports` など）。
- 参照の可否は、リクエストのたびに、家族と所属の関係で判定する（セッションに保持した値は使わない）。参照できないユーザの `userId` を指定された場合は、存在しない場合と区別せず `404 NOT_FOUND` を返す。

## 8. 操作の記録

運用担当者は全ユーザのデータを参照でき、所属の管理もできるため、次の操作を、アプリケーションのログに記録する（時刻・所属 ID・操作・結果。メールアドレス・パスワード・トークンは記録しない）。

- ログインの成功・失敗、パスワードの変更・再発行、ロックの発生
- パスキーの登録・削除
- 所属の登録・名前の変更・削除
- 招待メールの送信（件数のみ。送信先は記録しない）、招待の取り消し
- 家族の所属からの除外（B16・B28）、家族の削除（B29）
- 利用データのダウンロード・参照（運用担当者・所属。対象の範囲）

- ログの保存期間は未決（10.）。

## 9. 回数制限

| 対象 API | 単位 | しきい値（初期値） | 超えた場合 | キー（TableSpec_Auth.md 4.1） |
|---|---|---|---|---|
| B1 ログイン | IP | 失敗 20回／1時間 | `429 RATE_LIMITED` | `blglogin:fail:ip:<IP>` |
| B1 ログイン | システム全体 | 失敗 500回／1時間 | 運用担当者に通知のみ（拒否はしない） | `blglogin:fail:global` |
| B1・B6・B7 パスワードの照合 | 所属 | 連続失敗 5回で15分ロック（DB で管理） | `429 BELONGING_PASSWORD_LOCKED` | `belongings` の列 |
| B2・B9 challenge の発行 | セッション | 30回／10分 | `429 RATE_LIMITED` | `challenge:<セッションID>` |
| B12 招待メールの送信 | 所属 | 100通／1時間 | `429 RATE_LIMITED` | `invite:send:blg:<所属ID>` |
| B12 招待メールの送信 | システム全体 | 1,000通／1時間（仮登録メールと合算） | `429 RATE_LIMITED`、運用担当者に通知 | `mail:send:global` |

- しきい値は初期値とし、利用状況を見て調整する。
- IP 単位の制限は、緩めの値とする（基本方針 4.4）。IP アドレスは、鍵付きハッシュとして保存する。
- 所属のログインのシステム全体の失敗数は、拒否すると全所属がログインできなくなるため、通知のみとする。
- 超えた場合は `Retry-After` ヘッダに、カウンターの有効期限が切れるまでの秒数を付ける。
- 運用担当者の所属のロックは、攻撃者が繰り返すと、運用担当者がログインできなくなる。復旧は、TableSpec_Belonging.md 7. の SQL で行う。

## 10. 未決事項

- パスワードの規則（12〜128文字としている）
- 所属のセッションの有効期限（TableSpec_Belonging.md 9.）
- 所属の一覧・所属している家族の一覧のページング（件数が多くなった場合）
- 招待の有効期限（7日としている）
- 操作の記録（8.）の保存期間
- 通常の所属にも、パスキーを求めるか、任意で登録できるようにするか
- 運用担当者のパスキーの確認（B3）の失敗が続いた場合の扱い（現状は、challenge の発行回数の制限のみ）
- 運用担当者の家族の一覧（B27）のページング・検索（件数が多くなった場合）
- 所属が、所属している家族の ID を参照できてよいか（`families.id` は、パスキーの user handle と同じ値）
