<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use UecTst\Tests\Support\TestClient;

/** 組織の管理（O17〜O21）。運用担当者の組織だけが実行できる。 */
final class OrgAdminTest extends OrgApiTestCase
{
    private function superClient(): TestClient
    {
        $this->createOrganization('運用担当者', 'operator', isSuper: true);
        $c = $this->client('203.0.113.10');
        $this->loginSuperWithPasskey($c);
        return $c;
    }

    public function testNormalOrganizationCannotUseAdminApis(): void
    {
        $id = $this->idString($this->createOrganization('A大学', 'example-univ'));
        $c = $this->client();
        $this->orgLogin($c, 'example-univ');
        $this->orgElevate($c);
        $this->assertError($c->get('/api/v1/org/organizations'), 403, 'SUPER_ONLY');
        $this->assertError($c->post('/api/v1/org/organizations', ['name' => 'B大学', 'loginId' => 'b-univ']), 403, 'SUPER_ONLY');
        $this->assertError($c->patch("/api/v1/org/organizations/{$id}", ['name' => 'C']), 403, 'SUPER_ONLY');
        $this->assertError($c->post("/api/v1/org/organizations/{$id}/password-reset"), 403, 'SUPER_ONLY');
        $this->assertError($c->delete("/api/v1/org/organizations/{$id}"), 403, 'SUPER_ONLY');
    }

    public function testCreateIssuesAnInitialPasswordThatMustBeChanged(): void
    {
        $super = $this->superClient();
        $r = $super->post('/api/v1/org/organizations', ['name' => '  ○○大学  ', 'loginId' => 'Example-Univ']);
        $this->assertSame(201, $r->status(), $r->body());
        $json = $r->json();
        $this->assertSame('○○大学', $json['organization']['name']);
        $this->assertSame('example-univ', $json['organization']['loginId']);
        $this->assertFalse($json['organization']['isSuper']);
        $this->assertTrue($json['organization']['passwordChangeRequired']);

        // 紛らわしい文字（0・O・1・l・I）を除いた、16文字。
        $this->assertMatchesRegularExpression('/^[A-HJ-NP-Za-km-z2-9]{16}$/', $json['initialPassword']);
        // 保存されているのは、ハッシュだけ。
        $stored = $this->pdo->query("SELECT password_hash FROM organizations WHERE login_id = 'example-univ'")->fetchColumn();
        $this->assertStringStartsWith('$argon2id$', (string) $stored);
        $this->assertStringNotContainsString($json['initialPassword'], (string) file_get_contents($this->logFile));

        // 初期パスワードでログインでき、パスワードを変更するまでは、ほかの操作はできない。
        $org = $this->client();
        $login = $this->orgLogin($org, 'example-univ', $json['initialPassword']);
        $this->assertSame(1, $login['authStage']);
        $this->assertError($org->get('/api/v1/org/members'), 403, 'PASSWORD_CHANGE_REQUIRED');
        $this->assertSame(204, $org->put('/api/v1/org/password', ['currentPassword' => $json['initialPassword'], 'newPassword' => 'my-own-new-passphrase'])->status());
        $this->assertSame(200, $org->get('/api/v1/org/members')->status());
    }

    public function testInitialPasswordsAreDifferentEachTime(): void
    {
        $super = $this->superClient();
        $a = $super->post('/api/v1/org/organizations', ['name' => 'A', 'loginId' => 'org-aaaa'])->json()['initialPassword'];
        $b = $super->post('/api/v1/org/organizations', ['name' => 'B', 'loginId' => 'org-bbbb'])->json()['initialPassword'];
        $this->assertNotSame($a, $b);
    }

    public function testCreateValidationAndDuplicates(): void
    {
        $super = $this->superClient();
        $this->assertSame(201, $super->post('/api/v1/org/organizations', ['name' => '○○大学', 'loginId' => 'example-univ'])->status());

        $this->assertError($super->post('/api/v1/org/organizations', ['name' => '別の名前', 'loginId' => 'EXAMPLE-univ']), 409, 'DUPLICATE_LOGIN_ID');
        $this->assertError($super->post('/api/v1/org/organizations', ['name' => '○○大学', 'loginId' => 'other-login']), 409, 'DUPLICATE_ORGANIZATION_NAME');
        // 運用担当者の組織と同じ名前・ログインIDも使えない。
        $this->assertError($super->post('/api/v1/org/organizations', ['name' => '運用担当者', 'loginId' => 'unique-login']), 409, 'DUPLICATE_ORGANIZATION_NAME');
        $this->assertError($super->post('/api/v1/org/organizations', ['name' => '新しい名前', 'loginId' => 'operator']), 409, 'DUPLICATE_LOGIN_ID');

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
            $r = $super->post('/api/v1/org/organizations', $body);
            $this->assertError($r, 422, 'VALIDATION_FAILED');
            $this->assertContains(['field' => $field, 'code' => $code], $r->json()['error']['details'], json_encode($body, JSON_UNESCAPED_UNICODE));
        }
        // 境界値（名前100文字、ログインID 4文字と64文字）は受け付ける。
        $this->assertSame(201, $super->post('/api/v1/org/organizations', ['name' => str_repeat('あ', 100), 'loginId' => 'a.b-'])->status());
        $this->assertSame(201, $super->post('/api/v1/org/organizations', ['name' => 'OK64', 'loginId' => str_repeat('a', 64)])->status());
        $this->assertError($super->post('/api/v1/org/organizations', ['name' => 'x']), 400, 'BAD_REQUEST');
    }

    public function testListShowsMemberCountsNewestFirstIncludingTheSuperOrganization(): void
    {
        $super = $this->superClient();
        $this->clock->advance('+1 hour');
        $old = $super->post('/api/v1/org/organizations', ['name' => '古い組織', 'loginId' => 'old-org'])->json();
        $this->clock->advance('+1 hour');
        $super->post('/api/v1/org/organizations', ['name' => '新しい組織', 'loginId' => 'new-org']);

        // 古い組織に、家族を2つ所属させる。
        $org = $this->client();
        $this->orgLogin($org, 'old-org', $old['initialPassword']);
        $org->put('/api/v1/org/password', ['currentPassword' => $old['initialPassword'], 'newPassword' => 'my-own-new-passphrase']);
        $this->registerFamilyInto($org, $this->client('203.0.113.60'));
        $this->registerFamilyInto($org, $this->client('203.0.113.61'));

        $list = $super->get('/api/v1/org/organizations')->json()['organizations'];
        $this->assertSame(['新しい組織', '古い組織', '運用担当者'], array_column($list, 'name'));
        $this->assertSame([0, 2, 0], array_column($list, 'memberFamilyCount'));
        $this->assertSame([false, false, true], array_column($list, 'isSuper'));
        $this->assertSame(['id', 'name', 'nameKana', 'loginId', 'isSuper', 'memberFamilyCount', 'createdAt'], array_keys($list[0]));
    }

    public function testNameKanaIsNormalizedValidatedAndChangeable(): void
    {
        $super = $this->superClient();
        // カタカナ・全角英数・全角空白は、ひらがな・半角に正規化して保存する。重複してもよい。省略は未登録。
        $r = $super->post('/api/v1/org/organizations', ['name' => 'A大学', 'nameKana' => ' エーダイガク　ＡＢ１ ', 'loginId' => 'a-univ']);
        $this->assertSame(201, $r->status(), $r->body());
        $a = $r->json()['organization']['id'];
        $this->assertSame('えーだいがく ab1', $r->json()['organization']['nameKana']);
        $this->assertSame(201, $super->post('/api/v1/org/organizations', ['name' => 'B大学', 'nameKana' => 'えーだいがく ab1', 'loginId' => 'b-univ'])->status());
        $c = $super->post('/api/v1/org/organizations', ['name' => 'C大学', 'loginId' => 'c-univ']);
        $this->assertNull($c->json()['organization']['nameKana']);
        $this->assertSame(201, $super->post('/api/v1/org/organizations', ['name' => 'D大学', 'nameKana' => '   ', 'loginId' => 'd-univ'])->status());

        // 漢字・記号・長すぎる読み仮名は拒否する。
        $this->assertError($super->post('/api/v1/org/organizations', ['name' => 'E大学', 'nameKana' => '電通大', 'loginId' => 'e-univ']), 422, 'VALIDATION_FAILED');
        $this->assertError($super->post('/api/v1/org/organizations', ['name' => 'E大学', 'nameKana' => 'あ!', 'loginId' => 'e-univ']), 422, 'VALIDATION_FAILED');
        $this->assertError($super->post('/api/v1/org/organizations', ['name' => 'E大学', 'nameKana' => str_repeat('あ', 101), 'loginId' => 'e-univ']), 422, 'VALIDATION_FAILED');
        $this->assertError($super->post('/api/v1/org/organizations', ['name' => 'E大学', 'nameKana' => 5, 'loginId' => 'e-univ']), 400, 'BAD_REQUEST');

        // 読み仮名だけの変更では、組織名は変わらない。
        $r = $super->patch("/api/v1/org/organizations/{$a}", ['nameKana' => 'エイ']);
        $this->assertSame(200, $r->status(), $r->body());
        $this->assertSame('A大学', $r->json()['organization']['name']);
        $this->assertSame('えい', $r->json()['organization']['nameKana']);
        // 組織名だけの変更では、読み仮名は変わらない。
        $r = $super->patch("/api/v1/org/organizations/{$a}", ['name' => 'A大学院']);
        $this->assertSame('えい', $r->json()['organization']['nameKana']);
        $this->assertError($super->patch("/api/v1/org/organizations/{$a}", ['nameKana' => '漢字']), 422, 'VALIDATION_FAILED');
        // 空文字・null で、未登録に戻す。
        $this->assertNull($super->patch("/api/v1/org/organizations/{$a}", ['nameKana' => ''])->json()['organization']['nameKana']);
        $super->patch("/api/v1/org/organizations/{$a}", ['nameKana' => 'えい']);
        $this->assertNull($super->patch("/api/v1/org/organizations/{$a}", ['nameKana' => null])->json()['organization']['nameKana']);

        $kanas = array_column($super->get('/api/v1/org/organizations')->json()['organizations'], 'nameKana', 'name');
        $this->assertSame('えーだいがく ab1', $kanas['B大学']);
        $this->assertNull($kanas['運用担当者']);
    }

    public function testRenameAndItsErrors(): void
    {
        $super = $this->superClient();
        $a = $super->post('/api/v1/org/organizations', ['name' => 'A大学', 'loginId' => 'a-univ'])->json()['organization']['id'];
        $super->post('/api/v1/org/organizations', ['name' => 'B大学', 'loginId' => 'b-univ']);

        $r = $super->patch("/api/v1/org/organizations/{$a}", ['name' => ' A大学 情報学部 ']);
        $this->assertSame(200, $r->status(), $r->body());
        $this->assertSame('A大学 情報学部', $r->json()['organization']['name']);
        $this->assertSame('a-univ', $r->json()['organization']['loginId']);
        // 自分自身と同じ名前への変更は、重複にならない。
        $this->assertSame(200, $super->patch("/api/v1/org/organizations/{$a}", ['name' => 'A大学 情報学部'])->status());

        $this->assertError($super->patch("/api/v1/org/organizations/{$a}", ['name' => 'B大学']), 409, 'DUPLICATE_ORGANIZATION_NAME');
        $this->assertError($super->patch("/api/v1/org/organizations/{$a}", ['name' => '運用担当者']), 409, 'DUPLICATE_ORGANIZATION_NAME');
        $this->assertError($super->patch("/api/v1/org/organizations/{$a}", ['name' => '  ']), 422, 'VALIDATION_FAILED');
        $this->assertError($super->patch('/api/v1/org/organizations/' . $this->idString(random_bytes(16)), ['name' => 'X']), 404, 'NOT_FOUND');
        $this->assertError($super->patch('/api/v1/org/organizations/bad-id', ['name' => 'X']), 404, 'NOT_FOUND');
        $this->assertError($super->patch("/api/v1/org/organizations/{$a}", []), 400, 'BAD_REQUEST');

        $superId = $super->get('/api/v1/org/sessions/current')->json()['organization']['id'];
        $this->assertError($super->patch("/api/v1/org/organizations/{$superId}", ['name' => '改名']), 409, 'SUPER_ORGANIZATION_PROTECTED');
    }

    public function testRenameIsReflectedInTheInvitationPage(): void
    {
        $super = $this->superClient();
        $created = $super->post('/api/v1/org/organizations', ['name' => '旧名称', 'loginId' => 'a-univ'])->json();
        $org = $this->client();
        $this->orgLogin($org, 'a-univ', $created['initialPassword']);
        $org->put('/api/v1/org/password', ['currentPassword' => $created['initialPassword'], 'newPassword' => 'my-own-new-passphrase']);
        $org->post('/api/v1/org/invitations', ['email' => 'x@example.com']);
        $token = $this->mailer->lastInvitationToken();

        $super->patch('/api/v1/org/organizations/' . $created['organization']['id'], ['name' => '新名称']);
        $this->assertSame('新名称', $this->client()->post('/api/v1/invitations/verify', ['token' => $token])->json()['organizationName']);
    }

    public function testPasswordResetRequiresElevationAndEndsAllSessions(): void
    {
        $super = $this->superClient();
        $created = $super->post('/api/v1/org/organizations', ['name' => 'A大学', 'loginId' => 'a-univ'])->json();
        $id = $created['organization']['id'];
        $org = $this->client();
        $this->orgLogin($org, 'a-univ', $created['initialPassword']);
        $org->put('/api/v1/org/password', ['currentPassword' => $created['initialPassword'], 'newPassword' => 'my-own-new-passphrase']);
        $this->assertSame(200, $org->get('/api/v1/org/members')->status());
        // ロックされていても、再発行で解除される。
        for ($i = 0; $i < 5; $i++) {
            $this->client('203.0.113.7')->post('/api/v1/org/sessions', ['loginId' => 'a-univ', 'password' => 'wrong-password-123']);
        }

        // 確認が切れていれば、対象が存在するかどうかより先に、403 になる。
        $this->orgElevate($super);
        $this->clock->advance('+6 minutes');
        $this->assertError($super->post("/api/v1/org/organizations/{$id}/password-reset"), 403, 'ELEVATION_REQUIRED');
        $this->assertError($super->post('/api/v1/org/organizations/' . $this->idString(random_bytes(16)) . '/password-reset'), 403, 'ELEVATION_REQUIRED');
        $this->orgElevate($super);

        $reset = $super->post("/api/v1/org/organizations/{$id}/password-reset");
        $this->assertSame(200, $reset->status(), $reset->body());
        $new = $reset->json()['initialPassword'];
        $this->assertMatchesRegularExpression('/^[A-HJ-NP-Za-km-z2-9]{16}$/', $new);

        // 既存のセッションはすべて終了し、古いパスワードは使えず、新しい初期パスワードでの最初のログインは、変更が必要。
        $this->assertError($org->get('/api/v1/org/members'), 401, 'UNAUTHENTICATED');
        $this->assertError($this->client()->post('/api/v1/org/sessions', ['loginId' => 'a-univ', 'password' => 'my-own-new-passphrase']), 401, 'INVALID_CREDENTIALS');
        $again = $this->client();
        $login = $this->orgLogin($again, 'a-univ', $new);
        $this->assertTrue($login['organization']['passwordChangeRequired']);
        $this->assertError($again->get('/api/v1/org/members'), 403, 'PASSWORD_CHANGE_REQUIRED');
        $this->assertStringNotContainsString($new, (string) file_get_contents($this->logFile));
    }

    public function testPasswordResetErrors(): void
    {
        $super = $this->superClient();
        $this->orgElevate($super);
        $superId = $super->get('/api/v1/org/sessions/current')->json()['organization']['id'];
        $this->assertError($super->post("/api/v1/org/organizations/{$superId}/password-reset"), 409, 'SUPER_ORGANIZATION_PROTECTED');
        $this->assertError($super->post('/api/v1/org/organizations/' . $this->idString(random_bytes(16)) . '/password-reset'), 404, 'NOT_FOUND');
        $this->assertError($super->post('/api/v1/org/organizations/zzz/password-reset'), 404, 'NOT_FOUND');
    }

    public function testDeleteReleasesFamiliesAndRemovesEverythingOfTheOrganization(): void
    {
        $super = $this->superClient();
        $created = $super->post('/api/v1/org/organizations', ['name' => 'A大学', 'loginId' => 'a-univ'])->json();
        $id = $created['organization']['id'];
        $org = $this->client();
        $this->orgLogin($org, 'a-univ', $created['initialPassword']);
        $org->put('/api/v1/org/password', ['currentPassword' => $created['initialPassword'], 'newPassword' => 'my-own-new-passphrase']);
        $family1 = $this->client('203.0.113.60');
        $family2 = $this->client('203.0.113.61');
        $this->registerFamilyInto($org, $family1);
        $this->registerFamilyInto($org, $family2);
        $org->post('/api/v1/org/invitations', ['email' => 'pending@example.com']);
        $pendingToken = $this->mailer->lastInvitationToken();
        $users = (int) $this->pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();

        $this->assertError($super->delete("/api/v1/org/organizations/{$id}"), 403, 'ELEVATION_REQUIRED');
        $this->orgElevate($super);
        $deleted = $super->delete("/api/v1/org/organizations/{$id}");
        $this->assertSame(200, $deleted->status(), $deleted->body());
        $this->assertSame(['releasedFamilyCount' => 2], $deleted->json());

        // 家族は個人ユーザになり（所属日時も消える）、家族・ユーザは削除されない。
        $this->assertNull($family1->get('/api/v1/organization-membership')->json()['organization']);
        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM families WHERE organization_id IS NOT NULL OR organization_joined_at IS NOT NULL')->fetchColumn());
        $this->assertSame(2, (int) $this->pdo->query('SELECT COUNT(*) FROM families')->fetchColumn());
        $this->assertSame($users, (int) $this->pdo->query('SELECT COUNT(*) FROM users')->fetchColumn());
        // セッション・招待は削除され、ログインもできない。
        $this->assertError($org->get('/api/v1/org/members'), 401, 'UNAUTHENTICATED');
        $this->assertError($this->client()->post('/api/v1/invitations/verify', ['token' => $pendingToken]), 410, 'INVITATION_INVALID');
        $this->assertError($this->client()->post('/api/v1/org/sessions', ['loginId' => 'a-univ', 'password' => 'my-own-new-passphrase']), 401, 'INVALID_CREDENTIALS');
        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM organization_invitations')->fetchColumn());
        $this->assertCount(1, $super->get('/api/v1/org/organizations')->json()['organizations']);
    }

    public function testDeleteErrors(): void
    {
        $super = $this->superClient();
        $this->orgElevate($super);
        $superId = $super->get('/api/v1/org/sessions/current')->json()['organization']['id'];
        $this->assertError($super->delete("/api/v1/org/organizations/{$superId}"), 409, 'SUPER_ORGANIZATION_PROTECTED');
        $this->assertError($super->delete('/api/v1/org/organizations/' . $this->idString(random_bytes(16))), 404, 'NOT_FOUND');
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM organizations WHERE is_super = 1')->fetchColumn());
    }

    public function testOperationsAreLoggedWithoutPasswords(): void
    {
        $super = $this->superClient();
        $created = $super->post('/api/v1/org/organizations', ['name' => 'A大学', 'loginId' => 'a-univ'])->json();
        $this->orgElevate($super);
        $super->post('/api/v1/org/organizations/' . $created['organization']['id'] . '/password-reset');
        $super->delete('/api/v1/org/organizations/' . $created['organization']['id']);

        $log = (string) file_get_contents($this->logFile);
        foreach (['org.passkey.register', 'org.organization.create', 'org.password.reset', 'org.organization.delete'] as $action) {
            $this->assertStringContainsString($action, $log);
        }
        $this->assertStringNotContainsString($created['initialPassword'], $log);
        $this->assertStringNotContainsString(self::PASSWORD, $log);
    }
}
