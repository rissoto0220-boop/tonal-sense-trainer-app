<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use UecTst\Security\Base64Url;
use UecTst\Tests\Support\SoftwareAuthenticator;

/** 運用担当者の所属のパスキー（B2・B3・B8〜B11）と、段階0・1 のログイン。 */
final class BlgPasskeyTest extends BlgApiTestCase
{
    private function newAuthenticator(): SoftwareAuthenticator
    {
        return new SoftwareAuthenticator($this->services->config->webauthnRpId);
    }

    public function testFirstLoginFlowPasswordChangeThenPasskeyRegistration(): void
    {
        $this->createBelonging('運用担当者', 'operator', isSuper: true, changeRequired: true);
        $c = $this->client();
        $login = $this->blgLogin($c, 'operator');
        $this->assertSame(0, $login['authStage']);
        $this->assertFalse($login['passkeyRegistered']);
        $this->assertTrue($login['belonging']['isSuper']);

        // パスワードを変更するまでは、パスキーの登録も始められない。
        $this->assertError($c->post('/api/v1/blg/passkeys/registration-options'), 403, 'PASSWORD_CHANGE_REQUIRED');
        $this->assertSame(204, $c->put('/api/v1/blg/password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'operator-new-password'])->status());

        // 段階0では、ほかの API は使えない。
        $this->assertError($c->get('/api/v1/blg/members'), 403, 'PASSKEY_REQUIRED');
        $this->assertError($c->get('/api/v1/blg/belongings'), 403, 'PASSKEY_REQUIRED');
        $this->assertError($c->post('/api/v1/blg/elevation', ['password' => 'operator-new-password']), 403, 'PASSKEY_REQUIRED');
        $this->assertError($c->post('/api/v1/blg/invitations', ['email' => 'a@example.com']), 403, 'PASSKEY_REQUIRED');
        $this->assertSame(0, $c->get('/api/v1/blg/sessions/current')->json()['session']['authStage']);

        // 最初のパスキーは、確認なしで登録でき、登録できたらログイン完了（段階1）になる。
        $auth = $this->newAuthenticator();
        $options = $c->post('/api/v1/blg/passkeys/registration-options');
        $this->assertSame(200, $options->status(), $options->body());
        $json = $options->json();
        $this->assertSame('operator', $json['user']['name']);
        $this->assertSame('運用担当者', $json['user']['displayName']);
        $this->assertSame($this->idString($this->services->belongings->findByLoginId('operator')->id), $this->idString(Base64Url::decode($json['user']['id'])));
        $this->assertSame('required', $json['authenticatorSelection']['userVerification']);

        $registered = $c->post('/api/v1/blg/passkeys', ['credential' => $auth->create($json)]);
        $this->assertSame(201, $registered->status(), $registered->body());
        $this->assertSame(1, $registered->json()['authStage']);
        $this->assertStringEndsWith('で登録', $registered->json()['passkey']['name']);

        $this->assertSame(1, $c->get('/api/v1/blg/sessions/current')->json()['session']['authStage']);
        $this->assertSame(200, $c->get('/api/v1/blg/belongings')->status());
        $this->assertCount(1, $c->get('/api/v1/blg/passkeys')->json()['passkeys']);
    }

    public function testLaterLoginsRequireThePasskey(): void
    {
        $this->createBelonging('運用担当者', 'operator', isSuper: true);
        $first = $this->client();
        $auth = $this->loginSuperWithPasskey($first);

        $c = $this->client('203.0.113.5');
        $login = $this->blgLogin($c, 'operator');
        $this->assertSame(0, $login['authStage']);
        $this->assertTrue($login['passkeyRegistered']);
        $this->assertError($c->get('/api/v1/blg/belongings'), 403, 'PASSKEY_REQUIRED');

        $options = $c->post('/api/v1/blg/sessions/passkey-options');
        $this->assertSame(200, $options->status(), $options->body());
        $this->assertCount(1, $options->json()['allowCredentials']);
        $this->assertSame('required', $options->json()['userVerification']);

        $done = $c->post('/api/v1/blg/sessions/passkey', ['passkey' => $auth->get($options->json())]);
        $this->assertSame(200, $done->status(), $done->body());
        $this->assertSame(1, $done->json()['authStage']);
        $this->assertSame(200, $c->get('/api/v1/blg/belongings')->status());
        $this->assertNotNull($c->get('/api/v1/blg/passkeys')->json()['passkeys'][0]['lastUsedAt']);

        // ログイン完了後に、もう一度パスキーの確認を求めると 400。
        $this->assertError($c->post('/api/v1/blg/sessions/passkey-options'), 400, 'BAD_REQUEST');
    }

    public function testStageZeroSessionExpiresAfterTenMinutes(): void
    {
        $this->createBelonging('運用担当者', 'operator', isSuper: true);
        $this->loginSuperWithPasskey($this->client());
        $c = $this->client('203.0.113.5');
        $this->blgLogin($c, 'operator');
        $this->clock->advance('+9 minutes');
        $this->assertSame(200, $c->get('/api/v1/blg/sessions/current')->status());
        $this->clock->advance('+2 minutes');
        $this->assertError($c->get('/api/v1/blg/sessions/current'), 401, 'UNAUTHENTICATED');
    }

    public function testPasskeyLoginFailuresKeepTheSessionAtStageZero(): void
    {
        $this->createBelonging('運用担当者', 'operator', isSuper: true);
        $auth = $this->loginSuperWithPasskey($this->client());
        $c = $this->client('203.0.113.5');
        $this->blgLogin($c, 'operator');

        // challenge がない
        $this->assertError($c->post('/api/v1/blg/sessions/passkey', ['passkey' => $auth->get(['challenge' => Base64Url::encode(random_bytes(32))])]), 401, 'PASSKEY_VERIFICATION_FAILED');

        // 署名の改ざん
        $options = $c->post('/api/v1/blg/sessions/passkey-options')->json();
        $assertion = $auth->get($options);
        $signature = Base64Url::decode($assertion['response']['signature']);
        $signature[strlen($signature) - 1] = chr(ord($signature[strlen($signature) - 1]) ^ 1);
        $assertion['response']['signature'] = Base64Url::encode($signature);
        $this->assertError($c->post('/api/v1/blg/sessions/passkey', ['passkey' => $assertion]), 401, 'PASSKEY_VERIFICATION_FAILED');

        // 発行した challenge とは別の challenge への署名
        $options = $c->post('/api/v1/blg/sessions/passkey-options')->json();
        $this->assertError($c->post('/api/v1/blg/sessions/passkey', ['passkey' => $auth->get($options, Base64Url::encode(random_bytes(32)))]), 401, 'PASSKEY_VERIFICATION_FAILED');

        // 別のオリジンからの応答
        $options = $c->post('/api/v1/blg/sessions/passkey-options')->json();
        $auth->origin = 'https://evil.example';
        $this->assertError($c->post('/api/v1/blg/sessions/passkey', ['passkey' => $auth->get($options)]), 401, 'PASSKEY_VERIFICATION_FAILED');
        $auth->origin = \UecTst\Tests\Support\TestClient::ORIGIN;

        // 使い切り（リプレイ）
        $options = $c->post('/api/v1/blg/sessions/passkey-options')->json();
        $assertion = $auth->get($options);
        $this->assertSame(200, $c->post('/api/v1/blg/sessions/passkey', ['passkey' => $assertion])->status());
        $other = $this->client('203.0.113.6');
        $this->blgLogin($other, 'operator');
        $other->post('/api/v1/blg/sessions/passkey-options');
        $this->assertError($other->post('/api/v1/blg/sessions/passkey', ['passkey' => $assertion]), 401, 'PASSKEY_VERIFICATION_FAILED');
        $this->assertSame(0, $other->get('/api/v1/blg/sessions/current')->json()['session']['authStage']);
    }

    public function testAnotherBelongingsPasskeyIsRejected(): void
    {
        $this->createBelonging('運用担当者', 'operator', isSuper: true);
        $this->loginSuperWithPasskey($this->client());

        // 運用担当者の所属は1つだけのため、別の持ち主として、家族のパスキーを使って試す。
        $family = $this->client();
        $reg = $this->registerFamily($family);
        $this->elevate($family, $reg['recoveryCode']);
        $family->put('/api/v1/superuser/password', ['newPassword' => '4821']);
        $familyAuth = $this->newAuthenticator();
        $familyOptions = $family->post('/api/v1/superuser/passkeys/registration-options')->json();
        $family->post('/api/v1/superuser/passkeys', ['credential' => $familyAuth->create($familyOptions)]);

        $c = $this->client('203.0.113.5');
        $this->blgLogin($c, 'operator');
        $options = $c->post('/api/v1/blg/sessions/passkey-options')->json();
        $this->assertError($c->post('/api/v1/blg/sessions/passkey', ['passkey' => $familyAuth->get($options)]), 401, 'PASSKEY_VERIFICATION_FAILED');
    }

    public function testNormalBelongingCannotUsePasskeyApis(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $c = $this->client();
        $this->blgLogin($c, 'example-univ');
        $this->blgElevate($c);
        $this->assertError($c->get('/api/v1/blg/passkeys'), 403, 'SUPER_ONLY');
        $this->assertError($c->post('/api/v1/blg/passkeys/registration-options'), 403, 'SUPER_ONLY');
        $this->assertError($c->post('/api/v1/blg/passkeys', ['credential' => []]), 403, 'SUPER_ONLY');
        $this->assertError($c->delete('/api/v1/blg/passkeys/' . $this->idString(random_bytes(16))), 403, 'SUPER_ONLY');
        $this->assertError($c->post('/api/v1/blg/sessions/passkey-options'), 403, 'SUPER_ONLY');
        $this->assertError($c->post('/api/v1/blg/sessions/passkey', ['passkey' => []]), 403, 'SUPER_ONLY');
    }

    public function testStageZeroCannotRegisterAnotherPasskeyWhenOneExists(): void
    {
        $this->createBelonging('運用担当者', 'operator', isSuper: true);
        $this->loginSuperWithPasskey($this->client());
        $c = $this->client('203.0.113.5');
        $this->blgLogin($c, 'operator');
        $this->assertError($c->post('/api/v1/blg/passkeys/registration-options'), 403, 'PASSKEY_REQUIRED');
        $this->assertError($c->post('/api/v1/blg/passkeys', ['credential' => []]), 403, 'PASSKEY_REQUIRED');
    }

    public function testAddingAndDeletingPasskeysRequiresElevation(): void
    {
        $this->createBelonging('運用担当者', 'operator', isSuper: true);
        $c = $this->client();
        $first = $this->loginSuperWithPasskey($c);

        $this->assertError($c->post('/api/v1/blg/passkeys/registration-options'), 403, 'ELEVATION_REQUIRED');
        $this->assertError($c->post('/api/v1/blg/passkeys', ['credential' => []]), 403, 'ELEVATION_REQUIRED');
        $this->blgElevate($c);

        $second = $this->newAuthenticator();
        $registered = $this->registerBlgPasskey($c, $second);
        $this->assertSame(1, $registered['authStage']);
        $list = $c->get('/api/v1/blg/passkeys')->json()['passkeys'];
        $this->assertCount(2, $list);

        $this->clock->advance('+6 minutes');
        $this->assertError($c->delete('/api/v1/blg/passkeys/' . $list[0]['id']), 403, 'ELEVATION_REQUIRED');
        $this->blgElevate($c);
        $this->assertError($c->delete('/api/v1/blg/passkeys/' . $this->idString(random_bytes(16))), 404, 'NOT_FOUND');
        $this->assertError($c->delete('/api/v1/blg/passkeys/not-a-uuid'), 404, 'NOT_FOUND');
        $this->assertSame(204, $c->delete('/api/v1/blg/passkeys/' . $list[0]['id'])->status());

        // 最後の1件は削除できない。
        $remaining = $c->get('/api/v1/blg/passkeys')->json()['passkeys'];
        $this->assertCount(1, $remaining);
        $this->assertError($c->delete('/api/v1/blg/passkeys/' . $remaining[0]['id']), 409, 'LAST_PASSKEY');
    }

    public function testPasskeyLimitIsTen(): void
    {
        $this->createBelonging('運用担当者', 'operator', isSuper: true);
        $c = $this->client();
        $this->loginSuperWithPasskey($c);
        $this->blgElevate($c);
        for ($i = 0; $i < 9; $i++) {
            $this->registerBlgPasskey($c, $this->newAuthenticator());
        }
        $this->assertCount(10, $c->get('/api/v1/blg/passkeys')->json()['passkeys']);
        $this->assertError($c->post('/api/v1/blg/passkeys/registration-options'), 409, 'PASSKEY_LIMIT_REACHED');
    }

    public function testChallengeIssuingIsRateLimitedPerSession(): void
    {
        $this->createBelonging('運用担当者', 'operator', isSuper: true);
        $this->loginSuperWithPasskey($this->client());
        $c = $this->client('203.0.113.5');
        $this->blgLogin($c, 'operator');
        for ($i = 0; $i < 30; $i++) {
            $this->assertSame(200, $c->post('/api/v1/blg/sessions/passkey-options')->status());
        }
        $this->assertError($c->post('/api/v1/blg/sessions/passkey-options'), 429, 'RATE_LIMITED');
    }
}
