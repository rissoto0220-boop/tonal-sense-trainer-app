<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

/** ファミリー認証の基本の流れ（登録・ログイン・ユーザ管理・確認・退会）。 */
final class FamilyAuthFlowTest extends ApiTestCase
{
    public function testRegistrationAndSessionFlow(): void
    {
        $c = $this->client();
        $reg = $this->registerFamily($c);
        $this->assertNotSame('', $reg['recoveryCode']);
        $this->assertNotNull($c->sessionCookie());

        $current = $c->get('/api/v1/sessions/current');
        $this->assertSame(200, $current->status(), $current->body());

        $users = $c->get('/api/v1/users');
        $this->assertSame(200, $users->status(), $users->body());
    }

    public function testCaptchaFailureIsRejected(): void
    {
        $r = $this->client()->post('/api/v1/registrations', ['email' => 'a@example.com', 'captchaToken' => 'bad']);
        $this->assertSame(422, $r->status(), $r->body());
    }

    public function testUnauthenticatedAccessIsRejected(): void
    {
        $this->assertError($this->client()->get('/api/v1/users'), 401, 'UNAUTHENTICATED');
    }

    public function testLoginWithRecoveryCodeOnAnotherDevice(): void
    {
        $a = $this->client();
        $reg = $this->registerFamily($a);

        $b = $this->client('198.51.100.2');
        $login = $b->post('/api/v1/sessions', ['recoveryCode' => $reg['recoveryCode']]);
        $this->assertSame(201, $login->status(), $login->body());
        $this->assertNotNull($b->sessionCookie());

        $wrong = $this->client('198.51.100.3')->post('/api/v1/sessions', ['recoveryCode' => 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA']);
        $this->assertContains($wrong->status(), [401, 422], $wrong->body());
    }

    public function testUserManagementRequiresElevationForDelete(): void
    {
        $c = $this->client();
        $reg = $this->registerFamily($c);
        $users = $c->get('/api/v1/users')->json();
        $list = $users['users'] ?? $users;
        $this->assertGreaterThanOrEqual(2, count($list));

        $added = $c->post('/api/v1/users', ['name' => 'たろう']);
        $this->assertSame(201, $added->status(), $added->body());

        $id = $added->json()['user']['id'] ?? $added->json()['id'];
        $del = $c->delete('/api/v1/users/' . $id);
        $this->assertSame(403, $del->status(), $del->body());

        $this->elevate($c, $reg['recoveryCode']);
        $del2 = $c->delete('/api/v1/users/' . $id);
        $this->assertContains($del2->status(), [200, 204], $del2->body());
    }

    public function testLogoutClearsSession(): void
    {
        $c = $this->client();
        $this->registerFamily($c);
        $out = $c->delete('/api/v1/sessions/current');
        $this->assertContains($out->status(), [200, 204], $out->body());
        $this->assertError($c->get('/api/v1/users'), 401, 'UNAUTHENTICATED');
    }

    public function testWithdrawRequiresElevationAndRemovesFamily(): void
    {
        $c = $this->client();
        $reg = $this->registerFamily($c);
        $this->assertSame(403, $c->delete('/api/v1/family')->status());
        $this->elevate($c, $reg['recoveryCode']);
        $w = $c->delete('/api/v1/family');
        $this->assertContains($w->status(), [200, 204], $w->body());
        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM families')->fetchColumn());
    }
}
