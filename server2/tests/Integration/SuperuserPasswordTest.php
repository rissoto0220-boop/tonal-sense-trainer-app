<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use UecTst\Tests\Support\TestClient;

/** スーパーユーザ・パスワード（#15 のパスワード確認、#17〜#20、#22）。 */
final class SuperuserPasswordTest extends ApiTestCase
{
    /** 家族を登録し、パスワードを設定した状態にする。確認は切れている。 */
    private function familyWithPassword(TestClient $c, string $password = '4821'): string
    {
        $reg = $this->registerFamily($c);
        $this->elevate($c, $reg['recoveryCode']);
        $set = $c->put('/api/v1/superuser/password', ['newPassword' => $password]);
        $this->assertSame(204, $set->status(), $set->body());
        $this->clock->advance('+6 minutes');
        return $reg['recoveryCode'];
    }

    public function testShowReportsStatus(): void
    {
        $c = $this->client();
        $this->registerFamily($c);
        $r = $c->get('/api/v1/superuser');
        $this->assertSame(200, $r->status(), $r->body());
        $json = $r->json();
        $this->assertFalse($json['passwordSet']);
        $this->assertNull($json['passwordLockedUntil']);
        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $json['superuserId']);
    }

    public function testSetPasswordNeedsElevationAndValidFormat(): void
    {
        $c = $this->client();
        $reg = $this->registerFamily($c);
        $this->assertError($c->put('/api/v1/superuser/password', ['newPassword' => '4821']), 403, 'ELEVATION_REQUIRED');

        $this->elevate($c, $reg['recoveryCode']);
        $this->assertError($c->put('/api/v1/superuser/password', ['newPassword' => '123']), 422, 'VALIDATION_FAILED');
        $this->assertError($c->put('/api/v1/superuser/password', ['newPassword' => str_repeat('a', 65)]), 422, 'VALIDATION_FAILED');
        $this->assertSame(204, $c->put('/api/v1/superuser/password', ['newPassword' => '    '])->status(), '空白だけでも4文字以上なら可（そのまま扱う）');

        $hash = $this->pdo->query('SELECT superuser_password_hash FROM families')->fetchColumn();
        $this->assertStringStartsWith('$argon2id$', (string) $hash);
        $this->assertTrue($c->get('/api/v1/sessions/current')->json()['family']['superuserPasswordSet']);
    }

    public function testElevationSwitchesFromRecoveryCodeToPassword(): void
    {
        $c = $this->client();
        $code = $this->familyWithPassword($c);

        $this->assertError($c->post('/api/v1/elevation', ['recoveryCode' => $code]), 409, 'SUPERUSER_PASSWORD_ALREADY_SET');
        $this->assertError($c->post('/api/v1/elevation', ['superuserPassword' => 'wrong']), 401, 'INVALID_SUPERUSER_PASSWORD');

        $ok = $c->post('/api/v1/elevation', ['superuserPassword' => '4821']);
        $this->assertSame(200, $ok->status(), $ok->body());
        $this->assertSame(204, $c->delete('/api/v1/family')->status(), '確認の後は、退会などができる');
    }

    public function testPasswordConfirmationWithoutPasswordSetIsConflict(): void
    {
        $c = $this->client();
        $this->registerFamily($c);
        $this->assertError($c->post('/api/v1/elevation', ['superuserPassword' => '4821']), 409, 'SUPERUSER_PASSWORD_NOT_SET');
    }

    public function testFiveFailuresLockForFifteenMinutes(): void
    {
        $c = $this->client();
        $this->familyWithPassword($c);

        for ($i = 0; $i < 5; $i++) {
            $this->assertError($c->post('/api/v1/elevation', ['superuserPassword' => 'wrong']), 401, 'INVALID_SUPERUSER_PASSWORD');
        }
        $locked = $c->post('/api/v1/elevation', ['superuserPassword' => '4821']);
        $this->assertError($locked, 429, 'SUPERUSER_PASSWORD_LOCKED');
        $this->assertSame('900', $locked->header('Retry-After'), '正しいパスワードでも、ロック中は拒否する');
        $this->assertNotNull($c->get('/api/v1/superuser')->json()['passwordLockedUntil']);

        $this->clock->advance('+14 minutes');
        $this->assertError($c->post('/api/v1/elevation', ['superuserPassword' => '4821']), 429, 'SUPERUSER_PASSWORD_LOCKED');

        $this->clock->advance('+2 minutes');
        $this->assertSame(200, $c->post('/api/v1/elevation', ['superuserPassword' => '4821'])->status());
        $this->assertNull($c->get('/api/v1/superuser')->json()['passwordLockedUntil']);
    }

    public function testSuccessResetsFailureCount(): void
    {
        $c = $this->client();
        $this->familyWithPassword($c);
        for ($i = 0; $i < 4; $i++) {
            $c->post('/api/v1/elevation', ['superuserPassword' => 'wrong']);
        }
        $this->assertSame(200, $c->post('/api/v1/elevation', ['superuserPassword' => '4821'])->status());
        // 成功で0に戻るので、さらに4回失敗してもロックされない。
        for ($i = 0; $i < 4; $i++) {
            $this->assertError($c->post('/api/v1/elevation', ['superuserPassword' => 'wrong']), 401, 'INVALID_SUPERUSER_PASSWORD');
        }
    }

    public function testResetPasswordWithRecoveryCodeEvenWhenLocked(): void
    {
        $c = $this->client();
        $code = $this->familyWithPassword($c);
        for ($i = 0; $i < 5; $i++) {
            $c->post('/api/v1/elevation', ['superuserPassword' => 'wrong']);
        }

        $bad = $c->post('/api/v1/superuser/password/reset', ['recoveryCode' => \UecTst\Security\RecoveryCode::generate(), 'newPassword' => '7390']);
        $this->assertError($bad, 401, 'INVALID_RECOVERY_CODE');
        $this->assertError($c->post('/api/v1/superuser/password/reset', ['recoveryCode' => $code, 'newPassword' => 'ab']), 422, 'VALIDATION_FAILED');

        $ok = $c->post('/api/v1/superuser/password/reset', ['recoveryCode' => $code, 'newPassword' => '7390']);
        $this->assertSame(200, $ok->status(), $ok->body());
        $this->assertArrayHasKey('elevatedUntil', $ok->json());
        $this->assertNull($c->get('/api/v1/superuser')->json()['passwordLockedUntil']);

        // 再設定の直後は、重要な操作を続けられる。新しいパスワードで、あとから確認もできる。
        $this->clock->advance('+6 minutes');
        $this->assertSame(200, $c->post('/api/v1/elevation', ['superuserPassword' => '7390'])->status());
        $this->assertError($c->post('/api/v1/elevation', ['superuserPassword' => '4821']), 401, 'INVALID_SUPERUSER_PASSWORD');
    }

    public function testDeletePassword(): void
    {
        $c = $this->client();
        $code = $this->familyWithPassword($c);
        $this->assertError($c->delete('/api/v1/superuser/password'), 403, 'ELEVATION_REQUIRED');

        $this->assertSame(200, $c->post('/api/v1/elevation', ['superuserPassword' => '4821'])->status());
        $this->assertSame(204, $c->delete('/api/v1/superuser/password')->status());
        $row = $this->pdo->query('SELECT superuser_password_hash, superuser_password_failed_count, superuser_password_locked_until FROM families')->fetch();
        $this->assertNull($row['superuser_password_hash']);
        $this->assertSame(0, (int) $row['superuser_password_failed_count']);
        $this->assertNull($row['superuser_password_locked_until']);

        // 以降の確認は、復旧コードに戻る。
        $this->clock->advance('+6 minutes');
        $this->assertSame(200, $c->post('/api/v1/elevation', ['recoveryCode' => $code])->status());
    }

    public function testTransferSuperuser(): void
    {
        $c = $this->client();
        $reg = $this->registerFamily($c, ['おとうさん', 'はなこ']);
        $users = $c->get('/api/v1/users')->json()['users'];
        $second = $users[1]['id'];

        $this->assertError($c->put('/api/v1/superuser', ['userId' => $second]), 403, 'ELEVATION_REQUIRED');
        $this->elevate($c, $reg['recoveryCode']);
        $this->assertError($c->put('/api/v1/superuser', ['userId' => '01a1a4a7-0000-7000-8000-000000000000']), 404, 'NOT_FOUND');
        $this->assertError($c->put('/api/v1/superuser', ['userId' => 'not-a-uuid']), 404, 'NOT_FOUND');

        $r = $c->put('/api/v1/superuser', ['userId' => $second]);
        $this->assertSame(200, $r->status(), $r->body());
        $flags = array_column($r->json()['users'], 'isSuperuser', 'id');
        $this->assertTrue($flags[$second]);
        $this->assertFalse($flags[$users[0]['id']]);
        $this->assertSame($second, $c->get('/api/v1/superuser')->json()['superuserId']);

        // すでにスーパーユーザなら、何もしない。
        $this->assertSame(200, $c->put('/api/v1/superuser', ['userId' => $second])->status());
        // 旧スーパーユーザは削除できるようになる。
        $this->assertSame(204, $c->delete('/api/v1/users/' . $users[0]['id'])->status());
    }

    public function testOtherFamilyUserIsNotFound(): void
    {
        $a = $this->client();
        $codeA = $this->registerFamily($a)['recoveryCode'];
        $b = $this->client('198.51.100.2');
        $b->post('/api/v1/registrations', ['email' => 'b@example.com', 'captchaToken' => 'ok']);
        $b->post('/api/v1/registrations/complete', ['token' => $this->mailer->lastRegistrationToken(), 'users' => [['name' => 'べつ']]]);
        $other = $b->get('/api/v1/users')->json()['users'][0]['id'];

        $this->elevate($a, $codeA);
        $this->assertError($a->put('/api/v1/superuser', ['userId' => $other]), 404, 'NOT_FOUND');
    }

    public function testElevationBodyMustHaveExactlyOneMethod(): void
    {
        $c = $this->client();
        $this->registerFamily($c);
        $this->assertError($c->post('/api/v1/elevation', ['superuserPassword' => 'abcd', 'recoveryCode' => 'x']), 400, 'BAD_REQUEST');
        $this->assertError($c->post('/api/v1/elevation', []), 400, 'BAD_REQUEST');
    }
}
