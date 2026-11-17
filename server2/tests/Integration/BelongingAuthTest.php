<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

/** 所属のログイン・パスワード・確認（B1・B4〜B7）。 */
final class BelongingAuthTest extends BlgApiTestCase
{
    public function testNormalBelongingLogsInAtStageOneWithSessionCookie(): void
    {
        $this->createBelonging('○○大学', 'example-univ');
        $c = $this->client();
        $response = $c->post('/api/v1/blg/sessions', ['loginId' => 'example-univ', 'password' => self::PASSWORD]);
        $json = $response->json();

        $this->assertSame(201, $response->status(), $response->body());
        $this->assertSame(1, $json['authStage']);
        $this->assertFalse($json['passkeyRegistered']);
        $this->assertSame('○○大学', $json['belonging']['name']);
        $this->assertFalse($json['belonging']['isSuper']);
        $this->assertArrayNotHasKey('password', $json['belonging']);

        // 所属の Cookie は、家族の Cookie とは別の名前で、有効期限を持たない（ブラウザを閉じると消える）。
        $cookie = $response->setCookies()[0];
        $this->assertStringStartsWith('blg-sid=', $cookie);
        $this->assertStringNotContainsString('Max-Age', $cookie);
        $this->assertStringContainsString('HttpOnly', $cookie);
        $this->assertStringContainsString('SameSite=Lax', $cookie);
        $this->assertArrayNotHasKey('sid', $c->cookies);

        $current = $c->get('/api/v1/blg/sessions/current');
        $this->assertSame(200, $current->status(), $current->body());
        $this->assertSame(1, $current->json()['session']['authStage']);
        $this->assertNull($current->json()['session']['elevatedUntil']);
        $this->assertSame('example-univ', $current->json()['belonging']['loginId']);
    }

    public function testLoginIdIsCaseInsensitive(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $this->blgLogin($this->client(), '  Example-UNIV ');
    }

    public function testUnknownLoginIdAndWrongPasswordAreIndistinguishable(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $c = $this->client();
        $unknown = $c->post('/api/v1/blg/sessions', ['loginId' => 'nobody-here', 'password' => 'whatever-password']);
        $wrong = $c->post('/api/v1/blg/sessions', ['loginId' => 'example-univ', 'password' => 'wrong-password-123']);
        $this->assertError($unknown, 401, 'INVALID_CREDENTIALS');
        $this->assertError($wrong, 401, 'INVALID_CREDENTIALS');
        $this->assertSame($unknown->json()['error']['message'], $wrong->json()['error']['message']);
        $this->assertSame([], $c->cookies);
    }

    public function testEmptyFieldsAreValidationErrorsAndWrongTypesAreBadRequests(): void
    {
        $c = $this->client();
        $this->assertError($c->post('/api/v1/blg/sessions', ['loginId' => '', 'password' => 'x']), 422, 'VALIDATION_FAILED');
        $this->assertError($c->post('/api/v1/blg/sessions', ['loginId' => 'abc', 'password' => '']), 422, 'VALIDATION_FAILED');
        $this->assertError($c->post('/api/v1/blg/sessions', ['loginId' => 5, 'password' => 'x']), 400, 'BAD_REQUEST');
    }

    public function testFiveFailuresLockThePasswordForFifteenMinutes(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $c = $this->client();
        for ($i = 0; $i < 5; $i++) {
            $this->assertError($c->post('/api/v1/blg/sessions', ['loginId' => 'example-univ', 'password' => 'wrong-password-123']), 401, 'INVALID_CREDENTIALS');
        }
        // ロック中は、正しいパスワードでも拒否される。
        $locked = $c->post('/api/v1/blg/sessions', ['loginId' => 'example-univ', 'password' => self::PASSWORD]);
        $this->assertError($locked, 429, 'BELONGING_PASSWORD_LOCKED');
        $this->assertGreaterThan(0, (int) $locked->header('Retry-After'));
        $this->assertLessThanOrEqual(900, (int) $locked->header('Retry-After'));

        $this->clock->advance('+14 minutes');
        $this->assertError($c->post('/api/v1/blg/sessions', ['loginId' => 'example-univ', 'password' => self::PASSWORD]), 429, 'BELONGING_PASSWORD_LOCKED');
        $this->clock->advance('+2 minutes');
        $this->blgLogin($c, 'example-univ');
    }

    public function testSuccessResetsTheFailureCount(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $c = $this->client();
        for ($round = 0; $round < 3; $round++) {
            for ($i = 0; $i < 4; $i++) {
                $this->assertError($c->post('/api/v1/blg/sessions', ['loginId' => 'example-univ', 'password' => 'wrong-password-123']), 401, 'INVALID_CREDENTIALS');
            }
            $this->blgLogin($c, 'example-univ');
        }
    }

    public function testIpFailureLimitBlocksFurtherAttempts(): void
    {
        $c = $this->client();
        for ($i = 0; $i < 20; $i++) {
            $this->assertError($c->post('/api/v1/blg/sessions', ['loginId' => 'nobody' . $i . 'xx', 'password' => 'wrong-password-123']), 401, 'INVALID_CREDENTIALS');
        }
        $blocked = $c->post('/api/v1/blg/sessions', ['loginId' => 'nobody-again', 'password' => 'wrong-password-123']);
        $this->assertError($blocked, 429, 'RATE_LIMITED');
        $this->assertNotNull($blocked->header('Retry-After'));
        // 別の IP は影響を受けない。
        $this->createBelonging('A大学', 'example-univ');
        $this->blgLogin($this->client('203.0.113.9'), 'example-univ');
    }

    public function testRequestsWithoutSessionAreUnauthenticated(): void
    {
        $c = $this->client();
        $this->assertError($c->get('/api/v1/blg/sessions/current'), 401, 'UNAUTHENTICATED');
        $this->assertError($c->get('/api/v1/blg/members'), 401, 'UNAUTHENTICATED');
        $c->cookies['blg-sid'] = str_repeat('a', 43);
        $response = $c->get('/api/v1/blg/sessions/current');
        $this->assertError($response, 401, 'UNAUTHENTICATED');
        $this->assertStringContainsString('Max-Age=0', $response->setCookies()[0]);
    }

    public function testFamilyAndBelongingCookiesAreSeparate(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $blg = $this->client();
        $this->blgLogin($blg, 'example-univ');
        $family = $this->client();
        $this->registerFamily($family);

        // 家族の Cookie では所属の API を、所属の Cookie では家族の API を、呼べない。
        $mixed = $this->client();
        $mixed->cookies['blg-sid'] = $family->cookies['sid'];
        $mixed->cookies['sid'] = $blg->cookies['blg-sid'];
        $this->assertError($mixed->get('/api/v1/blg/sessions/current'), 401, 'UNAUTHENTICATED');
        $this->assertError($mixed->get('/api/v1/sessions/current'), 401, 'UNAUTHENTICATED');
        $this->assertSame(200, $blg->get('/api/v1/blg/sessions/current')->status());
        $this->assertSame(200, $family->get('/api/v1/sessions/current')->status());
    }

    public function testLoginReplacesTheSessionOfTheSameBrowser(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $c = $this->client();
        $this->blgLogin($c, 'example-univ');
        $first = $c->cookies['blg-sid'];
        $this->blgLogin($c, 'example-univ');
        $this->assertNotSame($first, $c->cookies['blg-sid']);

        $old = $this->client();
        $old->cookies['blg-sid'] = $first;
        $this->assertError($old->get('/api/v1/blg/sessions/current'), 401, 'UNAUTHENTICATED');
    }

    public function testLogoutDeletesTheSession(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $c = $this->client();
        $this->blgLogin($c, 'example-univ');
        $token = $c->cookies['blg-sid'];

        $response = $c->delete('/api/v1/blg/sessions/current');
        $this->assertSame(204, $response->status());
        $this->assertStringContainsString('Max-Age=0', $response->setCookies()[0]);
        $this->assertSame([], $c->cookies);

        $replay = $this->client();
        $replay->cookies['blg-sid'] = $token;
        $this->assertError($replay->get('/api/v1/blg/sessions/current'), 401, 'UNAUTHENTICATED');
    }

    public function testSessionLifetimeIsEightHoursIdleAndTwentyFourHoursMax(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $c = $this->client();
        $this->blgLogin($c, 'example-univ');

        // 5分未満の間隔のアクセスでは、延長しない。7時間ごとに使い続ければ、24時間までは有効。
        for ($i = 0; $i < 3; $i++) {
            $this->clock->advance('+7 hours');
            $this->assertSame(200, $c->get('/api/v1/blg/sessions/current')->status());
        }
        // 作成から21時間。さらに4時間後（25時間）は、スライディングしていても、最大の24時間を超えるため無効。
        $this->clock->advance('+4 hours');
        $this->assertError($c->get('/api/v1/blg/sessions/current'), 401, 'UNAUTHENTICATED');

        $idle = $this->client();
        $this->blgLogin($idle, 'example-univ');
        $this->clock->advance('+8 hours +1 minute');
        $this->assertError($idle->get('/api/v1/blg/sessions/current'), 401, 'UNAUTHENTICATED');
    }

    public function testNewBelongingMustChangePasswordFirst(): void
    {
        $this->createBelonging('A大学', 'example-univ', changeRequired: true);
        $c = $this->client();
        $login = $this->blgLogin($c, 'example-univ');
        $this->assertTrue($login['belonging']['passwordChangeRequired']);

        $this->assertError($c->get('/api/v1/blg/members'), 403, 'PASSWORD_CHANGE_REQUIRED');
        $this->assertError($c->get('/api/v1/blg/invitations'), 403, 'PASSWORD_CHANGE_REQUIRED');
        $this->assertError($c->post('/api/v1/blg/elevation', ['password' => self::PASSWORD]), 403, 'PASSWORD_CHANGE_REQUIRED');
        $this->assertSame(200, $c->get('/api/v1/blg/sessions/current')->status());

        $this->assertSame(204, $c->put('/api/v1/blg/password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'a-brand-new-passphrase'])->status());
        $this->assertSame(200, $c->get('/api/v1/blg/members')->status());
        $this->assertFalse($c->get('/api/v1/blg/sessions/current')->json()['belonging']['passwordChangeRequired']);
        $this->blgLogin($this->client(), 'example-univ', 'a-brand-new-passphrase');
    }

    public function testPasswordChangeValidation(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $c = $this->client();
        $this->blgLogin($c, 'example-univ');

        $short = $c->put('/api/v1/blg/password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'short-11-ch']);
        $this->assertError($short, 422, 'VALIDATION_FAILED');
        $this->assertSame('TOO_SHORT', $short->json()['error']['details'][0]['code']);
        $long = $c->put('/api/v1/blg/password', ['currentPassword' => self::PASSWORD, 'newPassword' => str_repeat('a', 129)]);
        $this->assertSame('TOO_LONG', $long->json()['error']['details'][0]['code']);
        $same = $c->put('/api/v1/blg/password', ['currentPassword' => self::PASSWORD, 'newPassword' => self::PASSWORD]);
        $this->assertError($same, 422, 'VALIDATION_FAILED');
        $this->assertSame('SAME_PASSWORD', $same->json()['error']['details'][0]['code']);
        $this->assertError($c->put('/api/v1/blg/password', ['currentPassword' => 'not-the-password-1', 'newPassword' => 'another-new-passphrase']), 401, 'INVALID_CREDENTIALS');

        // 12文字ちょうど、128文字ちょうど、前後の空白を含むパスワードは、そのまま使える。
        $this->assertSame(204, $c->put('/api/v1/blg/password', ['currentPassword' => self::PASSWORD, 'newPassword' => ' twelve chars ' . str_repeat('x', 114)])->status());
        $this->assertSame(204, $c->put('/api/v1/blg/password', ['currentPassword' => ' twelve chars ' . str_repeat('x', 114), 'newPassword' => '123456789012'])->status());
    }

    public function testPasswordChangeLogsOutOtherDevicesButNotThisOne(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $a = $this->client();
        $b = $this->client('203.0.113.7');
        $this->blgLogin($a, 'example-univ');
        $this->blgLogin($b, 'example-univ');

        $this->assertSame(204, $a->put('/api/v1/blg/password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'a-brand-new-passphrase'])->status());
        $this->assertSame(200, $a->get('/api/v1/blg/sessions/current')->status());
        $this->assertError($b->get('/api/v1/blg/sessions/current'), 401, 'UNAUTHENTICATED');
    }

    public function testWrongCurrentPasswordCountsTowardTheLock(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $c = $this->client();
        $this->blgLogin($c, 'example-univ');
        for ($i = 0; $i < 5; $i++) {
            $this->assertError($c->put('/api/v1/blg/password', ['currentPassword' => 'not-the-password-1', 'newPassword' => 'another-new-passphrase']), 401, 'INVALID_CREDENTIALS');
        }
        $this->assertError($c->put('/api/v1/blg/password', ['currentPassword' => self::PASSWORD, 'newPassword' => 'another-new-passphrase']), 429, 'BELONGING_PASSWORD_LOCKED');
        $this->assertError($c->post('/api/v1/blg/elevation', ['password' => self::PASSWORD]), 429, 'BELONGING_PASSWORD_LOCKED');
    }

    public function testElevationLastsFiveMinutes(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $c = $this->client();
        $this->blgLogin($c, 'example-univ');

        $this->assertError($c->post('/api/v1/blg/elevation', ['password' => 'not-the-password-1']), 401, 'INVALID_CREDENTIALS');
        $this->assertError($c->post('/api/v1/blg/elevation', ['password' => '']), 422, 'VALIDATION_FAILED');
        $ok = $c->post('/api/v1/blg/elevation', ['password' => self::PASSWORD]);
        $this->assertSame(200, $ok->status(), $ok->body());
        $this->assertSame(\UecTst\Support\Time::toIso($this->clock->now()->modify('+5 minutes')), $ok->json()['elevatedUntil']);
        $this->assertSame($ok->json()['elevatedUntil'], $c->get('/api/v1/blg/sessions/current')->json()['session']['elevatedUntil']);

        $this->clock->advance('+6 minutes');
        $this->assertNull($c->get('/api/v1/blg/sessions/current')->json()['session']['elevatedUntil']);
    }

    public function testOperationsAreLoggedWithoutSecrets(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $c = $this->client();
        $this->blgLogin($c, 'example-univ');
        $c->post('/api/v1/blg/sessions', ['loginId' => 'example-univ', 'password' => 'wrong-password-123']);
        $log = (string) file_get_contents($this->logFile);

        $this->assertStringContainsString('blg.login', $log);
        $this->assertStringContainsString('"result":"failure"', $log);
        $this->assertStringNotContainsString(self::PASSWORD, $log);
        $this->assertStringNotContainsString('wrong-password-123', $log);
        $this->assertStringNotContainsString($c->cookies['blg-sid'], $log);
    }
}
