<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

/** 組織のログイン・パスワード・確認（O1・O4〜O7）。 */
final class OrganizationAuthTest extends OrgApiTestCase
{
    public function testNormalOrganizationLogsInAtStageOneWithSessionCookie(): void
    {
        $this->createOrganization('○○大学', 'example-univ');
        $c = $this->client();
        $response = $c->post('/api/v1/org/sessions', ['loginId' => 'example-univ', 'password' => self::PASSWORD]);
        $json = $response->json();

        $this->assertSame(201, $response->status(), $response->body());
        $this->assertSame(1, $json['authStage']);
        $this->assertFalse($json['passkeyRegistered']);
        $this->assertSame('○○大学', $json['organization']['name']);
        $this->assertFalse($json['organization']['isSuper']);
        $this->assertArrayNotHasKey('password', $json['organization']);

        // 組織の Cookie は、家族の Cookie とは別の名前で、有効期限を持たない（ブラウザを閉じると消える）。
        $cookie = $response->setCookies()[0];
        $this->assertStringStartsWith('org-sid=', $cookie);
        $this->assertStringNotContainsString('Max-Age', $cookie);
        $this->assertStringContainsString('HttpOnly', $cookie);
        $this->assertStringContainsString('SameSite=Lax', $cookie);
        $this->assertArrayNotHasKey('sid', $c->cookies);

        $current = $c->get('/api/v1/org/sessions/current');
        $this->assertSame(200, $current->status(), $current->body());
        $this->assertSame(1, $current->json()['session']['authStage']);
        $this->assertNull($current->json()['session']['elevatedUntil']);
        $this->assertSame('example-univ', $current->json()['organization']['loginId']);
    }

    public function testLoginIdIsCaseInsensitive(): void
    {
        $this->createOrganization('A大学', 'example-univ');
        $this->orgLogin($this->client(), '  Example-UNIV ');
    }

    public function testUnknownLoginIdAndWrongPasswordAreIndistinguishable(): void
    {
        $this->createOrganization('A大学', 'example-univ');
        $c = $this->client();
        $unknown = $c->post('/api/v1/org/sessions', ['loginId' => 'nobody-here', 'password' => 'whatever-password']);
        $wrong = $c->post('/api/v1/org/sessions', ['loginId' => 'example-univ', 'password' => 'wrong-password-123']);
        $this->assertError($unknown, 401, 'INVALID_CREDENTIALS');
        $this->assertError($wrong, 401, 'INVALID_CREDENTIALS');
        $this->assertSame($unknown->json()['error']['message'], $wrong->json()['error']['message']);
        $this->assertSame([], $c->cookies);
    }

    public function testEmptyFieldsAreValidationErrorsAndWrongTypesAreBadRequests(): void
    {
        $c = $this->client();
        $this->assertError($c->post('/api/v1/org/sessions', ['loginId' => '', 'password' => 'x']), 422, 'VALIDATION_FAILED');
        $this->assertError($c->post('/api/v1/org/sessions', ['loginId' => 'abc', 'password' => '']), 422, 'VALIDATION_FAILED');
        $this->assertError($c->post('/api/v1/org/sessions', ['loginId' => 5, 'password' => 'x']), 400, 'BAD_REQUEST');
    }

    public function testFiveFailuresLockThePasswordForFifteenMinutes(): void
    {
        $this->createOrganization('A大学', 'example-univ');
        $c = $this->client();
        for ($i = 0; $i < 5; $i++) {
            $this->assertError($c->post('/api/v1/org/sessions', ['loginId' => 'example-univ', 'password' => 'wrong-password-123']), 401, 'INVALID_CREDENTIALS');
        }
        // ロック中は、正しいパスワードでも拒否される。
        $locked = $c->post('/api/v1/org/sessions', ['loginId' => 'example-univ', 'password' => self::PASSWORD]);
        $this->assertError($locked, 429, 'ORGANIZATION_PASSWORD_LOCKED');
        $this->assertGreaterThan(0, (int) $locked->header('Retry-After'));
        $this->assertLessThanOrEqual(900, (int) $locked->header('Retry-After'));

        $this->clock->advance('+14 minutes');
        $this->assertError($c->post('/api/v1/org/sessions', ['loginId' => 'example-univ', 'password' => self::PASSWORD]), 429, 'ORGANIZATION_PASSWORD_LOCKED');
        $this->clock->advance('+2 minutes');
        $this->orgLogin($c, 'example-univ');
    }

    public function testSuccessResetsTheFailureCount(): void
    {
        $this->createOrganization('A大学', 'example-univ');
        $c = $this->client();
        for ($round = 0; $round < 3; $round++) {
            for ($i = 0; $i < 4; $i++) {
                $this->assertError($c->post('/api/v1/org/sessions', ['loginId' => 'example-univ', 'password' => 'wrong-password-123']), 401, 'INVALID_CREDENTIALS');
            }
            $this->orgLogin($c, 'example-univ');
        }
    }

    public function testIpFailureLimitBlocksFurtherAttempts(): void
    {
        $c = $this->client();
        for ($i = 0; $i < 20; $i++) {
            $this->assertError($c->post('/api/v1/org/sessions', ['loginId' => 'nobody' . $i . 'xx', 'password' => 'wrong-password-123']), 401, 'INVALID_CREDENTIALS');
        }
        $blocked = $c->post('/api/v1/org/sessions', ['loginId' => 'nobody-again', 'password' => 'wrong-password-123']);
        $this->assertError($blocked, 429, 'RATE_LIMITED');
        $this->assertNotNull($blocked->header('Retry-After'));
        // 別の IP は影響を受けない。
        $this->createOrganization('A大学', 'example-univ');
        $this->orgLogin($this->client('203.0.113.9'), 'example-univ');
    }

    public function testRequestsWithoutSessionAreUnauthenticated(): void
    {
        $c = $this->client();
        $this->assertError($c->get('/api/v1/org/sessions/current'), 401, 'UNAUTHENTICATED');
        $this->assertError($c->get('/api/v1/org/members'), 401, 'UNAUTHENTICATED');
        $c->cookies['org-sid'] = str_repeat('a', 43);
        $response = $c->get('/api/v1/org/sessions/current');
        $this->assertError($response, 401, 'UNAUTHENTICATED');
        $this->assertStringContainsString('Max-Age=0', $response->setCookies()[0]);
    }

    public function testFamilyAndOrganizationCookiesAreSeparate(): void
    {
        $this->createOrganization('A大学', 'example-univ');
        $org = $this->client();
        $this->orgLogin($org, 'example-univ');
        $family = $this->client();
        $this->registerFamily($family);

        // 家族の Cookie では組織の API を、組織の Cookie では家族の API を、呼べない。
        $mixed = $this->client();
        $mixed->cookies['org-sid'] = $family->cookies['sid'];
        $mixed->cookies['sid'] = $org->cookies['org-sid'];
        $this->assertError($mixed->get('/api/v1/org/sessions/current'), 401, 'UNAUTHENTICATED');
        $this->assertError($mixed->get('/api/v1/sessions/current'), 401, 'UNAUTHENTICATED');
        $this->assertSame(200, $org->get('/api/v1/org/sessions/current')->status());
        $this->assertSame(200, $family->get('/api/v1/sessions/current')->status());
    }

    public function testLoginReplacesTheSessionOfTheSameBrowser(): void
    {
        $this->createOrganization('A大学', 'example-univ');
        $c = $this->client();
        $this->orgLogin($c, 'example-univ');
        $first = $c->cookies['org-sid'];
        $this->orgLogin($c, 'example-univ');
        $this->assertNotSame($first, $c->cookies['org-sid']);

        $old = $this->client();
        $old->cookies['org-sid'] = $first;
        $this->assertError($old->get('/api/v1/org/sessions/current'), 401, 'UNAUTHENTICATED');
    }

    public function testLogoutDeletesTheSession(): void
    {
        $this->createOrganization('A大学', 'example-univ');
        $c = $this->client();
        $this->orgLogin($c, 'example-univ');
        $token = $c->cookies['org-sid'];

        $response = $c->delete('/api/v1/org/sessions/current');
        $this->assertSame(204, $response->status());
        $this->assertStringContainsString('Max-Age=0', $response->setCookies()[0]);
        $this->assertSame([], $c->cookies);

        $replay = $this->client();
        $replay->cookies['org-sid'] = $token;
        $this->assertError($replay->get('/api/v1/org/sessions/current'), 401, 'UNAUTHENTICATED');
    }

    public function testSessionLifetimeIsEightHoursIdleAndTwentyFourHoursMax(): void
    {
        $this->createOrganization('A大学', 'example-univ');
        $c = $this->client();
        $this->orgLogin($c, 'example-univ');

        // 5分未満の間隔のアクセスでは、延長しない。7時間ごとに使い続ければ、24時間までは有効。
        for ($i = 0; $i < 3; $i++) {
            $this->clock->advance('+7 hours');
            $this->assertSame(200, $c->get('/api/v1/org/sessions/current')->status());
        }
        // 作成から21時間。さらに4時間後（25時間）は、スライディングしていても、最大の24時間を超えるため無効。
        $this->clock->advance('+4 hours');
        $this->assertError($c->get('/api/v1/org/sessions/current'), 401, 'UNAUTHENTICATED');

        $idle = $this->client();
        $this->orgLogin($idle, 'example-univ');
        $this->clock->advance('+8 hours +1 minute');
        $this->assertError($idle->get('/api/v1/org/sessions/current'), 401, 'UNAUTHENTICATED');
    }

    public function testNewOrganizationMustChangePasswordFirst(): void
    {
        $this->createOrganization('A大学', 'example-univ', changeRequired: true);
        $c = $this->client();
        $login = $this->orgLogin($c, 'example-univ');
        $this->assertTrue($login['organization']['passwordChangeRequired']);

        $this->assertError($c->get('/api/v1/org/members'), 403, 'PASSWORD_CHANGE_REQUIRED');
        $this->assertError($c->get('/api/v1/org/invitations'), 403, 'PASSWORD_CHANGE_REQUIRED');
        $this->assertError($c->post('/api/v1/org/elevation', ['password' => self::PASSWORD]), 403, 'PASSWORD_CHANGE_REQUIRED');
        $this->assertSame(200, $c->get('/api/v1/org/sessions/current')->status());

        $this->assertSame(204, $c->put('/api/v1/org/password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'a-brand-new-passphrase'])->status());
        $this->assertSame(200, $c->get('/api/v1/org/members')->status());
        $this->assertFalse($c->get('/api/v1/org/sessions/current')->json()['organization']['passwordChangeRequired']);
        $this->orgLogin($this->client(), 'example-univ', 'a-brand-new-passphrase');
    }

    public function testPasswordChangeValidation(): void
    {
        $this->createOrganization('A大学', 'example-univ');
        $c = $this->client();
        $this->orgLogin($c, 'example-univ');

        $short = $c->put('/api/v1/org/password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'short-11-ch']);
        $this->assertError($short, 422, 'VALIDATION_FAILED');
        $this->assertSame('TOO_SHORT', $short->json()['error']['details'][0]['code']);
        $long = $c->put('/api/v1/org/password', ['currentPassword' => self::PASSWORD, 'newPassword' => str_repeat('a', 129)]);
        $this->assertSame('TOO_LONG', $long->json()['error']['details'][0]['code']);
        $same = $c->put('/api/v1/org/password', ['currentPassword' => self::PASSWORD, 'newPassword' => self::PASSWORD]);
        $this->assertError($same, 422, 'VALIDATION_FAILED');
        $this->assertSame('SAME_PASSWORD', $same->json()['error']['details'][0]['code']);
        $this->assertError($c->put('/api/v1/org/password', ['currentPassword' => 'not-the-password-1', 'newPassword' => 'another-new-passphrase']), 401, 'INVALID_CREDENTIALS');

        // 12文字ちょうど、128文字ちょうど、前後の空白を含むパスワードは、そのまま使える。
        $this->assertSame(204, $c->put('/api/v1/org/password', ['currentPassword' => self::PASSWORD, 'newPassword' => ' twelve chars ' . str_repeat('x', 114)])->status());
        $this->assertSame(204, $c->put('/api/v1/org/password', ['currentPassword' => ' twelve chars ' . str_repeat('x', 114), 'newPassword' => '123456789012'])->status());
    }

    public function testPasswordChangeLogsOutOtherDevicesButNotThisOne(): void
    {
        $this->createOrganization('A大学', 'example-univ');
        $a = $this->client();
        $b = $this->client('203.0.113.7');
        $this->orgLogin($a, 'example-univ');
        $this->orgLogin($b, 'example-univ');

        $this->assertSame(204, $a->put('/api/v1/org/password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'a-brand-new-passphrase'])->status());
        $this->assertSame(200, $a->get('/api/v1/org/sessions/current')->status());
        $this->assertError($b->get('/api/v1/org/sessions/current'), 401, 'UNAUTHENTICATED');
    }

    public function testWrongCurrentPasswordCountsTowardTheLock(): void
    {
        $this->createOrganization('A大学', 'example-univ');
        $c = $this->client();
        $this->orgLogin($c, 'example-univ');
        for ($i = 0; $i < 5; $i++) {
            $this->assertError($c->put('/api/v1/org/password', ['currentPassword' => 'not-the-password-1', 'newPassword' => 'another-new-passphrase']), 401, 'INVALID_CREDENTIALS');
        }
        $this->assertError($c->put('/api/v1/org/password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'another-new-passphrase']), 429, 'ORGANIZATION_PASSWORD_LOCKED');
        $this->assertError($c->post('/api/v1/org/elevation', ['password' => self::PASSWORD]), 429, 'ORGANIZATION_PASSWORD_LOCKED');
    }

    public function testElevationLastsFiveMinutes(): void
    {
        $this->createOrganization('A大学', 'example-univ');
        $c = $this->client();
        $this->orgLogin($c, 'example-univ');

        $this->assertError($c->post('/api/v1/org/elevation', ['password' => 'not-the-password-1']), 401, 'INVALID_CREDENTIALS');
        $this->assertError($c->post('/api/v1/org/elevation', ['password' => '']), 422, 'VALIDATION_FAILED');
        $ok = $c->post('/api/v1/org/elevation', ['password' => self::PASSWORD]);
        $this->assertSame(200, $ok->status(), $ok->body());
        $this->assertSame(\UecTst\Support\Time::toIso($this->clock->now()->modify('+5 minutes')), $ok->json()['elevatedUntil']);
        $this->assertSame($ok->json()['elevatedUntil'], $c->get('/api/v1/org/sessions/current')->json()['session']['elevatedUntil']);

        $this->clock->advance('+6 minutes');
        $this->assertNull($c->get('/api/v1/org/sessions/current')->json()['session']['elevatedUntil']);
    }

    public function testOperationsAreLoggedWithoutSecrets(): void
    {
        $this->createOrganization('A大学', 'example-univ');
        $c = $this->client();
        $this->orgLogin($c, 'example-univ');
        $c->post('/api/v1/org/sessions', ['loginId' => 'example-univ', 'password' => 'wrong-password-123']);
        $log = (string) file_get_contents($this->logFile);

        $this->assertStringContainsString('org.login', $log);
        $this->assertStringContainsString('"result":"failure"', $log);
        $this->assertStringNotContainsString(self::PASSWORD, $log);
        $this->assertStringNotContainsString('wrong-password-123', $log);
        $this->assertStringNotContainsString($c->cookies['org-sid'], $log);
    }
}
