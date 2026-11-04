<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

/** ファミリー認証の、境界・失敗系。 */
final class FamilyAuthEdgeTest extends ApiTestCase
{
    public function testRegistrationTokenIsOneTimeUse(): void
    {
        $c = $this->client();
        $this->registerFamily($c);
        $token = $this->mailer->lastRegistrationToken();

        $again = $this->client('198.51.100.9')->post('/api/v1/registrations/complete', ['token' => $token, 'users' => [['name' => 'x']]]);
        $this->assertContains($again->status(), [404, 410], $again->body());
    }

    public function testExpiredRegistrationTokenIsGone(): void
    {
        $c = $this->client();
        $c->post('/api/v1/registrations', ['email' => 'a@example.com', 'captchaToken' => 'ok']);
        $token = $this->mailer->lastRegistrationToken();
        $this->clock->advance('+25 hours');

        $r = $c->post('/api/v1/registrations/complete', ['token' => $token, 'users' => [['name' => 'x']]]);
        $this->assertContains($r->status(), [404, 410], $r->body());
    }

    public function testMailFailureReturns503(): void
    {
        $this->mailer->failNext = true;
        $r = $this->client()->post('/api/v1/registrations', ['email' => 'a@example.com', 'captchaToken' => 'ok']);
        $this->assertSame(503, $r->status(), $r->body());
        $this->assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM pending_registrations')->fetchColumn());
    }

    public function testLoginFailuresAreRateLimitedPerIp(): void
    {
        $c = $this->client('203.0.113.7');
        $wrong = \UecTst\Security\RecoveryCode::generate();
        $last = null;
        for ($i = 0; $i < 25; $i++) {
            $last = $c->post('/api/v1/sessions', ['recoveryCode' => $wrong]);
        }
        $this->assertSame(429, $last->status(), $last->body());
    }

    public function testMalformedRecoveryCodeIsValidationErrorNotCounted(): void
    {
        $c = $this->client('203.0.113.8');
        for ($i = 0; $i < 30; $i++) {
            $r = $c->post('/api/v1/sessions', ['recoveryCode' => 'short']);
            $this->assertSame(422, $r->status(), $r->body());
        }
    }

    public function testCannotAddMoreThanFourUsers(): void
    {
        $c = $this->client();
        $this->registerFamily($c, ['a', 'b', 'c', 'd']);
        $r = $c->post('/api/v1/users', ['name' => 'e']);
        $this->assertContains($r->status(), [409, 422], $r->body());
    }

    public function testCsrfOriginIsEnforced(): void
    {
        $c = $this->client();
        $r = $c->request('POST', '/api/v1/registrations', ['email' => 'a@example.com', 'captchaToken' => 'ok'], ['origin' => 'https://evil.example']);
        $this->assertSame(403, $r->status(), $r->body());
    }

    public function testSessionExpiresAfterOneYearOfInactivity(): void
    {
        $c = $this->client();
        $this->registerFamily($c);
        $this->clock->advance('+366 days');
        $this->assertError($c->get('/api/v1/users'), 401, 'UNAUTHENTICATED');
    }

    public function testElevationExpiresAfterFiveMinutes(): void
    {
        $c = $this->client();
        $reg = $this->registerFamily($c);
        $this->elevate($c, $reg['recoveryCode']);
        $this->clock->advance('+6 minutes');
        $this->assertSame(403, $c->delete('/api/v1/family')->status());
    }
}
