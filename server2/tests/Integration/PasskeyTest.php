<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use UecTst\Tests\Support\SoftwareAuthenticator;
use UecTst\Tests\Support\TestClient;

/** パスキー（#15 のパスキー確認、#23〜#27）。 */
final class PasskeyTest extends ApiTestCase
{
    private function authenticator(): SoftwareAuthenticator
    {
        return new SoftwareAuthenticator($this->services->config->webauthnRpId);
    }

    /** パスワードを設定し、確認が有効な状態にする。 */
    private function familyWithPasswordElevated(TestClient $c): void
    {
        $reg = $this->registerFamily($c);
        $this->elevate($c, $reg['recoveryCode']);
        $this->assertSame(204, $c->put('/api/v1/superuser/password', ['newPassword' => '4821'])->status());
    }

    /** パスキーを1つ登録して、認証器を返す。確認は切れた状態にする。 */
    private function registerPasskey(TestClient $c, ?SoftwareAuthenticator $auth = null): SoftwareAuthenticator
    {
        $auth ??= $this->authenticator();
        $options = $c->post('/api/v1/superuser/passkeys/registration-options');
        $this->assertSame(200, $options->status(), $options->body());
        $r = $c->post('/api/v1/superuser/passkeys', ['credential' => $auth->create($options->json())]);
        $this->assertSame(201, $r->status(), $r->body());
        return $auth;
    }

    private function elevateWithPasskey(TestClient $c, SoftwareAuthenticator $auth): \UecTst\Tests\Support\TestResponse
    {
        $options = $c->post('/api/v1/elevation/passkey-options');
        $this->assertSame(200, $options->status(), $options->body());
        return $c->post('/api/v1/elevation', ['passkey' => $auth->get($options->json())]);
    }

    public function testRegistrationOptionsShape(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        $r = $c->post('/api/v1/superuser/passkeys/registration-options');
        $json = $r->json();
        $this->assertSame(200, $r->status(), $r->body());
        $this->assertSame($this->services->config->webauthnRpId, $json['rp']['id']);
        $this->assertSame('none', $json['attestation']);
        $this->assertSame('required', $json['authenticatorSelection']['userVerification']);
        $this->assertSame([-7, -257], array_column($json['pubKeyCredParams'], 'alg'));
        $this->assertSame([], $json['excludeCredentials']);
        $this->assertSame(32, strlen((string) \UecTst\Security\Base64Url::decode($json['challenge'])));
        $this->assertSame('家族の管理用', $json['user']['name']);
    }

    public function testRegistrationRequiresElevationAndPassword(): void
    {
        $c = $this->client();
        $reg = $this->registerFamily($c);
        $this->assertError($c->post('/api/v1/superuser/passkeys/registration-options'), 403, 'ELEVATION_REQUIRED');
        $this->assertError($c->post('/api/v1/superuser/passkeys', ['credential' => []]), 403, 'ELEVATION_REQUIRED');

        $this->elevate($c, $reg['recoveryCode']);
        $this->assertError($c->post('/api/v1/superuser/passkeys/registration-options'), 409, 'SUPERUSER_PASSWORD_NOT_SET');
    }

    public function testRegisterListAndElevateWithPasskey(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        $auth = $this->registerPasskey($c);

        $list = $c->get('/api/v1/superuser/passkeys')->json()['passkeys'];
        $this->assertCount(1, $list);
        $this->assertStringEndsWith('で登録', $list[0]['name']);
        $this->assertFalse($list[0]['synced']);
        $this->assertNull($list[0]['lastUsedAt']);
        $this->assertTrue($c->get('/api/v1/sessions/current')->json()['family']['superuserPasskeyRegistered']);

        $this->clock->advance('+6 minutes');
        $this->assertError($c->delete('/api/v1/family'), 403, 'ELEVATION_REQUIRED');
        $ok = $this->elevateWithPasskey($c, $auth);
        $this->assertSame(200, $ok->status(), $ok->body());
        $this->assertNotNull($c->get('/api/v1/sessions/current')->json()['session']['elevatedUntil']);
        $this->assertNotNull($c->get('/api/v1/superuser/passkeys')->json()['passkeys'][0]['lastUsedAt']);
    }

    public function testSyncedPasskeyIsFlagged(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        $auth = $this->authenticator();
        $auth->backupEligible = true;
        $this->registerPasskey($c, $auth);
        $this->assertTrue($c->get('/api/v1/superuser/passkeys')->json()['passkeys'][0]['synced']);
    }

    public function testChallengeIsSingleUse(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        $auth = $this->registerPasskey($c);
        $this->clock->advance('+6 minutes');

        $options = $c->post('/api/v1/elevation/passkey-options')->json();
        $assertion = $auth->get($options);
        $this->assertSame(200, $c->post('/api/v1/elevation', ['passkey' => $assertion])->status());
        // 同じ応答の再送（リプレイ）は、challenge がないため拒否される。
        $this->assertError($c->post('/api/v1/elevation', ['passkey' => $assertion]), 401, 'PASSKEY_VERIFICATION_FAILED');
    }

    public function testElevationWithoutIssuedChallengeFails(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        $auth = $this->registerPasskey($c);
        $this->clock->advance('+6 minutes');
        $fake = ['challenge' => \UecTst\Security\Base64Url::encode(random_bytes(32))];
        $this->assertError($c->post('/api/v1/elevation', ['passkey' => $auth->get($fake)]), 401, 'PASSKEY_VERIFICATION_FAILED');
    }

    public function testExpiredChallengeFails(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        $auth = $this->registerPasskey($c);
        $options = $c->post('/api/v1/elevation/passkey-options')->json();
        $this->clock->advance('+6 minutes');
        $this->assertError($c->post('/api/v1/elevation', ['passkey' => $auth->get($options)]), 401, 'PASSKEY_VERIFICATION_FAILED');
    }

    public function testWrongChallengeOriginAndUserVerificationAreRejected(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        $auth = $this->registerPasskey($c);
        $this->clock->advance('+6 minutes');

        $options = $c->post('/api/v1/elevation/passkey-options')->json();
        $this->assertError(
            $c->post('/api/v1/elevation', ['passkey' => $auth->get($options, \UecTst\Security\Base64Url::encode(random_bytes(32)))]),
            401,
            'PASSKEY_VERIFICATION_FAILED',
        );

        $options = $c->post('/api/v1/elevation/passkey-options')->json();
        $auth->origin = 'https://evil.example';
        $this->assertError($c->post('/api/v1/elevation', ['passkey' => $auth->get($options)]), 401, 'PASSKEY_VERIFICATION_FAILED');
        $auth->origin = TestClient::ORIGIN;

        $options = $c->post('/api/v1/elevation/passkey-options')->json();
        $auth->userVerified = false;
        $this->assertError($c->post('/api/v1/elevation', ['passkey' => $auth->get($options)]), 401, 'PASSKEY_VERIFICATION_FAILED');
        $auth->userVerified = true;

        $options = $c->post('/api/v1/elevation/passkey-options')->json();
        $auth->rpId = 'other.example';
        $this->assertError($c->post('/api/v1/elevation', ['passkey' => $auth->get($options)]), 401, 'PASSKEY_VERIFICATION_FAILED');
        $auth->rpId = $this->services->config->webauthnRpId;

        // 失敗の後でも、正しい操作はできる（パスキーの失敗は、ロックに数えない）。
        $this->assertSame(200, $this->elevateWithPasskey($c, $auth)->status());
    }

    public function testTamperedSignatureIsRejected(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        $auth = $this->registerPasskey($c);
        $this->clock->advance('+6 minutes');

        $options = $c->post('/api/v1/elevation/passkey-options')->json();
        $assertion = $auth->get($options);
        $sig = (string) \UecTst\Security\Base64Url::decode($assertion['response']['signature']);
        $sig[strlen($sig) - 1] = chr(ord($sig[strlen($sig) - 1]) ^ 0x01);
        $assertion['response']['signature'] = \UecTst\Security\Base64Url::encode($sig);
        $this->assertError($c->post('/api/v1/elevation', ['passkey' => $assertion]), 401, 'PASSKEY_VERIFICATION_FAILED');
    }

    public function testUnregisteredAndOtherFamilyPasskeyAreRejected(): void
    {
        $a = $this->client();
        $this->familyWithPasswordElevated($a);
        $this->registerPasskey($a);

        $b = $this->client('198.51.100.2');
        $this->familyWithPasswordElevated($b);
        $authB = $this->registerPasskey($b);
        $this->clock->advance('+6 minutes');

        // A の端末で、B のパスキーを使う。
        $options = $a->post('/api/v1/elevation/passkey-options')->json();
        $this->assertError($a->post('/api/v1/elevation', ['passkey' => $authB->get($options)]), 401, 'PASSKEY_VERIFICATION_FAILED');
        // 未登録の認証器。
        $options = $a->post('/api/v1/elevation/passkey-options')->json();
        $this->assertError($a->post('/api/v1/elevation', ['passkey' => $this->authenticator()->get($options)]), 401, 'PASSKEY_VERIFICATION_FAILED');
    }

    public function testCounterReplayIsRejected(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        $auth = $this->registerPasskey($c);
        $this->clock->advance('+6 minutes');
        $this->assertSame(200, $this->elevateWithPasskey($c, $auth)->status());
        $this->assertSame(200, $this->elevateWithPasskey($c, $auth)->status());

        // 認証器が複製され、古いカウンタを返した場合。
        $auth->counter = 0;
        $this->assertError($this->elevateWithPasskey($c, $auth), 401, 'PASSKEY_VERIFICATION_FAILED');
    }

    public function testPasskeyOptionsPreconditions(): void
    {
        $c = $this->client();
        $reg = $this->registerFamily($c);
        $this->assertError($c->post('/api/v1/elevation/passkey-options'), 409, 'SUPERUSER_PASSWORD_NOT_SET');
        $this->elevate($c, $reg['recoveryCode']);
        $c->put('/api/v1/superuser/password', ['newPassword' => '4821']);
        $this->assertError($c->post('/api/v1/elevation/passkey-options'), 404, 'NOT_FOUND');
        $this->assertError($this->client()->post('/api/v1/elevation/passkey-options'), 401, 'UNAUTHENTICATED');
    }

    public function testDuplicateCredentialIsRejected(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        $auth = $this->registerPasskey($c);
        $options = $c->post('/api/v1/superuser/passkeys/registration-options');
        $this->assertCount(1, $options->json()['excludeCredentials']);
        $this->assertError($c->post('/api/v1/superuser/passkeys', ['credential' => $auth->create($options->json())]), 401, 'PASSKEY_VERIFICATION_FAILED');
    }

    public function testRegistrationWithoutChallengeOrWithBadCredentialFails(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        $auth = $this->authenticator();
        $fake = ['challenge' => \UecTst\Security\Base64Url::encode(random_bytes(32)), 'user' => ['id' => \UecTst\Security\Base64Url::encode('x')]];
        $this->assertError($c->post('/api/v1/superuser/passkeys', ['credential' => $auth->create($fake)]), 401, 'PASSKEY_VERIFICATION_FAILED');

        $options = $c->post('/api/v1/superuser/passkeys/registration-options')->json();
        $this->assertError($c->post('/api/v1/superuser/passkeys', ['credential' => ['id' => 'x', 'type' => 'public-key']]), 401, 'PASSKEY_VERIFICATION_FAILED');
        $this->assertError($c->post('/api/v1/superuser/passkeys', ['credential' => 'x']), 400, 'BAD_REQUEST');
        $this->assertNotEmpty($options);
        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM passkeys')->fetchColumn());
    }

    public function testLimitOfTenPasskeys(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        for ($i = 0; $i < 10; $i++) {
            $this->registerPasskey($c);
            $this->clock->advance('+1 second');
        }
        $this->assertError($c->post('/api/v1/superuser/passkeys/registration-options'), 409, 'PASSKEY_LIMIT_REACHED');
        $this->assertCount(10, $c->get('/api/v1/superuser/passkeys')->json()['passkeys']);
    }

    public function testPasskeysListIsNewestFirstAndDeleteRules(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        $this->registerPasskey($c);
        $this->clock->advance('+1 second');
        $this->registerPasskey($c);
        $list = $c->get('/api/v1/superuser/passkeys')->json()['passkeys'];
        $this->assertGreaterThan($list[1]['createdAt'], $list[0]['createdAt']);

        // パスキーがある間は、パスワードを削除できない。
        $this->assertError($c->delete('/api/v1/superuser/password'), 409, 'PASSKEYS_REGISTERED');

        $this->clock->advance('+6 minutes');
        $this->assertError($c->delete('/api/v1/superuser/passkeys/' . $list[0]['id']), 403, 'ELEVATION_REQUIRED');
        $this->assertSame(200, $c->post('/api/v1/elevation', ['superuserPassword' => '4821'])->status());
        $this->assertError($c->delete('/api/v1/superuser/passkeys/not-a-uuid'), 404, 'NOT_FOUND');
        $this->assertSame(204, $c->delete('/api/v1/superuser/passkeys/' . $list[0]['id'])->status());
        $this->assertSame(204, $c->delete('/api/v1/superuser/passkeys/' . $list[1]['id'])->status());
        $this->assertError($c->delete('/api/v1/superuser/passkeys/' . $list[1]['id']), 404, 'NOT_FOUND');
        $this->assertSame(204, $c->delete('/api/v1/superuser/password')->status());
    }

    public function testCannotDeleteOtherFamilysPasskey(): void
    {
        $a = $this->client();
        $this->familyWithPasswordElevated($a);
        $this->registerPasskey($a);
        $idA = $a->get('/api/v1/superuser/passkeys')->json()['passkeys'][0]['id'];

        $b = $this->client('198.51.100.2');
        $this->familyWithPasswordElevated($b);
        $this->assertError($b->delete('/api/v1/superuser/passkeys/' . $idA), 404, 'NOT_FOUND');
        $this->assertCount(1, $a->get('/api/v1/superuser/passkeys')->json()['passkeys']);
    }

    public function testChallengeIssuingIsRateLimitedPerSession(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        $this->registerPasskey($c);   // registration-options を1回使う
        $last = null;
        for ($i = 0; $i < 35; $i++) {
            $last = $c->post('/api/v1/elevation/passkey-options');
        }
        $this->assertError($last, 429, 'RATE_LIMITED');
    }

    public function testWithdrawalRemovesPasskeys(): void
    {
        $c = $this->client();
        $this->familyWithPasswordElevated($c);
        $this->registerPasskey($c);
        $this->assertSame(204, $c->delete('/api/v1/family')->status());
        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM passkeys')->fetchColumn());
    }
}
