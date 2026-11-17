<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use UecTst\Tests\Support\TestClient;

/** 所属の管理（B17〜B21）。運用担当者の所属だけが実行できる。 */
final class BlgAdminTest extends BlgApiTestCase
{
    private function superClient(): TestClient
    {
        $this->createBelonging('運用担当者', 'operator', isSuper: true);
        $c = $this->client('203.0.113.10');
        $this->loginSuperWithPasskey($c);
        return $c;
    }

    public function testNormalBelongingCannotUseAdminApis(): void
    {
        $id = $this->idString($this->createBelonging('A大学', 'example-univ'));
        $c = $this->client();
        $this->blgLogin($c, 'example-univ');
        $this->blgElevate($c);
        $this->assertError($c->get('/api/v1/blg/belongings'), 403, 'SUPER_ONLY');
        $this->assertError($c->post('/api/v1/blg/belongings', ['name' => 'B大学', 'loginId' => 'b-univ']), 403, 'SUPER_ONLY');
        $this->assertError($c->patch("/api/v1/blg/belongings/{$id}", ['name' => 'C']), 403, 'SUPER_ONLY');
        $this->assertError($c->post("/api/v1/blg/belongings/{$id}/password-reset"), 403, 'SUPER_ONLY');
        $this->assertError($c->delete("/api/v1/blg/belongings/{$id}"), 403, 'SUPER_ONLY');
    }

    public function testCreateIssuesAnInitialPasswordThatMustBeChanged(): void
    {
        $super = $this->superClient();
        $r = $super->post('/api/v1/blg/belongings', ['name' => '  ○○大学  ', 'loginId' => 'Example-Univ']);
        $this->assertSame(201, $r->status(), $r->body());
        $json = $r->json();
        $this->assertSame('○○大学', $json['belonging']['name']);
        $this->assertSame('example-univ', $json['belonging']['loginId']);
        $this->assertFalse($json['belonging']['isSuper']);
        $this->assertTrue($json['belonging']['passwordChangeRequired']);

        // 紛らわしい文字（0・O・1・l・I）を除いた、16文字。
        $this->assertMatchesRegularExpression('/^[A-HJ-NP-Za-km-z2-9]{16}$/', $json['initialPassword']);
        // 保存されているのは、ハッシュだけ。
        $stored = $this->pdo->query("SELECT password_hash FROM belongings WHERE login_id = 'example-univ'")->fetchColumn();
        $this->assertStringStartsWith('$argon2id$', (string) $stored);
        $this->assertStringNotContainsString($json['initialPassword'], (string) file_get_contents($this->logFile));

        // 初期パスワードでログインでき、パスワードを変更するまでは、ほかの操作はできない。
        $blg = $this->client();
        $login = $this->blgLogin($blg, 'example-univ', $json['initialPassword']);
        $this->assertSame(1, $login['authStage']);
        $this->assertError($blg->get('/api/v1/blg/members'), 403, 'PASSWORD_CHANGE_REQUIRED');
        $this->assertSame(204, $blg->put('/api/v1/blg/password', ['currentPassword' => $json['initialPassword'], 'newPassword' => 'my-own-new-passphrase'])->status());
        $this->assertSame(200, $blg->get('/api/v1/blg/members')->status());
    }

    public function testInitialPasswordsAreDifferentEachTime(): void
    {
        $super = $this->superClient();
        $a = $super->post('/api/v1/blg/belongings', ['name' => 'A', 'loginId' => 'blg-aaaa'])->json()['initialPassword'];
        $b = $super->post('/api/v1/blg/belongings', ['name' => 'B', 'loginId' => 'blg-bbbb'])->json()['initialPassword'];
        $this->assertNotSame($a, $b);
    }

    public function testCreateValidationAndDuplicates(): void
    {
        $super = $this->superClient();
        $this->assertSame(201, $super->post('/api/v1/blg/belongings', ['name' => '○○大学', 'loginId' => 'example-univ'])->status());

        $this->assertError($super->post('/api/v1/blg/belongings', ['name' => '別の名前', 'loginId' => 'EXAMPLE-univ']), 409, 'DUPLICATE_LOGIN_ID');
        $this->assertError($super->post('/api/v1/blg/belongings', ['name' => '○○大学', 'loginId' => 'other-login']), 409, 'DUPLICATE_BELONGING_NAME');
        // 運用担当者の所属と同じ名前・ログインIDも使えない。
        $this->assertError($super->post('/api/v1/blg/belongings', ['name' => '運用担当者', 'loginId' => 'unique-login']), 409, 'DUPLICATE_BELONGING_NAME');
        $this->assertError($super->post('/api/v1/blg/belongings', ['name' => '新しい名前', 'loginId' => 'operator']), 409, 'DUPLICATE_LOGIN_ID');

        $cases = [
            [['name' => '', 'loginId' => 'valid-id'], 'name', 'REQUIRED'],
            [['name' => '   ', 'loginId' => 'valid-id'], 'name', 'REQUIRED'],
            [['name' => str_repeat('あ', 101), 'loginId' => 'valid-id'], 'name', 'TOO_LONG'],
            [['name' => "改行\nあり", 'loginId' => 'valid-id'], 'name', 'INVALID_CHARACTER'],
            [['name' => 'OK', 'loginId' => 'abc'], 'loginId', 'TOO_SHORT'],
            [['name' => 'OK', 'loginId' => str_repeat('a', 65)], 'loginId', 'TOO_LONG'],
            [['name' => 'OK', 'loginId' => 'has space'], 'loginId', 'INVALID_CHARACTER'],
            [['name' => 'OK', 'loginId' => 'ユーザー名です'], 'loginId', 'INVALID_CHARACTER'],
            [['name' => 'OK', 'loginId' => 'a@b.example'], 'loginId', 'INVALID_CHARACTER'],
        ];
        foreach ($cases as [$body, $field, $code]) {
            $r = $super->post('/api/v1/blg/belongings', $body);
            $this->assertError($r, 422, 'VALIDATION_FAILED');
            $this->assertContains(['field' => $field, 'code' => $code], $r->json()['error']['details'], json_encode($body, JSON_UNESCAPED_UNICODE));
        }
        // 境界値（名前100文字、ログインID 4文字と64文字）は受け付ける。
        $this->assertSame(201, $super->post('/api/v1/blg/belongings', ['name' => str_repeat('あ', 100), 'loginId' => 'a.b-'])->status());
        $this->assertSame(201, $super->post('/api/v1/blg/belongings', ['name' => 'OK64', 'loginId' => str_repeat('a', 64)])->status());
        $this->assertError($super->post('/api/v1/blg/belongings', ['name' => 'x']), 400, 'BAD_REQUEST');
    }

    public function testListShowsMemberCountsNewestFirstIncludingTheSuperBelonging(): void
    {
        $super = $this->superClient();
        $this->clock->advance('+1 hour');
        $old = $super->post('/api/v1/blg/belongings', ['name' => '古い所属', 'loginId' => 'old-blg'])->json();
        $this->clock->advance('+1 hour');
        $super->post('/api/v1/blg/belongings', ['name' => '新しい所属', 'loginId' => 'new-blg']);

        // 古い所属に、家族を2つ所属させる。
        $blg = $this->client();
        $this->blgLogin($blg, 'old-blg', $old['initialPassword']);
        $blg->put('/api/v1/blg/password', ['currentPassword' => $old['initialPassword'], 'newPassword' => 'my-own-new-passphrase']);
        $this->registerFamilyInto($blg, $this->client('203.0.113.60'));
        $this->registerFamilyInto($blg, $this->client('203.0.113.61'));

        $list = $super->get('/api/v1/blg/belongings')->json()['belongings'];
        $this->assertSame(['新しい所属', '古い所属', '運用担当者'], array_column($list, 'name'));
        $this->assertSame([0, 2, 0], array_column($list, 'memberFamilyCount'));
        $this->assertSame([false, false, true], array_column($list, 'isSuper'));
        $this->assertSame(['id', 'name', 'nameKana', 'loginId', 'isSuper', 'memberFamilyCount', 'createdAt'], array_keys($list[0]));
    }

    public function testNameKanaIsNormalizedValidatedAndChangeable(): void
    {
        $super = $this->superClient();
        // カタカナ・全角英数・全角空白は、ひらがな・半角に正規化して保存する。重複してもよい。省略は未登録。
        $r = $super->post('/api/v1/blg/belongings', ['name' => 'A大学', 'nameKana' => ' エーダイガク　ＡＢ１ ', 'loginId' => 'a-univ']);
        $this->assertSame(201, $r->status(), $r->body());
        $a = $r->json()['belonging']['id'];
        $this->assertSame('えーだいがく ab1', $r->json()['belonging']['nameKana']);
        $this->assertSame(201, $super->post('/api/v1/blg/belongings', ['name' => 'B大学', 'nameKana' => 'えーだいがく ab1', 'loginId' => 'b-univ'])->status());
        $c = $super->post('/api/v1/blg/belongings', ['name' => 'C大学', 'loginId' => 'c-univ']);
        $this->assertNull($c->json()['belonging']['nameKana']);
        $this->assertSame(201, $super->post('/api/v1/blg/belongings', ['name' => 'D大学', 'nameKana' => '   ', 'loginId' => 'd-univ'])->status());

        // 漢字・記号・長すぎる読み仮名は拒否する。
        $this->assertError($super->post('/api/v1/blg/belongings', ['name' => 'E大学', 'nameKana' => '電通大', 'loginId' => 'e-univ']), 422, 'VALIDATION_FAILED');
        $this->assertError($super->post('/api/v1/blg/belongings', ['name' => 'E大学', 'nameKana' => 'あ!', 'loginId' => 'e-univ']), 422, 'VALIDATION_FAILED');
        $this->assertError($super->post('/api/v1/blg/belongings', ['name' => 'E大学', 'nameKana' => str_repeat('あ', 101), 'loginId' => 'e-univ']), 422, 'VALIDATION_FAILED');
        $this->assertError($super->post('/api/v1/blg/belongings', ['name' => 'E大学', 'nameKana' => 5, 'loginId' => 'e-univ']), 400, 'BAD_REQUEST');

        // 読み仮名だけの変更では、所属名は変わらない。
        $r = $super->patch("/api/v1/blg/belongings/{$a}", ['nameKana' => 'エイ']);
        $this->assertSame(200, $r->status(), $r->body());
        $this->assertSame('A大学', $r->json()['belonging']['name']);
        $this->assertSame('えい', $r->json()['belonging']['nameKana']);
        // 所属名だけの変更では、読み仮名は変わらない。
        $r = $super->patch("/api/v1/blg/belongings/{$a}", ['name' => 'A大学院']);
        $this->assertSame('えい', $r->json()['belonging']['nameKana']);
        $this->assertError($super->patch("/api/v1/blg/belongings/{$a}", ['nameKana' => '漢字']), 422, 'VALIDATION_FAILED');
        // 空文字・null で、未登録に戻す。
        $this->assertNull($super->patch("/api/v1/blg/belongings/{$a}", ['nameKana' => ''])->json()['belonging']['nameKana']);
        $super->patch("/api/v1/blg/belongings/{$a}", ['nameKana' => 'えい']);
        $this->assertNull($super->patch("/api/v1/blg/belongings/{$a}", ['nameKana' => null])->json()['belonging']['nameKana']);

        $kanas = array_column($super->get('/api/v1/blg/belongings')->json()['belongings'], 'nameKana', 'name');
        $this->assertSame('えーだいがく ab1', $kanas['B大学']);
        $this->assertNull($kanas['運用担当者']);
    }

    public function testRenameAndItsErrors(): void
    {
        $super = $this->superClient();
        $a = $super->post('/api/v1/blg/belongings', ['name' => 'A大学', 'loginId' => 'a-univ'])->json()['belonging']['id'];
        $super->post('/api/v1/blg/belongings', ['name' => 'B大学', 'loginId' => 'b-univ']);

        $r = $super->patch("/api/v1/blg/belongings/{$a}", ['name' => ' A大学 情報学部 ']);
        $this->assertSame(200, $r->status(), $r->body());
        $this->assertSame('A大学 情報学部', $r->json()['belonging']['name']);
        $this->assertSame('a-univ', $r->json()['belonging']['loginId']);
        // 自分自身と同じ名前への変更は、重複にならない。
        $this->assertSame(200, $super->patch("/api/v1/blg/belongings/{$a}", ['name' => 'A大学 情報学部'])->status());

        $this->assertError($super->patch("/api/v1/blg/belongings/{$a}", ['name' => 'B大学']), 409, 'DUPLICATE_BELONGING_NAME');
        $this->assertError($super->patch("/api/v1/blg/belongings/{$a}", ['name' => '運用担当者']), 409, 'DUPLICATE_BELONGING_NAME');
        $this->assertError($super->patch("/api/v1/blg/belongings/{$a}", ['name' => '  ']), 422, 'VALIDATION_FAILED');
        $this->assertError($super->patch('/api/v1/blg/belongings/' . $this->idString(random_bytes(16)), ['name' => 'X']), 404, 'NOT_FOUND');
        $this->assertError($super->patch('/api/v1/blg/belongings/bad-id', ['name' => 'X']), 404, 'NOT_FOUND');
        $this->assertError($super->patch("/api/v1/blg/belongings/{$a}", []), 400, 'BAD_REQUEST');

        $superId = $super->get('/api/v1/blg/sessions/current')->json()['belonging']['id'];
        $this->assertError($super->patch("/api/v1/blg/belongings/{$superId}", ['name' => '改名']), 409, 'SUPER_BELONGING_PROTECTED');
    }

    public function testRenameIsReflectedInTheInvitationPage(): void
    {
        $super = $this->superClient();
        $created = $super->post('/api/v1/blg/belongings', ['name' => '旧名称', 'loginId' => 'a-univ'])->json();
        $blg = $this->client();
        $this->blgLogin($blg, 'a-univ', $created['initialPassword']);
        $blg->put('/api/v1/blg/password', ['currentPassword' => $created['initialPassword'], 'newPassword' => 'my-own-new-passphrase']);
        $blg->post('/api/v1/blg/invitations', ['email' => 'x@example.com']);
        $token = $this->mailer->lastInvitationToken();

        $super->patch('/api/v1/blg/belongings/' . $created['belonging']['id'], ['name' => '新名称']);
        $this->assertSame('新名称', $this->client()->post('/api/v1/invitations/verify', ['token' => $token])->json()['belongingName']);
    }

    public function testPasswordResetRequiresElevationAndEndsAllSessions(): void
    {
        $super = $this->superClient();
        $created = $super->post('/api/v1/blg/belongings', ['name' => 'A大学', 'loginId' => 'a-univ'])->json();
        $id = $created['belonging']['id'];
        $blg = $this->client();
        $this->blgLogin($blg, 'a-univ', $created['initialPassword']);
        $blg->put('/api/v1/blg/password', ['currentPassword' => $created['initialPassword'], 'newPassword' => 'my-own-new-passphrase']);
        $this->assertSame(200, $blg->get('/api/v1/blg/members')->status());
        // ロックされていても、再発行で解除される。
        for ($i = 0; $i < 5; $i++) {
            $this->client('203.0.113.7')->post('/api/v1/blg/sessions', ['loginId' => 'a-univ', 'password' => 'wrong-password-123']);
        }

        // 確認が切れていれば、対象が存在するかどうかより先に、403 になる。
        $this->blgElevate($super);
        $this->clock->advance('+6 minutes');
        $this->assertError($super->post("/api/v1/blg/belongings/{$id}/password-reset"), 403, 'ELEVATION_REQUIRED');
        $this->assertError($super->post('/api/v1/blg/belongings/' . $this->idString(random_bytes(16)) . '/password-reset'), 403, 'ELEVATION_REQUIRED');
        $this->blgElevate($super);

        $reset = $super->post("/api/v1/blg/belongings/{$id}/password-reset");
        $this->assertSame(200, $reset->status(), $reset->body());
        $new = $reset->json()['initialPassword'];
        $this->assertMatchesRegularExpression('/^[A-HJ-NP-Za-km-z2-9]{16}$/', $new);

        // 既存のセッションはすべて終了し、古いパスワードは使えず、新しい初期パスワードでの最初のログインは、変更が必要。
        $this->assertError($blg->get('/api/v1/blg/members'), 401, 'UNAUTHENTICATED');
        $this->assertError($this->client()->post('/api/v1/blg/sessions', ['loginId' => 'a-univ', 'password' => 'my-own-new-passphrase']), 401, 'INVALID_CREDENTIALS');
        $again = $this->client();
        $login = $this->blgLogin($again, 'a-univ', $new);
        $this->assertTrue($login['belonging']['passwordChangeRequired']);
        $this->assertError($again->get('/api/v1/blg/members'), 403, 'PASSWORD_CHANGE_REQUIRED');
        $this->assertStringNotContainsString($new, (string) file_get_contents($this->logFile));
    }

    public function testPasswordResetErrors(): void
    {
        $super = $this->superClient();
        $this->blgElevate($super);
        $superId = $super->get('/api/v1/blg/sessions/current')->json()['belonging']['id'];
        $this->assertError($super->post("/api/v1/blg/belongings/{$superId}/password-reset"), 409, 'SUPER_BELONGING_PROTECTED');
        $this->assertError($super->post('/api/v1/blg/belongings/' . $this->idString(random_bytes(16)) . '/password-reset'), 404, 'NOT_FOUND');
        $this->assertError($super->post('/api/v1/blg/belongings/zzz/password-reset'), 404, 'NOT_FOUND');
    }

    public function testDeleteReleasesFamiliesAndRemovesEverythingOfTheBelonging(): void
    {
        $super = $this->superClient();
        $created = $super->post('/api/v1/blg/belongings', ['name' => 'A大学', 'loginId' => 'a-univ'])->json();
        $id = $created['belonging']['id'];
        $blg = $this->client();
        $this->blgLogin($blg, 'a-univ', $created['initialPassword']);
        $blg->put('/api/v1/blg/password', ['currentPassword' => $created['initialPassword'], 'newPassword' => 'my-own-new-passphrase']);
        $family1 = $this->client('203.0.113.60');
        $family2 = $this->client('203.0.113.61');
        $this->registerFamilyInto($blg, $family1);
        $this->registerFamilyInto($blg, $family2);
        $blg->post('/api/v1/blg/invitations', ['email' => 'pending@example.com']);
        $pendingToken = $this->mailer->lastInvitationToken();
        $users = (int) $this->pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();

        $this->assertError($super->delete("/api/v1/blg/belongings/{$id}"), 403, 'ELEVATION_REQUIRED');
        $this->blgElevate($super);
        $deleted = $super->delete("/api/v1/blg/belongings/{$id}");
        $this->assertSame(200, $deleted->status(), $deleted->body());
        $this->assertSame(['releasedFamilyCount' => 2], $deleted->json());

        // 家族は個人ユーザになり（所属日時も消える）、家族・ユーザは削除されない。
        $this->assertNull($family1->get('/api/v1/belonging')->json()['belonging']);
        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM families WHERE belonging_id IS NOT NULL OR belonging_joined_at IS NOT NULL')->fetchColumn());
        $this->assertSame(2, (int) $this->pdo->query('SELECT COUNT(*) FROM families')->fetchColumn());
        $this->assertSame($users, (int) $this->pdo->query('SELECT COUNT(*) FROM users')->fetchColumn());
        // セッション・招待は削除され、ログインもできない。
        $this->assertError($blg->get('/api/v1/blg/members'), 401, 'UNAUTHENTICATED');
        $this->assertError($this->client()->post('/api/v1/invitations/verify', ['token' => $pendingToken]), 410, 'INVITATION_INVALID');
        $this->assertError($this->client()->post('/api/v1/blg/sessions', ['loginId' => 'a-univ', 'password' => 'my-own-new-passphrase']), 401, 'INVALID_CREDENTIALS');
        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM belonging_invitations')->fetchColumn());
        $this->assertCount(1, $super->get('/api/v1/blg/belongings')->json()['belongings']);
    }

    public function testDeleteErrors(): void
    {
        $super = $this->superClient();
        $this->blgElevate($super);
        $superId = $super->get('/api/v1/blg/sessions/current')->json()['belonging']['id'];
        $this->assertError($super->delete("/api/v1/blg/belongings/{$superId}"), 409, 'SUPER_BELONGING_PROTECTED');
        $this->assertError($super->delete('/api/v1/blg/belongings/' . $this->idString(random_bytes(16))), 404, 'NOT_FOUND');
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM belongings WHERE is_super = 1')->fetchColumn());
    }

    public function testOperationsAreLoggedWithoutPasswords(): void
    {
        $super = $this->superClient();
        $created = $super->post('/api/v1/blg/belongings', ['name' => 'A大学', 'loginId' => 'a-univ'])->json();
        $this->blgElevate($super);
        $super->post('/api/v1/blg/belongings/' . $created['belonging']['id'] . '/password-reset');
        $super->delete('/api/v1/blg/belongings/' . $created['belonging']['id']);

        $log = (string) file_get_contents($this->logFile);
        foreach (['blg.passkey.register', 'blg.belonging.create', 'blg.password.reset', 'blg.belonging.delete'] as $action) {
            $this->assertStringContainsString($action, $log);
        }
        $this->assertStringNotContainsString($created['initialPassword'], $log);
        $this->assertStringNotContainsString(self::PASSWORD, $log);
    }
}
