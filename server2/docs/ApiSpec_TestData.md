# Web API 仕様書：利用データ（テスト結果）

データフォーマット（DataFormat_TestData.md）とテーブル仕様書（TableSpec_TestData.md）に基づき、テスト・訓練の結果（利用データ）の Web API を定義する。

- クライアントアプリ（家族・ユーザ）向け：#32〜#35（ApiSpec_Auth.md の番号の続き）
- 研究者・組織向け：O22〜O26（ApiSpec_Organization.md の番号の続き）

家族・ユーザの認証は ApiSpec_Auth.md、組織の認証は ApiSpec_Organization.md を参照する。

## 0. 共通事項

### 0.1 基本

- ベースパスは、クライアントアプリ向けが `/api/v1`、研究者・組織向けが `/api/v1/org`。
- 通信、リクエスト・レスポンスの本文、ID、`Cache-Control: no-store`、CSRF 対策、エラーレスポンスの形式は、ApiSpec_Auth.md の 0.1〜0.3・0.5 に従う（組織向けは ApiSpec_Organization.md の 0.1〜0.3）。
- 日時は、レスポンスでは UTC（`2026-10-29T08:54:03.875Z`）で返す。セッションの開始日時のオフセットは、`utcOffsetMinutes`（分。`+09:00` は `540`）で返す。
  - 送信（#32）の日時は、DataFormat_TestData.md のとおり、オフセット付き（`+09:00` など）で受け取る。
  - CSV（#35・O25）の日時は、セッションの開始日時のオフセット付きで出す（TableSpec_TestData.md 0.）。
- 利用データの本文（送信・取得）は、DataFormat_TestData.md の形式。キー名は `camelCase`。

### 0.2 認証と参照できる範囲

| API | 認証 | 参照・書き込みできる範囲 |
|---|---|---|
| #32〜#35 | 家族の Cookie（`__Host-sid`） | パスの `userId` が、ログイン中の家族の、現存するユーザであること。そうでなければ `404 NOT_FOUND`（ApiSpec_Auth.md 3.2）。削除されたユーザの `userId` も `404` |
| O22〜O25 | 組織の Cookie（`__Host-org-sid`）、段階1 | 通常の組織：現在その組織に所属している家族の、現存するユーザのみ。研究者：すべて（個人ユーザ・退会した家族・削除されたユーザを含む）。参照できない `userId` は、存在しない場合と区別せず `404 NOT_FOUND`（TableSpec_Organization.md 6.） |
| O26 | 組織の Cookie、段階1 | 研究者のみ（`403 SUPER_ONLY`）。確認（O7）が必要 |

- 参照の可否は、リクエストのたびに、データベース上の所属関係で判定する（セッションに保持した値は使わない）。
- 組織は、利用データとユーザ名（ニックネーム）のみ参照できる。家族の ID・組織の ID・メールアドレス・復旧コードなどは返さない。
- 組織向けの API の検証の順序は、ApiSpec_Organization.md 0.2 に従う（`401` → `403 PASSKEY_REQUIRED` → `403 PASSWORD_CHANGE_REQUIRED` → `403 SUPER_ONLY` → `403 ELEVATION_REQUIRED` → `404`・`409` など）。

### 0.3 エラーコード（利用データの API で追加するもの）

ApiSpec_Auth.md 0.5 と ApiSpec_Organization.md 0.6 のコードに加えて、次を使う。

| HTTP ステータス | `code` | 意味 |
|---|---|---|
| 409 | `SESSION_ID_CONFLICT` | 同じ `sessionId` が、別のユーザのデータとして保存されている（#32） |
| 413 | `PAYLOAD_TOO_LARGE` | リクエスト本文が上限（1 MiB）を超えた（#32） |
| 422 | `EXPORT_TOO_LARGE` | ダウンロードの範囲が大きすぎる（5.2）。`details` に該当するセッション数と上限を入れる |

### 0.4 API 一覧

**クライアントアプリ向け**

| # | メソッド | パス | 認証 | 確認 | 概要 |
|---|---|---|---|---|---|
| 32 | POST | `/api/v1/users/{userId}/test-sessions` | 必要 | | セッション 1 件の送信 |
| 33 | GET | `/api/v1/users/{userId}/test-sessions` | 必要 | | 自分のセッションの一覧（履歴） |
| 34 | GET | `/api/v1/users/{userId}/test-sessions/{sessionId}` | 必要 | | セッション 1 件の詳細 |
| 35 | GET | `/api/v1/users/{userId}/test-exports` | 必要 | | 自分のデータの CSV のダウンロード |

**研究者・組織向け**

| # | メソッド | パス | 認証 | 確認 | 研究者のみ | 概要 |
|---|---|---|---|---|---|---|
| O22 | GET | `/api/v1/org/users` | 段階1 | | | 参照できるユーザの一覧 |
| O23 | GET | `/api/v1/org/users/{userId}/test-sessions` | 段階1 | | | ユーザのセッションの一覧 |
| O24 | GET | `/api/v1/org/users/{userId}/test-sessions/{sessionId}` | 段階1 | | | セッション 1 件の詳細 |
| O25 | GET | `/api/v1/org/test-exports` | 段階1 | | | CSV・ZIP のダウンロード |
| O26 | DELETE | `/api/v1/org/test-sessions/{sessionId}` | 段階1 | 必要 | 研究者 | セッション 1 件の削除 |

### 0.5 共通のデータ形式

**セッションの要約（`SessionSummary`）**：一覧（#33・O23）の 1 件。

```json
{
  "sessionId": "77656c60-150c-41f4-8dd6-46524223f7d9",
  "testType": "training",
  "sessionStatus": "completed",
  "startedAt": "2026-10-28T23:54:00.000Z",
  "endedAt": "2026-10-28T23:57:10.000Z",
  "utcOffsetMinutes": 540,
  "variant": "menu-06",
  "attemptNumber": 1,
  "plannedCount": 15,
  "summary": { "trialsCompleted": 15, "correctCount": 13, "giveupCount": 1 }
}
```

| 項目 | 説明 |
|---|---|
| `variant` | 相対音感は `testVersion`、調性感は `measurementKeyCode`、訓練は `menuId`。絶対音感は `null`（TableSpec_TestData.md 2.2） |
| `attemptNumber`、`plannedCount` | 保存した値。ない場合は `null` |
| `summary` | 種類ごとの件数。保存せず、回答から数える。定義は、現在のクライアントの `reports.js` と同じ |

`summary` の中身：

| 種類 | キー |
|---|---|
| `absolute_pitch` | `questionsPresented`、`correctCount`、`incorrectAnswerCount`、`timeoutCount` |
| `relative_pitch` | `questionsPresented`、`questionsAnswered`、`correctCount`、`incorrectCount`、`accuracy` |
| `functional_pitch` | `answeredTrialCount`、`totalTrialCount` |
| `training` | `trialsCompleted`、`correctCount`、`giveupCount` |

**セッションの詳細（`SessionDetail`）**：#34・O24。

- 送信（DataFormat_TestData.md 4.〜7.）と同じ形に、次を加える。
  - `utcOffsetMinutes`、`receivedAt`。組織向け（O24）には、`userId` も加える。
  - 日時は、すべて UTC（`Z`）で返す。
- 訓練の `trialsCompleted`・`correctCount`・`giveupCount` と、各試行の `scoring` は、保存した回答から数え直した値。
- 相対音感の `generatedQuestionOrder`、調性感の `generatedTrialOrder`・`practiceResults` は、`attributes` に保存したものを返す。

**一覧のクエリとページング**（#33・O23）

| クエリ | 既定値 | 説明 |
|---|---|---|
| `testType` | すべて | `absolute_pitch` / `relative_pitch` / `functional_pitch` / `training` |
| `from`、`to` | なし | `startedAt` の範囲（`from` 以上、`to` 未満。UTC の ISO 8601） |
| `includeInterrupted` | `false` | `false` は `interrupted` と `audio_error` を除く（`forced_termination` は含める） |
| `limit` | `50` | 1〜100 |
| `cursor` | なし | 前のレスポンスの `nextCursor`（不透明な文字列） |

- 並び順は、`startedAt` の新しい順（同じ時刻は `sessionId` の順）。
- レスポンス：`{ "sessions": [SessionSummary, …], "nextCursor": "…" }`。続きがない場合は `nextCursor` が `null`。
- 値が不正な場合は `422 VALIDATION_FAILED`（`details` に項目ごとのエラー）。

## 1. 送信

### 1.1 セッションの送信 `POST /api/v1/users/{userId}/test-sessions`（#32）

テスト・訓練 1 セッション分を保存する。

**リクエスト**：DataFormat_TestData.md 4.〜7. の JSON（`testType` で種類を決める）。例は、DataFormat_TestData.md の付録 A。

**処理**（TableSpec_TestData.md 8.）

1. 認証し、`userId` がログイン中の家族の現存するユーザであることを確認する。
2. 本文の大きさを確認する（上限 1 MiB）。
3. JSON を検証する（1.2）。
4. 1 つのトランザクションで、`test_sessions` と回答のテーブルに保存する。
   - 同じ `sessionId` が同じ `userId` で保存済みなら、何もしない。
   - 同じ `sessionId` が別の `userId` で保存済みなら、`409 SESSION_ID_CONFLICT`。
   - 同時に同じ `sessionId` が送られて主キーが重複した場合は、判定をやり直す。

**レスポンス**

- `201 Created`（初めて保存）または `200 OK`（保存済みの再送）。

```json
{
  "sessionId": "3f2504e0-4f89-4f9d-9a7f-2f1e6b6a2b11",
  "testType": "absolute_pitch",
  "receivedAt": "2026-10-29T10:05:24.123Z"
}
```

- 再送のとき、内容が前回と違っていても、保存済みの内容を変えない（上書きしない）。

**エラー**：`400 BAD_REQUEST`、`401 UNAUTHENTICATED`、`403 FORBIDDEN_ORIGIN`、`404 NOT_FOUND`、`409 SESSION_ID_CONFLICT`、`413 PAYLOAD_TOO_LARGE`、`422 VALIDATION_FAILED`、`429 RATE_LIMITED`

- 検証の順序：`401` → `403` → `404` → `413` → `400` → `422` → `409`。
- 通信エラー・`5xx` は、クライアントが再送する。`200`・`201` は成功として扱う。`400`・`409`・`422` は、再送しても直らないので、再送しない（クライアントは失敗として記録する）。

### 1.2 検証の規則

| 項目 | 規則 |
|---|---|
| 本文 | JSON のオブジェクト。上限 1 MiB。配列・オブジェクトを入れてはいけない項目（日時・文字列・数値）に、配列・オブジェクトがあれば `422`（`practiceResults` を除く） |
| `testType` | 4 種類のいずれか。それ以外は `422`（`details` の `field` は `testType`） |
| `sessionId` | UUID（36 文字、大文字・小文字可。保存は小文字に正規化） |
| `startedAt`、`endedAt` | `yyyy-MM-ddTHH:mm:ss` で始まる ISO 8601（小数秒とオフセットは任意）。オフセットのないものは `422`。オフセットは `-12:00`〜`+14:00` |
| 日時の前後関係 | `startedAt <= endedAt`。`startedAt` は、サーバ時刻の 1 日先より後であってはいけない |
| `sessionStatus` | 種類ごとに使える値のみ（DataFormat_TestData.md 3.）。種類ごとの組み合わせは、DB の CHECK 制約と同じ |
| 必須の項目 | DataFormat_TestData.md 4.〜7. の「必須」の項目。欠けていれば `422`（`code`: `REQUIRED`） |
| 列挙値 | `phase`、`outcome`、`testVersion`、`practiceStatus` など。規則外は `422`（`code`: `INVALID`） |
| 数値 | 整数。`responseTimeMs` など件数・時間は 0 以上。上限は、TableSpec_TestData.md の列の型の範囲 |
| 文字列 | 長さは、TableSpec_TestData.md の列の長さまで |
| 配列の件数 | `responses`・`trials`・`generatedQuestionOrder`・`generatedTrialOrder`：200 件まで。`practiceResults`：100 件まで。`trials[].responses`：10 件まで。超えれば `422`（`code`: `TOO_MANY`） |
| 重複 | `responses` の中で、調性感・訓練の `trialNumber` が重複していれば `422`。訓練は、試行内の `targetId` の重複も `422` |
| 空欄 | `""` と `null` は、どちらも「なし」として受け取る |
| 未知のキー | 無視する（保存しない） |
| `currentQuestion`、`currentTrial` | 無視する |

- `422` の `details` は、`{ "field": "responses[2].outcome", "code": "INVALID" }` の形（ApiSpec_Auth.md 0.5）。1 回で最大 20 件まで返す。

## 2. 本人の参照

### 2.1 セッションの一覧 `GET /api/v1/users/{userId}/test-sessions`（#33）

履歴の表示に使う。クエリは 0.5。

**レスポンス** `200 OK`

```json
{
  "sessions": [ { "sessionId": "…", "testType": "training", "…": "…" } ],
  "nextCursor": null
}
```

**エラー**：`401 UNAUTHENTICATED`、`404 NOT_FOUND`、`422 VALIDATION_FAILED`

### 2.2 セッションの詳細 `GET /api/v1/users/{userId}/test-sessions/{sessionId}`（#34）

**レスポンス** `200 OK`：`{ "session": SessionDetail }`

**エラー**：`401 UNAUTHENTICATED`、`404 NOT_FOUND`（`userId` が自分の家族のユーザでない、`sessionId` がそのユーザのものでない、のいずれも）

### 2.3 CSV のダウンロード `GET /api/v1/users/{userId}/test-exports`（#35）

自分のデータを、CSV として取り出す（現在のクライアントの CSV 出力に相当する）。

**クエリ**

| クエリ | 必須 | 説明 |
|---|---|---|
| `testType` | ○ | 4 種類のいずれか |
| `kind` | ○ | `responses`（回答詳細）/ `sessions`（履歴） |
| `from`、`to` | | `startedAt` の範囲（0.5 と同じ） |
| `includeInterrupted` | | 0.5 と同じ |

**レスポンス** `200 OK`

- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="uec-tst_<testType>_<kind>_<yyyyMMdd_HHmmss>.csv"`（時刻は UTC）
- 本文：DataFormat_TestData.md 8. の列。BOM 付き UTF-8。
- 範囲内にセッションがない場合も、見出しの行のみの CSV を返す（`200`）。

**エラー**：`401 UNAUTHENTICATED`、`404 NOT_FOUND`、`422 VALIDATION_FAILED`、`422 EXPORT_TOO_LARGE`、`429 RATE_LIMITED`

## 3. 研究者・組織の参照

### 3.1 参照できるユーザの一覧 `GET /api/v1/org/users`（O22）

組織が参照できるユーザと、そのデータの概要を返す。

**クエリ**：`limit`（既定 `50`、1〜100）、`cursor`。並び順は `userId` の順。

**レスポンス** `200 OK`

```json
{
  "users": [
    {
      "userId": "0192f3a0-7c1e-7b52-9d4e-3a5b6c7d8e9f",
      "name": "はなこ",
      "sessionCount": 24,
      "lastSessionAt": "2026-10-28T23:57:10.000Z",
      "organization": { "name": "○○大学" }
    }
  ],
  "nextCursor": null
}
```

| 項目 | 説明 |
|---|---|
| `name` | ユーザ名（ニックネーム）。削除されたユーザ・退会した家族のユーザは `null`（研究者のみ） |
| `sessionCount`、`lastSessionAt` | そのユーザの保存済みセッションの数と、最後の開始日時。データがないユーザも一覧に含める（`0`、`null`） |
| `organization` | 研究者のみ返す。現在所属している組織の名前。個人ユーザ・削除されたユーザは `null`。通常の組織には、この項目を返さない |

- 通常の組織：所属している家族の、現存するユーザ（データのないユーザを含む）。
- 研究者：現存するユーザと、`test_sessions` に `user_id` が残っている削除済みのユーザ。

**エラー**：`401 UNAUTHENTICATED`、`403 PASSKEY_REQUIRED`、`403 PASSWORD_CHANGE_REQUIRED`

### 3.2 ユーザのセッションの一覧 `GET /api/v1/org/users/{userId}/test-sessions`（O23）

クエリ・レスポンスは #33 と同じ（0.5）。

**エラー**：`401`、`403 PASSKEY_REQUIRED`、`403 PASSWORD_CHANGE_REQUIRED`、`404 NOT_FOUND`、`422 VALIDATION_FAILED`

### 3.3 セッションの詳細 `GET /api/v1/org/users/{userId}/test-sessions/{sessionId}`（O24）

レスポンスは #34 と同じ（`SessionDetail`。`userId` を含む）。

**エラー**：`401`、`403 PASSKEY_REQUIRED`、`403 PASSWORD_CHANGE_REQUIRED`、`404 NOT_FOUND`

## 4. ダウンロード（CSV・ZIP）

### 4.1 ダウンロード `GET /api/v1/org/test-exports`（O25）

参照できる範囲のデータを、CSV または ZIP として取り出す。

**クエリ**

| クエリ | 既定値 | 説明 |
|---|---|---|
| `format` | `zip` | `zip` / `csv` |
| `userId` | 参照できるすべてのユーザ | 1 人のユーザ。複数のユーザは、`userId` を繰り返して指定する（最大 100 人） |
| `testType` | すべて | 1 種類を指定する。複数の種類は、`testType` を繰り返す |
| `kind` | すべて | `responses` / `sessions` |
| `from`、`to` | なし | `startedAt` の範囲（0.5 と同じ） |
| `includeInterrupted` | `false` | 0.5 と同じ |

- `format=csv` は、`userId` が 1 人、`testType` が 1 種類、`kind` が 1 つに決まっている場合のみ指定できる。そうでなければ `422 VALIDATION_FAILED`。
- 指定した `userId` が 1 人でも参照できない場合は、`404 NOT_FOUND`（どの `userId` かは返さない）。

**レスポンス** `200 OK`

| `format` | `Content-Type` | `Content-Disposition` の `filename` |
|---|---|---|
| `csv` | `text/csv; charset=utf-8` | `uec-tst_<testType>_<kind>_<yyyyMMdd_HHmmss>.csv` |
| `zip` | `application/zip` | `uec-tst_test-data_<yyyyMMdd_HHmmss>.zip` |

- 時刻は UTC。
- CSV は、BOM 付き UTF-8（DataFormat_TestData.md 8.）。
- ZIP の中の構成：

```
<testType>/
  responses_<userId>.csv
  sessions_<userId>.csv
```

- データのない（種類、ユーザ）の組み合わせは、ファイルを作らない。範囲内にデータが 1 件もない場合、ZIP は空の ZIP になる。`csv` の場合は、見出しの行のみの CSV を返す。

**エラー**：`401`、`403 PASSKEY_REQUIRED`、`403 PASSWORD_CHANGE_REQUIRED`、`404 NOT_FOUND`、`422 VALIDATION_FAILED`、`422 EXPORT_TOO_LARGE`、`429 RATE_LIMITED`

### 4.2 範囲の上限

- 1 回のダウンロードで取り出せるセッション数に、上限を設ける。初期値は **5,000 件**。
- 上限は、`AppConfig.json` の `testData.exportMaxSessions` で指定する（1〜100000 の整数。省略時は 5,000）。
- 本文を送り始める前に、範囲内のセッション数を数え、上限を超えていれば `422 EXPORT_TOO_LARGE` を返す（`details` に、`count` と `limit` を入れる）。クライアントは、ユーザ・種類・期間を絞って再度要求する。
- 上限は、運用して調整する。

**上限を設ける理由**

1. **サーバ資源の保護：** 範囲が広いと、1 回の要求で数十万行をデータベースから読み、結合し、CSV・ZIP にすることになる。長い要求は、データベースの負荷と PHP の処理時間を占有し、他の利用者の送信（#32）や参照を遅らせる。
2. **途中で切れることの防止：** 出力を始めた後は、ステータスコードを変えられない。処理が Web サーバやプロキシのタイムアウトで途中で切れると、クライアントには不完全なファイルが残る。出力を始める前に断るために、範囲の大きさを先に確かめる。
3. **ZIP の作成の負荷：** ファイルの数と大きさが増えるほど、圧縮に CPU を長く使う。
4. **持ち出しの抑止（補助的）：** 組織の認証情報が漏れたとき、1 回の操作で全データを持ち出されにくくする。回数制限（7.）と合わせて効く、限定的な効果。

- メモリの使用量は、行を順に出力するため（4.3）、行数に比例しない。上限の主な理由は、メモリではなく、処理時間とデータベースの負荷である。
- 5,000 件という値は、実測に基づいていない。運用でデータ量と処理時間を見て、`AppConfig.json` で調整する。

### 4.3 作り方

- ファイルを保存しない。要求のたびに、データベースから作る（前提：DataFormat_TestData.md 1.）。
- 行を順に読み、順に出力する（結果全体をメモリに載せない）。ZIP も、一時ファイルを作らず、出力しながら作る。
- 送り始めた後でエラーが起きた場合は、ステータスを変えられないので、接続を切る（クライアントは、ダウンロードの失敗として扱う）。エラーはログに記録する。
- 範囲内のセッションは、要求の時点のデータベースの状態で決める。ダウンロードの途中で保存されたセッションが、含まれる場合も含まれない場合もある。

## 5. 削除

### 5.1 セッションの削除 `DELETE /api/v1/org/test-sessions/{sessionId}`（O26）

研究者が、利用データのセッション 1 件を削除する（基本方針 10.7、TableSpec_Account.md 5.2）。**確認（O7）が必要**。

**処理**：`test_sessions` の行を削除する（回答のテーブルは、`ON DELETE CASCADE` で連鎖して削除される）。

**レスポンス** `204 No Content`

**エラー**：`401`、`403 PASSKEY_REQUIRED`、`403 PASSWORD_CHANGE_REQUIRED`、`403 SUPER_ONLY`、`403 ELEVATION_REQUIRED`、`404 NOT_FOUND`

- ユーザごと・期間ごとなどの一括削除は、運用者の SQL で行う（6. 未決事項）。

## 6. 操作の記録

ApiSpec_Organization.md 8. に従い、次の操作を、アプリケーションのログに記録する（時刻・組織 ID・操作・結果。利用データの内容・ユーザ名は記録しない）。

| 操作 | `action` | 記録する項目 |
|---|---|---|
| ユーザの一覧（O22） | `org.test_data.users` | 件数 |
| セッションの一覧（O23） | `org.test_data.sessions` | `userId`、件数 |
| セッションの詳細（O24） | `org.test_data.session` | `userId`、`sessionId` |
| ダウンロード（O25） | `org.test_data.export` | 絞り込みの条件（`userId` の数、`testType`、`kind`、`from`、`to`）、セッション数 |
| 削除（O26） | `org.test_data.delete` | `sessionId`、`userId` |

- 家族・ユーザの API（#32〜#35）は、記録しない（通常のアクセスログのみ）。送信の失敗（`422` など）は、原因の種類のみ記録し、内容は記録しない。

## 7. 回数制限

| 対象 API | 単位 | しきい値（初期値） | 超えた場合 | キー（TableSpec_Auth.md 4.1） |
|---|---|---|---|---|
| #32 送信 | 家族 | 600 回／1 時間 | `429 RATE_LIMITED` | `testdata:submit:family:<家族 ID>` |
| #35 ダウンロード | 家族 | 30 回／1 時間 | `429 RATE_LIMITED` | `testdata:export:family:<家族 ID>` |
| O25 ダウンロード | 組織 | 30 回／1 時間 | `429 RATE_LIMITED` | `testdata:export:org:<組織 ID>` |

- しきい値は初期値とし、利用状況を見て調整する。端末内の古い記録を移すときに、多数のセッションを続けて送る場合があるため、#32 は緩めにしている。
- 超えた場合は `Retry-After` ヘッダに、カウンターの有効期限が切れるまでの秒数を付ける。
- 一覧・詳細の参照（#33・#34・O22〜O24）には、回数制限を設けない。

## 8. 未決事項

- ダウンロードの上限（初期値 5,000 件。`AppConfig.json` で変更できる）の適切な値と、`from`・`to` の最大の範囲。
- 各 `summary` の件数の定義。実装時に、現在のクライアントの `reports.js` と突き合わせて確定する。
- ZIP を出力しながら作る方法（ライブラリの選定。PHP の `ZipArchive` は一時ファイルを使う）。
- 利用データの一括削除（ユーザごと・期間ごと）を API にするか。
- O22 のユーザ一覧のページングと、並び順（ユーザ名順、最終データの日時順など）。
- 組織が、所属している家族の ID を参照できてよいか（ApiSpec_Organization.md 10.）。現在は、家族の ID を返さない。
- クライアントが、複数の端末で同じセッションを送った場合の扱い（`sessionId` が同じなら 1 件になる）。
- 利用データの保存期間（TableSpec_TestData.md 11.）。
