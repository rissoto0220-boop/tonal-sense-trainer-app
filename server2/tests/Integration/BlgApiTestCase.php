<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use UecTst\Db\Uuid7;
use UecTst\Support\Time;
use UecTst\Tests\Support\SoftwareAuthenticator;
use UecTst\Tests\Support\TestClient;

/** 運用担当者・所属の API（ApiSpec_Belonging.md）の結合テストの土台。 */
abstract class BlgApiTestCase extends ApiTestCase
{
    public const PASSWORD = 'correct-horse-battery';

    /**
     * 所属を、データベースに直接作る（運用担当者の所属は、運用担当者が SQL で作るため。TableSpec_Belonging.md 7.）。
     *
     * @return string 所属の ID（バイナリ）
     */
    protected function createBelonging(string $name, string $loginId, bool $isSuper = false, bool $changeRequired = false, string $password = self::PASSWORD): string
    {
        $id = Uuid7::generateBinary();
        $this->pdo->prepare(
            'INSERT INTO belongings (id, name, login_id, password_hash, password_change_required, is_super, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )->execute([
            $id, $name, $loginId, $this->services->blgPasswords->hash($password), $changeRequired ? 1 : 0, $isSuper ? 1 : 0,
            Time::toDb($this->clock->now()), Time::toDb($this->clock->now()),
        ]);
        return $id;
    }

    /** ログインする（成功を確認する）。 */
    protected function blgLogin(TestClient $client, string $loginId, string $password = self::PASSWORD): array
    {
        $response = $client->post('/api/v1/blg/sessions', ['loginId' => $loginId, 'password' => $password]);
        $this->assertSame(201, $response->status(), $response->body());
        return $response->json();
    }

    /** パスワードを再入力して、破壊的な操作の確認を済ませる。 */
    protected function blgElevate(TestClient $client, string $password = self::PASSWORD): void
    {
        $response = $client->post('/api/v1/blg/elevation', ['password' => $password]);
        $this->assertSame(200, $response->status(), $response->body());
    }

    /** 運用担当者の所属で、パスキーを登録済みにして、ログイン完了（段階1）の状態にする。認証器を返す。 */
    protected function loginSuperWithPasskey(TestClient $client, string $loginId = 'operator'): SoftwareAuthenticator
    {
        $login = $this->blgLogin($client, $loginId);
        $this->assertSame(0, $login['authStage']);
        $auth = new SoftwareAuthenticator($this->services->config->webauthnRpId);
        $this->registerBlgPasskey($client, $auth);
        return $auth;
    }

    /** 段階0で最初のパスキーを登録する、または、段階1（確認済み）でパスキーを追加する。 */
    protected function registerBlgPasskey(TestClient $client, SoftwareAuthenticator $auth): array
    {
        $options = $client->post('/api/v1/blg/passkeys/registration-options');
        $this->assertSame(200, $options->status(), $options->body());
        $response = $client->post('/api/v1/blg/passkeys', ['credential' => $auth->create($options->json())]);
        $this->assertSame(201, $response->status(), $response->body());
        return $response->json();
    }

    /** パスワード → パスキーの順で、運用担当者の所属でログインする。 */
    protected function loginSuperAgain(TestClient $client, SoftwareAuthenticator $auth, string $loginId = 'operator'): void
    {
        $login = $this->blgLogin($client, $loginId);
        $this->assertSame(0, $login['authStage']);
        $this->assertTrue($login['passkeyRegistered']);
        $options = $client->post('/api/v1/blg/sessions/passkey-options');
        $this->assertSame(200, $options->status(), $options->body());
        $done = $client->post('/api/v1/blg/sessions/passkey', ['passkey' => $auth->get($options->json())]);
        $this->assertSame(200, $done->status(), $done->body());
    }

    /** 家族を登録し、所属の招待経由で所属させる（招待経由の本登録）。 */
    protected function registerFamilyInto(TestClient $blgClient, TestClient $familyClient, array $names = ['おとうさん']): array
    {
        $send = $blgClient->post('/api/v1/blg/invitations', ['email' => 'invitee@example.com']);
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
