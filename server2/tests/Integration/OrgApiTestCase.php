<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use UecTst\Db\Uuid7;
use UecTst\Support\Time;
use UecTst\Tests\Support\SoftwareAuthenticator;
use UecTst\Tests\Support\TestClient;

/** 運用担当者・組織の API（ApiSpec_Organization.md）の結合テストの土台。 */
abstract class OrgApiTestCase extends ApiTestCase
{
    public const PASSWORD = 'correct-horse-battery';

    /**
     * 組織を、データベースに直接作る（運用担当者の組織は、運用担当者が SQL で作るため。TableSpec_Organization.md 7.）。
     *
     * @return string 組織の ID（バイナリ）
     */
    protected function createOrganization(string $name, string $loginId, bool $isSuper = false, bool $changeRequired = false, string $password = self::PASSWORD): string
    {
        $id = Uuid7::generateBinary();
        $this->pdo->prepare(
            'INSERT INTO organizations (id, name, login_id, password_hash, password_change_required, is_super, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )->execute([
            $id, $name, $loginId, $this->services->orgPasswords->hash($password), $changeRequired ? 1 : 0, $isSuper ? 1 : 0,
            Time::toDb($this->clock->now()), Time::toDb($this->clock->now()),
        ]);
        return $id;
    }

    /** ログインする（成功を確認する）。 */
    protected function orgLogin(TestClient $client, string $loginId, string $password = self::PASSWORD): array
    {
        $response = $client->post('/api/v1/org/sessions', ['loginId' => $loginId, 'password' => $password]);
        $this->assertSame(201, $response->status(), $response->body());
        return $response->json();
    }

    /** パスワードを再入力して、破壊的な操作の確認を済ませる。 */
    protected function orgElevate(TestClient $client, string $password = self::PASSWORD): void
    {
        $response = $client->post('/api/v1/org/elevation', ['password' => $password]);
        $this->assertSame(200, $response->status(), $response->body());
    }

    /** 運用担当者の組織で、パスキーを登録済みにして、ログイン完了（段階1）の状態にする。認証器を返す。 */
    protected function loginSuperWithPasskey(TestClient $client, string $loginId = 'operator'): SoftwareAuthenticator
    {
        $login = $this->orgLogin($client, $loginId);
        $this->assertSame(0, $login['authStage']);
        $auth = new SoftwareAuthenticator($this->services->config->webauthnRpId);
        $this->registerOrgPasskey($client, $auth);
        return $auth;
    }

    /** 段階0で最初のパスキーを登録する、または、段階1（確認済み）でパスキーを追加する。 */
    protected function registerOrgPasskey(TestClient $client, SoftwareAuthenticator $auth): array
    {
        $options = $client->post('/api/v1/org/passkeys/registration-options');
        $this->assertSame(200, $options->status(), $options->body());
        $response = $client->post('/api/v1/org/passkeys', ['credential' => $auth->create($options->json())]);
        $this->assertSame(201, $response->status(), $response->body());
        return $response->json();
    }

    /** パスワード → パスキーの順で、運用担当者の組織でログインする。 */
    protected function loginSuperAgain(TestClient $client, SoftwareAuthenticator $auth, string $loginId = 'operator'): void
    {
        $login = $this->orgLogin($client, $loginId);
        $this->assertSame(0, $login['authStage']);
        $this->assertTrue($login['passkeyRegistered']);
        $options = $client->post('/api/v1/org/sessions/passkey-options');
        $this->assertSame(200, $options->status(), $options->body());
        $done = $client->post('/api/v1/org/sessions/passkey', ['passkey' => $auth->get($options->json())]);
        $this->assertSame(200, $done->status(), $done->body());
    }

    /** 家族を登録し、組織の招待経由で所属させる（招待経由の本登録）。 */
    protected function registerFamilyInto(TestClient $orgClient, TestClient $familyClient, array $names = ['おとうさん']): array
    {
        $send = $orgClient->post('/api/v1/org/invitations', ['email' => 'invitee@example.com']);
        $this->assertSame(202, $send->status(), $send->body());
        $complete = $familyClient->post('/api/v1/registrations/complete', [
            'invitationToken' => $this->mailer->lastInvitationToken(),
            'users' => array_map(static fn (string $n): array => ['name' => $n], $names),
        ]);
        $this->assertSame(201, $complete->status(), $complete->body());
        return $complete->json();
    }

    protected function idString(string $binary): string
    {
        return Uuid7::toString($binary);
    }
}
