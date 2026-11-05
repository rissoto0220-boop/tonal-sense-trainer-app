# Web API 仕様書：組織（研究者を含む）

基本方針（BasicPolicy.md）の「10. 組織」「11. 招待メールを受け取ったユーザの操作」とテーブル仕様書（TableSpec_Organization.md ほか）に基づき、組織の認証・管理の Web API を定義する。
家族・ユーザの API は ApiSpec_Auth.md を参照する。家族が組織に所属・解除する API は、ApiSpec_Auth.md「10. 組織への所属」にある。

## 0. 共通事項

### 0.1 基本

- API はページと同一オリジンに置く。ベースパスは `/api/v1/org` とする。
- 通信はすべて HTTPS とし、HSTS を有効にする。
- リクエスト・レスポンスの本文、ID・日時の形式、`Cache-Control: no-store`、エラーレスポンスの形式は、ApiSpec_Auth.md の 0.1・0.5 に従う。

### 0.2 認証（Cookie）と段階

- 組織の認証は、組織専用の Cookie のセッショントークンで行う（基本方針 10.3）。家族の Cookie（`__Host-sid`）とは別とし、組織の API は組織の Cookie だけを、家族の API は家族の Cookie だけを見る。

| 項目 | 値 |
|---|---|
| Cookie 名 | `__Host-org-sid` |
| 値 | 認証トークン本体（256bit の乱数を base64url で表したもの） |
| 属性 | `Secure; HttpOnly; SameSite=Lax; Path=/` （`Domain` 属性は付けない） |
| 有効期限 | 付けない（セッション Cookie。ブラウザを閉じると消える）。サーバ側の有効期限は TableSpec_Organization.md 4.3 |

- 認証が必要な API で、Cookie がない、またはセッションが無効・期限切れの場合は `401 UNAUTHENTICATED` を返し、Cookie を削除する（`Max-Age=0`）。
- 有効期限の延長は、ログイン完了後のセッションで、前回の更新から5分以上経過したリクエストのときに行う（TableSpec_Organization.md 4.3）。

**ログインの段階**（`organization_sessions.auth_stage`）

| 段階 | 状態 | 使える API |
|---|---|---|
| 0 | パスワードの確認済み。パスキーの確認が未了（研究者の組織のみ） | O2、O3（パスキーの確認）、O4、O5、O6（パスワードの変更）、O9、O10（パスキーが1件もない場合の登録） |
| 1 | ログイン完了 | すべての API（研究者のみの API は、研究者の組織のみ） |

- 通常の組織は、パスワードの確認に成功すると、段階1になる。研究者の組織は、パスワードの確認の後、パスキーの確認（O2・O3）に成功すると段階1になる。
- 研究者の組織で、パスキーが1件も登録されていない場合（最初のログイン）は、パスワードの変更（O6）の後、パスキーの登録（O9・O10）を行う。最初のパスキーの登録に成功したら、ログイン完了（段階1）とする。
- 段階0のセッションで、使えない API を呼んだ場合は `403 PASSKEY_REQUIRED` を返す。
- `password_change_required = 1` の間は、O4・O5・O6 以外の API は `403 PASSWORD_CHANGE_REQUIRED` を返す。
- 検証の順序：`401` → `403 PASSKEY_REQUIRED` → `403 PASSWORD_CHANGE_REQUIRED` → `403 SUPER_ONLY` → `403 ELEVATION_REQUIRED` → `404`・`409` など。

### 0.3 CSRF 対策

ApiSpec_Auth.md の 0.3 と同じ（`Origin` ヘッダの検証と、`Content-Type: application/json`）。

### 0.4 破壊的な操作の確認

取り消せない操作・他の組織に影響する操作は、事前にパスワードを再入力して確認（O7）した端末（セッション）でのみ、5分間実行できる（`organization_sessions.elevated_until`）。

- 確認していない、または5分を過ぎている場合は `403 ELEVATION_REQUIRED` を返す。
- 対象の操作：パスキーの削除（O11）、組織のパスワードの再発行（O20）、組織の削除（O21）。

### 0.5 入力値の規則

| 項目 | 規則 |
|---|---|
| ログインID | 英小文字・数字・`.`・`_`・`-` のみの4〜64文字。保存前に小文字に正規化する |
| 組織名 | 正規化（前後の空白の除去、Unicode の正規化）後に1〜100文字 |
| パスワード | 12〜128文字。文字の種類は問わない。前後の空白も含めてそのまま扱う |
| メールアドレス | ApiSpec_Auth.md 0.6 と同じ |

- 初期パスワード（組織の発行・再発行時にサーバが作る）：紛らわしい文字（`0`・`O`・`1`・`l`・`I`）を除いた英大小文字と数字からなる、暗号論的に安全な乱数の16文字。

### 0.6 エラーコード（組織の API で追加するもの）

ApiSpec_Auth.md 0.5 のコード（`BAD_REQUEST`、`UNAUTHENTICATED`、`FORBIDDEN_ORIGIN`、`ELEVATION_REQUIRED`、`NOT_FOUND`、`PASSKEY_VERIFICATION_FAILED`、`PASSKEY_LIMIT_REACHED`、`VALIDATION_FAILED`、`RATE_LIMITED`、`MAIL_SEND_FAILED`、`INTERNAL_ERROR`）に加えて、次を使う。

| HTTP ステータス | `code` | 意味 |
|---|---|---|
| 401 | `INVALID_CREDENTIALS` | ログインIDまたはパスワードが一致しない（ログインIDの有無を区別しない） |
| 403 | `PASSKEY_REQUIRED` | パスキーの確認が済んでいない（段階0） |
| 403 | `PASSWORD_CHANGE_REQUIRED` | パスワードの変更が必要 |
| 403 | `SUPER_ONLY` | 研究者の組織のみが実行できる |
| 409 | `DUPLICATE_ORGANIZATION_NAME` | 同じ組織名がある |
| 409 | `DUPLICATE_LOGIN_ID` | 同じログインIDがある |
| 409 | `SUPER_ORGANIZATION_PROTECTED` | 研究者の組織は、名前の変更・パスワードの再発行・削除の対象外 |
| 409 | `LAST_PASSKEY` | 最後のパスキーは削除できない |
| 429 | `ORGANIZATION_PASSWORD_LOCKED` | パスワードの連続失敗によりロック中。`Retry-After` ヘッダにロック解除までの秒数を付ける |

### 0.7 API 一覧

| # | メソッド | パス | 認証 | 確認 | 研究者のみ | 概要 |
|---|---|---|---|---|---|---|
| O1 | POST | `/api/v1/org/sessions` | 不要 | | | ログイン（ログインID＋パスワード） |
| O2 | POST | `/api/v1/org/sessions/passkey-options` | 段階0 | | 研究者 | パスキーによるログインの確認の開始（challenge の発行） |
| O3 | POST | `/api/v1/org/sessions/passkey` | 段階0 | | 研究者 | パスキーによるログインの確認（ログインの完了） |
| O4 | GET | `/api/v1/org/sessions/current` | 段階0・1 | | | ログイン状態と組織の情報の取得 |
| O5 | DELETE | `/api/v1/org/sessions/current` | 段階0・1 | | | ログアウト |
| O6 | PUT | `/api/v1/org/password` | 段階0・1 | | | パスワードの変更 |
| O7 | POST | `/api/v1/org/elevation` | 段階1 | | | 破壊的な操作の確認（パスワードの再入力） |
| O8 | GET | `/api/v1/org/passkeys` | 段階1 | | 研究者 | パスキーの一覧 |
| O9 | POST | `/api/v1/org/passkeys/registration-options` | 段階0・1 | 段階1で必要 | 研究者 | パスキーの登録の開始（challenge の発行） |
| O10 | POST | `/api/v1/org/passkeys` | 段階0・1 | 段階1で必要 | 研究者 | パスキーの登録 |
| O11 | DELETE | `/api/v1/org/passkeys/{passkeyId}` | 段階1 | 必要 | 研究者 | パスキーの削除 |
| O12 | POST | `/api/v1/org/invitations` | 段階1 | | | 招待メールの送信 |
| O13 | GET | `/api/v1/org/invitations` | 段階1 | | | 未使用の招待の件数の取得 |
| O14 | DELETE | `/api/v1/org/invitations` | 段階1 | | | 未使用の招待の取り消し |
| O15 | GET | `/api/v1/org/members` | 段階1 | | | 所属している家族の一覧 |
| O16 | DELETE | `/api/v1/org/members/{familyId}` | 段階1 | | | 所属している家族を所属から外す |
| O17 | GET | `/api/v1/org/organizations` | 段階1 | | 研究者 | 組織の一覧 |
| O18 | POST | `/api/v1/org/organizations` | 段階1 | | 研究者 | 組織の登録（ログインアカウントの発行） |
| O19 | PATCH | `/api/v1/org/organizations/{organizationId}` | 段階1 | | 研究者 | 組織名の変更 |
| O20 | POST | `/api/v1/org/organizations/{organizationId}/password-reset` | 段階1 | 必要 | 研究者 | パスワードの再発行 |
| O21 | DELETE | `/api/v1/org/organizations/{organizationId}` | 段階1 | 必要 | 研究者 | 組織の削除 |

### 0.8 共通のデータ形式

**組織（`Organization`）**

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

### 1.1 ログイン `POST /api/v1/org/sessions`（O1）

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
2. ログインIDを正規化し、`organizations` を検索する。
   - 見つからなければ、IP 単位の失敗回数を加算して `401 INVALID_CREDENTIALS`。処理時間の差でログインIDの有無が分からないよう、ダミーのハッシュ計算を行う。
3. 組織の行を `SELECT ... FOR UPDATE` でロックする。ロック中なら `429 ORGANIZATION_PASSWORD_LOCKED`（`Retry-After` にロック解除までの秒数）。
4. パスワードを照合する。一致しなければ、組織の失敗回数を加算し（5回でロック、TableSpec_Organization.md 2.3）、IP 単位の失敗回数も加算して `401 INVALID_CREDENTIALS`。
5. 一致したら、失敗回数を0に戻し、`organization_sessions` を作成して Cookie を設定する。
   - 研究者の組織は段階0、通常の組織は段階1とする。
   - リクエストに有効な Cookie がある場合は、そのセッションを削除してから作成する。

**レスポンス** `201 Created`（`Set-Cookie: __Host-org-sid=...`）

```json
{
  "organization": { "id": "0192f3c0-...", "name": "研究者", "loginId": "researcher", "isSuper": true, "passwordChangeRequired": false },
  "authStage": 0,
  "passkeyRegistered": true
}
```

| 項目 | 説明 |
|---|---|
| `authStage` | 0：パスキーの確認が必要（研究者の組織）。1：ログイン完了 |
| `passkeyRegistered` | 研究者の組織で、パスキーが1件以上登録されていれば `true`。通常の組織は常に `false`。段階0で `false` の場合は、パスキーの登録（3.）に進む |

- クライアントは、`organization.passwordChangeRequired` が `true` ならパスワードの変更（2.1）、`authStage` が 0 で `passkeyRegistered` が `true` ならパスキーの確認（1.2・1.3）、`false` ならパスキーの登録（3.2・3.3）の画面を表示する。

**エラー**：`401 INVALID_CREDENTIALS`、`422 VALIDATION_FAILED`、`429 RATE_LIMITED`、`429 ORGANIZATION_PASSWORD_LOCKED`

### 1.2 パスキーによるログインの確認の開始 `POST /api/v1/org/sessions/passkey-options`（O2）

段階0のセッションで、challenge を発行する。

**リクエスト**：本文なし（`{}`）

**処理**

1. 研究者の組織でなければ `403 SUPER_ONLY`。すでにログインが完了している（段階1）セッションなら `400 BAD_REQUEST`。パスキーが1件もなければ `404 NOT_FOUND`。
2. 回数制限（セッション単位の challenge の発行回数。9.）を確認する。
3. 32バイトの challenge を生成し、このセッションに紐付けて5分間保持する（`webauthn_challenges`、`purpose` は `org_login`。TableSpec_Auth.md 4.2）。

**レスポンス** `200 OK`

ApiSpec_Auth.md 6.2 と同じ形式（`PublicKeyCredentialRequestOptions` の JSON 表現。`allowCredentials` には、組織のパスキーをすべて含める。`userVerification` は `required`）。

**エラー**：`400 BAD_REQUEST`、`401 UNAUTHENTICATED`、`403 SUPER_ONLY`、`404 NOT_FOUND`、`429 RATE_LIMITED`

### 1.3 パスキーによるログインの確認 `POST /api/v1/org/sessions/passkey`（O3）

パスキーで確認し、ログインを完了する（段階0 → 1）。

**リクエスト**

```json
{
  "passkey": { "id": "...", "rawId": "...", "type": "public-key", "response": { "clientDataJSON": "...", "authenticatorData": "...", "signature": "...", "userHandle": "..." } }
}
```

- `passkey` は、`navigator.credentials.get()` が返した `PublicKeyCredential` を JSON にしたもの（ApiSpec_Auth.md 6.1 と同じ）。

**処理**

1. このセッションの challenge（O2 で発行）を取り出して削除する。なければ `401 PASSKEY_VERIFICATION_FAILED`。
2. `credential_id` で `organization_passkeys` を検索し、ログイン中の組織のものであることを確認する。なければ `401 PASSKEY_VERIFICATION_FAILED`。
3. WebAuthn の手順に従って検証する（challenge・オリジン・RP ID の一致、ユーザ検証（UV フラグ）、署名、署名カウンタ。ApiSpec_Auth.md 6.1 と同じ）。失敗したら `401 PASSKEY_VERIFICATION_FAILED`。
4. 成功したら、`organization_passkeys` の `sign_count`・`last_used_at` を更新し、セッションを段階1にして、有効期限を延ばす（TableSpec_Organization.md 4.3）。

**レスポンス** `200 OK`

```json
{
  "organization": { "id": "0192f3c0-...", "name": "研究者", "loginId": "researcher", "isSuper": true, "passwordChangeRequired": false },
  "authStage": 1
}
```

- すでにログインが完了している（段階1）セッションでは、`400 BAD_REQUEST`（O2 と同じ）。

**エラー**：`400 BAD_REQUEST`、`401 UNAUTHENTICATED`、`401 PASSKEY_VERIFICATION_FAILED`、`403 SUPER_ONLY`

### 1.4 ログイン状態の取得 `GET /api/v1/org/sessions/current`（O4）

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
  "organization": { "id": "0192f3c0-...", "name": "○○大学", "loginId": "example-univ", "isSuper": false, "passwordChangeRequired": false }
}
```

**エラー**：`401 UNAUTHENTICATED`

### 1.5 ログアウト `DELETE /api/v1/org/sessions/current`（O5）

この端末のセッションを削除し、Cookie を削除する（`Max-Age=0`）。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`

## 2. パスワードと確認

### 2.1 パスワードの変更 `PUT /api/v1/org/password`（O6）

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

1. 組織の行を `SELECT ... FOR UPDATE` でロックする。ロック中なら `429 ORGANIZATION_PASSWORD_LOCKED`。
2. 現在のパスワードを照合する。一致しなければ、失敗回数を加算し（5回でロック）、`401 INVALID_CREDENTIALS`。
3. 新しいパスワードを Argon2id でハッシュ化して保存し、`password_change_required` を0に、失敗回数とロックを初期値に戻す。
4. 操作中の端末以外の、同じ組織のセッションを削除する。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`、`401 INVALID_CREDENTIALS`、`422 VALIDATION_FAILED`、`429 ORGANIZATION_PASSWORD_LOCKED`

### 2.2 破壊的な操作の確認 `POST /api/v1/org/elevation`（O7）

パスワードを再入力して確認し、この端末で5分間、破壊的な操作（0.4）を実行できるようにする。

**リクエスト**

```json
{
  "password": "（パスワード）"
}
```

**処理**：2.1 の 1.〜2. と同じ（ロック・失敗回数）。一致したら、`organization_sessions.elevated_until` を現在時刻の5分後とする。

**レスポンス** `200 OK`

```json
{
  "elevatedUntil": "2026-11-04T09:35:00.000Z"
}
```

**エラー**：`401 UNAUTHENTICATED`、`401 INVALID_CREDENTIALS`、`403 PASSKEY_REQUIRED`、`429 ORGANIZATION_PASSWORD_LOCKED`

## 3. パスキー（研究者の組織のみ）

通常の組織が呼び出した場合は、`403 SUPER_ONLY` を返す。

### 3.1 パスキーの一覧 `GET /api/v1/org/passkeys`（O8）

**レスポンス** `200 OK`

ApiSpec_Auth.md 7.6 と同じ形式（`passkeys`：`id`・`name`・`synced`・`createdAt`・`lastUsedAt`。登録日時の新しい順）。

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`

### 3.2 パスキーの登録の開始 `POST /api/v1/org/passkeys/registration-options`（O9）

**確認（0.4）が必要**（段階1の場合）。段階0で、パスキーが1件も登録されていない場合（最初のログイン）は、確認なしで呼び出せる。

**リクエスト**：本文なし（`{}`）

**処理**

1. 段階0で、すでにパスキーが登録されていれば `403 PASSKEY_REQUIRED`（段階0では、パスキーの確認だけを行える）。
2. パスキーが10件なら `409 PASSKEY_LIMIT_REACHED`。
3. 回数制限（セッション単位の challenge の発行回数）を確認し、32バイトの challenge を生成して、このセッションに紐付けて5分間保持する（`purpose` は `org_registration`）。

**レスポンス** `200 OK`

ApiSpec_Auth.md 7.7 と同じ形式（`PublicKeyCredentialCreationOptions` の JSON 表現）。次の点が異なる。

| 項目 | 値 |
|---|---|
| `user.id` | `organizations.id`（base64url）。個人情報を含まない |
| `user.name` | 組織のログインID |
| `user.displayName` | 組織名 |

**エラー**：`401 UNAUTHENTICATED`、`403 PASSKEY_REQUIRED`、`403 PASSWORD_CHANGE_REQUIRED`、`403 SUPER_ONLY`、`403 ELEVATION_REQUIRED`、`409 PASSKEY_LIMIT_REACHED`、`429 RATE_LIMITED`

### 3.3 パスキーの登録 `POST /api/v1/org/passkeys`（O10）

**確認（0.4）が必要**（段階1の場合）。

**リクエスト**：ApiSpec_Auth.md 7.8 と同じ（`credential`）。

**処理**：ApiSpec_Auth.md 7.8 と同じ（challenge の取り出し、検証、10件の上限、保存。保存先は `organization_passkeys`）。**段階0で、最初のパスキーの登録に成功した場合は、セッションを段階1にして、ログインを完了する。**

**レスポンス** `201 Created`

```json
{
  "passkey": { "id": "0192f3b0-...", "name": "Mac / Safari で登録", "synced": true, "createdAt": "2026-11-04T09:30:00.000Z", "lastUsedAt": null },
  "authStage": 1
}
```

**エラー**：`401 UNAUTHENTICATED`、`401 PASSKEY_VERIFICATION_FAILED`、`403 PASSKEY_REQUIRED`、`403 SUPER_ONLY`、`403 ELEVATION_REQUIRED`、`409 PASSKEY_LIMIT_REACHED`

### 3.4 パスキーの削除 `DELETE /api/v1/org/passkeys/{passkeyId}`（O11）

**確認（0.4）が必要**。

**処理**：最後の1件なら `409 LAST_PASSKEY`（研究者の組織は、パスキーが1件以上必要）。そうでなければ、`organization_passkeys` の行を削除する。端末（認証器）に残ったパスキー自体は、サーバから削除できないため、クライアントは「端末のパスキーの管理画面からも削除してください」と案内する。

**レスポンス** `204 No Content`

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`、`403 ELEVATION_REQUIRED`、`404 NOT_FOUND`、`409 LAST_PASSKEY`

## 4. 招待

### 4.1 招待メールの送信 `POST /api/v1/org/invitations`（O12）

指定されたメールアドレスに、組織への招待メールを送る（基本方針 10.5）。

**リクエスト**

```json
{
  "email": "user@example.com"
}
```

**処理**

1. 回数制限（組織単位、システム全体。9.）を確認する。超えていたら `429 RATE_LIMITED`。
2. メールアドレスの形式を検証する（ApiSpec_Auth.md 0.6）。不正なら `422 VALIDATION_FAILED`。
3. 招待トークンを生成し、`organization_invitations` に、ハッシュ・組織・有効期限（7日）のみを保存する。
4. 招待URL（`https://<ホスト>/invite#token=<トークン>`）と組織名を、メールで送る。
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

### 4.2 未使用の招待の件数 `GET /api/v1/org/invitations`（O13）

**レスポンス** `200 OK`

```json
{
  "pendingCount": 3
}
```

- 有効期限内で、まだ使われていない招待の件数。誰に送ったかは分からない（基本方針 10.5）。

**エラー**：`401 UNAUTHENTICATED`

### 4.3 未使用の招待の取り消し `DELETE /api/v1/org/invitations`（O14）

有効期限内の、未使用の招待をすべて取り消す（誤って送った場合など）。個別の招待は区別できないため、すべて取り消す。

**レスポンス** `200 OK`

```json
{
  "revokedCount": 3
}
```

**エラー**：`401 UNAUTHENTICATED`

## 5. 所属している家族の管理

### 5.1 所属している家族の一覧 `GET /api/v1/org/members`（O15）

自組織に、現在所属している家族の一覧を返す。

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
- 組織が参照できるのは、家族の ID・所属日時・ユーザの ID とユーザ名のみ（TableSpec_Organization.md 6.）。

**エラー**：`401 UNAUTHENTICATED`

### 5.2 所属している家族を外す `DELETE /api/v1/org/members/{familyId}`（O16）

自組織に所属している家族を、所属から外す（基本方針 10.6）。家族は個人ユーザになる。

**処理**：指定された家族が、自組織に所属していなければ（他の組織の家族、存在しない家族を含む）`404 NOT_FOUND`。そうでなければ、`families.organization_id`・`organization_joined_at` を NULL にする。

**レスポンス** `204 No Content`

- 外された家族のユーザの利用データは、以降、この組織から参照できなくなる。組織がすでにダウンロードしたデータは、消えない。

**エラー**：`401 UNAUTHENTICATED`、`404 NOT_FOUND`

## 6. 組織の管理（研究者の組織のみ）

通常の組織が呼び出した場合は、`403 SUPER_ONLY` を返す。研究者の組織は、一覧（6.1）には表示されるが、名前の変更・パスワードの再発行・削除の対象外である（`409 SUPER_ORGANIZATION_PROTECTED`）。

### 6.1 組織の一覧 `GET /api/v1/org/organizations`（O17）

**レスポンス** `200 OK`

```json
{
  "organizations": [
    {
      "id": "0192f3c0-...",
      "name": "○○大学",
      "loginId": "example-univ",
      "isSuper": false,
      "memberFamilyCount": 12,
      "createdAt": "2026-11-04T09:30:00.000Z"
    }
  ]
}
```

- 作成日時の新しい順。`memberFamilyCount` は、現在所属している家族の数。

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`

### 6.2 組織の登録 `POST /api/v1/org/organizations`（O18）

組織のログインアカウントを発行する（基本方針 10.3）。

**リクエスト**

```json
{
  "name": "○○大学",
  "loginId": "example-univ"
}
```

**処理**：ログインIDと組織名を検証する。重複があれば `409 DUPLICATE_LOGIN_ID`・`409 DUPLICATE_ORGANIZATION_NAME`。初期パスワードを生成し、Argon2id でハッシュ化して、`password_change_required = 1` で `organizations` を作成する。

**レスポンス** `201 Created`

```json
{
  "organization": { "id": "0192f3c0-...", "name": "○○大学", "loginId": "example-univ", "isSuper": false, "passwordChangeRequired": true },
  "initialPassword": "（16文字の初期パスワード）"
}
```

- `initialPassword` は、**このレスポンスでのみ返す**。研究者は、安全な方法で、組織の担当者に伝える。組織は、最初のログインで、パスワードを変更する（2.1）。

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`、`409 DUPLICATE_LOGIN_ID`、`409 DUPLICATE_ORGANIZATION_NAME`、`422 VALIDATION_FAILED`

### 6.3 組織名の変更 `PATCH /api/v1/org/organizations/{organizationId}`（O19）

**リクエスト**

```json
{
  "name": "○○大学 情報学部"
}
```

**レスポンス** `200 OK`

```json
{
  "organization": { "id": "0192f3c0-...", "name": "○○大学 情報学部", "loginId": "example-univ", "isSuper": false, "passwordChangeRequired": false }
}
```

- 変更した組織名は、以降の招待メール・招待ページに表示される。すでに送られた招待メールの本文は変わらない。

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`、`404 NOT_FOUND`、`409 DUPLICATE_ORGANIZATION_NAME`、`409 SUPER_ORGANIZATION_PROTECTED`、`422 VALIDATION_FAILED`

### 6.4 パスワードの再発行 `POST /api/v1/org/organizations/{organizationId}/password-reset`（O20）

組織がパスワードを忘れた場合などに、新しい初期パスワードを発行する。**確認（0.4）が必要**。

**処理**（1つのトランザクション）

1. 新しい初期パスワードを生成し、ハッシュ化して保存する。
2. `password_change_required` を1に、失敗回数とロックを初期値に戻す。
3. その組織のすべてのセッションを削除する。

**レスポンス** `200 OK`

```json
{
  "initialPassword": "（16文字の初期パスワード）"
}
```

- `initialPassword` は、このレスポンスでのみ返す。

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`、`403 ELEVATION_REQUIRED`、`404 NOT_FOUND`、`409 SUPER_ORGANIZATION_PROTECTED`

### 6.5 組織の削除 `DELETE /api/v1/org/organizations/{organizationId}`（O21）

組織を削除する。**確認（0.4）が必要**。

- 所属していた家族は、組織に属していない個人ユーザになる（基本方針 10.6）。利用データは削除されず、研究者のみが参照できる。
- 組織のパスキー・セッション・未使用の招待は削除される。
- クライアントは、影響を受ける家族の数を表示して確認を求める（一覧の `memberFamilyCount`）。

**処理**（1つのトランザクション）

1. 所属している家族の数を数える。
2. 所属していた家族の `organization_id` と `organization_joined_at` を NULL にする（外部キーの `ON DELETE SET NULL` は、`organization_joined_at` を NULL にしないため。TableSpec_Account.md 2.3）。
3. `organizations` の行を削除する（`organization_*` のテーブルは `ON DELETE CASCADE` で削除される）。

**レスポンス** `200 OK`

```json
{
  "releasedFamilyCount": 12
}
```

**エラー**：`401 UNAUTHENTICATED`、`403 SUPER_ONLY`、`403 ELEVATION_REQUIRED`、`404 NOT_FOUND`、`409 SUPER_ORGANIZATION_PROTECTED`

## 7. 利用データの参照（別途定義）

- 利用データ（テスト結果）の参照・ダウンロードの API は、利用データのテーブルの設計（別途）の後に定義する。
- 参照できる範囲は、TableSpec_Organization.md 6. に従う。
  - 通常の組織：現在その組織に所属している家族の、現存するユーザのデータのみ。
  - 研究者：すべて（個人ユーザ・退会した家族・削除されたユーザのデータを含む）。
- パスは、`/api/v1/org/` の下に置く（例：`/api/v1/org/users/{userId}/...`、`/api/v1/org/exports/...`）。
- 参照の可否は、リクエストのたびに、組織の所属関係で判定する（セッションに保持した値は使わない）。参照できないユーザの `userId` を指定された場合は、存在しない場合と区別せず `404 NOT_FOUND` を返す。

## 8. 操作の記録

研究者は全ユーザのデータを参照でき、組織の管理もできるため、次の操作を、アプリケーションのログに記録する（時刻・組織 ID・操作・結果。メールアドレス・パスワード・トークンは記録しない）。

- ログインの成功・失敗、パスワードの変更・再発行、ロックの発生
- パスキーの登録・削除
- 組織の登録・名前の変更・削除
- 招待メールの送信（件数のみ。送信先は記録しない）、招待の取り消し
- 家族の所属からの除外
- 利用データのダウンロード・参照（研究者・組織。対象の範囲）

- ログの保存期間は未決（10.）。

## 9. 回数制限

| 対象 API | 単位 | しきい値（初期値） | 超えた場合 | キー（TableSpec_Auth.md 4.1） |
|---|---|---|---|---|
| O1 ログイン | IP | 失敗 20回／1時間 | `429 RATE_LIMITED` | `orglogin:fail:ip:<IP>` |
| O1 ログイン | システム全体 | 失敗 500回／1時間 | 運用者に通知のみ（拒否はしない） | `orglogin:fail:global` |
| O1・O6・O7 パスワードの照合 | 組織 | 連続失敗 5回で15分ロック（DB で管理） | `429 ORGANIZATION_PASSWORD_LOCKED` | `organizations` の列 |
| O2・O9 challenge の発行 | セッション | 30回／10分 | `429 RATE_LIMITED` | `challenge:<セッションID>` |
| O12 招待メールの送信 | 組織 | 100通／1時間 | `429 RATE_LIMITED` | `invite:send:org:<組織ID>` |
| O12 招待メールの送信 | システム全体 | 1,000通／1時間（仮登録メールと合算） | `429 RATE_LIMITED`、運用者に通知 | `mail:send:global` |

- しきい値は初期値とし、利用状況を見て調整する。
- IP 単位の制限は、緩めの値とする（基本方針 4.4）。IP アドレスは、鍵付きハッシュとして保存する。
- 組織のログインのシステム全体の失敗数は、拒否すると全組織がログインできなくなるため、通知のみとする。
- 超えた場合は `Retry-After` ヘッダに、カウンターの有効期限が切れるまでの秒数を付ける。
- 研究者の組織のロックは、攻撃者が繰り返すと、研究者がログインできなくなる。復旧は、TableSpec_Organization.md 7. の SQL で行う。

## 10. 未決事項

- パスワードの規則（12〜128文字としている）
- 組織のセッションの有効期限（TableSpec_Organization.md 9.）
- 組織の一覧・所属している家族の一覧のページング（件数が多くなった場合）
- 招待の有効期限（7日としている）
- 操作の記録（8.）の保存期間
- 通常の組織にも、パスキーを求めるか、任意で登録できるようにするか
- 研究者のパスキーの確認（O3）の失敗が続いた場合の扱い（現状は、challenge の発行回数の制限のみ）
- 組織が、所属している家族の ID を参照できてよいか（`families.id` は、パスキーの user handle と同じ値）
