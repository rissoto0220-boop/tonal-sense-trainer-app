<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use UecTst\Tests\Support\TestClient;

/** 招待（O12〜O14）、招待の照合・所属・解除（#28〜#31）、招待経由の本登録、所属している家族の管理（O15・O16）。 */
final class OrgInvitationTest extends OrgApiTestCase
{
    private function orgClient(string $name = '○○大学', string $loginId = 'example-univ'): TestClient
    {
        $this->createOrganization($name, $loginId);
        $c = $this->client('203.0.113.50');
        $this->orgLogin($c, $loginId);
        return $c;
    }

    public function testSendInvitationMailsALinkWithTheTokenInTheFragment(): void
    {
        $org = $this->orgClient();
        $r = $org->post('/api/v1/org/invitations', ['email' => 'invitee@example.com']);
        $this->assertSame(202, $r->status(), $r->body());
        $this->assertSame('no-reply@example.com', $r->json()['sender']);
        $this->assertSame(\UecTst\Support\Time::toIso($this->clock->now()->modify('+7 days')), $r->json()['expiresAt']);

        $mail = end($this->mailer->sent);
        $this->assertSame('invitee@example.com', $mail['to']);
        $this->assertStringContainsString('○○大学', $mail['subject']);
        $this->assertStringContainsString('○○大学', $mail['body']);
        $this->assertMatchesRegularExpression('#http://localhost:8888/invite\#token=[A-Za-z0-9_-]{43}#', $mail['body']);

        $this->assertSame(['pendingCount' => 1], $org->get('/api/v1/org/invitations')->json());
        // 送信成功時は、メールアドレスをログに残さない。DB にも、保存しない。
        $this->assertStringNotContainsString('invitee@example.com', (string) file_get_contents($this->logFile));
        $columns = $this->pdo->query('SHOW COLUMNS FROM organization_invitations')->fetchAll(\PDO::FETCH_COLUMN);
        $this->assertSame(['id', 'organization_id', 'token_hash', 'expires_at'], $columns);
    }

    public function testInvalidEmailAndMailFailure(): void
    {
        $org = $this->orgClient();
        $this->assertError($org->post('/api/v1/org/invitations', ['email' => 'not-an-email']), 422, 'VALIDATION_FAILED');
        $this->assertError($org->post('/api/v1/org/invitations', ['email' => 5]), 400, 'BAD_REQUEST');
        $this->assertSame(0, $org->get('/api/v1/org/invitations')->json()['pendingCount']);

        $this->mailer->failNext = true;
        $this->assertError($org->post('/api/v1/org/invitations', ['email' => 'invitee@example.com']), 503, 'MAIL_SEND_FAILED');
        $this->assertSame(0, $org->get('/api/v1/org/invitations')->json()['pendingCount']);
        // 失敗時は、サポートのため、メールアドレスと理由を記録する。
        $log = (string) file_get_contents($this->logFile);
        $this->assertStringContainsString('招待メールの送信に失敗しました', $log);
        $this->assertStringContainsString('invitee@example.com', $log);
    }

    public function testSendingIsLimitedPerOrganization(): void
    {
        $org = $this->orgClient();
        for ($i = 0; $i < 100; $i++) {
            $this->assertSame(202, $org->post('/api/v1/org/invitations', ['email' => "u{$i}@example.com"])->status());
        }
        $blocked = $org->post('/api/v1/org/invitations', ['email' => 'one-more@example.com']);
        $this->assertError($blocked, 429, 'RATE_LIMITED');
        $this->assertNotNull($blocked->header('Retry-After'));
        $this->assertSame(100, $org->get('/api/v1/org/invitations')->json()['pendingCount']);
    }

    public function testRevokeCancelsOnlyPendingInvitationsOfThisOrganization(): void
    {
        $a = $this->orgClient();
        $this->createOrganization('△△研究室', 'other-lab');
        $b = $this->client('203.0.113.51');
        $this->orgLogin($b, 'other-lab');

        $a->post('/api/v1/org/invitations', ['email' => 'a1@example.com']);
        $tokenA = $this->mailer->lastInvitationToken();
        $a->post('/api/v1/org/invitations', ['email' => 'a2@example.com']);
        $b->post('/api/v1/org/invitations', ['email' => 'b1@example.com']);
        $tokenB = $this->mailer->lastInvitationToken();

        $this->assertSame(['revokedCount' => 2], $a->delete('/api/v1/org/invitations')->json());
        $this->assertSame(0, $a->get('/api/v1/org/invitations')->json()['pendingCount']);
        $this->assertSame(1, $b->get('/api/v1/org/invitations')->json()['pendingCount']);

        $anon = $this->client();
        $this->assertError($anon->post('/api/v1/invitations/verify', ['token' => $tokenA]), 410, 'INVITATION_INVALID');
        $this->assertSame(200, $anon->post('/api/v1/invitations/verify', ['token' => $tokenB])->status());
    }

    public function testExpiredInvitationsAreNotCountedOrAccepted(): void
    {
        $org = $this->orgClient();
        $org->post('/api/v1/org/invitations', ['email' => 'a@example.com']);
        $token = $this->mailer->lastInvitationToken();
        $this->clock->advance('+6 days');
        $this->orgLogin($org, 'example-univ'); // 組織のセッションは、最大24時間
        $this->assertSame(1, $org->get('/api/v1/org/invitations')->json()['pendingCount']);
        $this->assertSame(200, $this->client()->post('/api/v1/invitations/verify', ['token' => $token])->status());

        $this->clock->advance('+2 days');
        $this->orgLogin($org, 'example-univ');
        $this->assertSame(0, $org->get('/api/v1/org/invitations')->json()['pendingCount']);
        $this->assertError($this->client()->post('/api/v1/invitations/verify', ['token' => $token]), 410, 'INVITATION_INVALID');
    }

    public function testVerifyDoesNotConsumeAndReturnsTheOrganizationName(): void
    {
        $org = $this->orgClient();
        $org->post('/api/v1/org/invitations', ['email' => 'a@example.com']);
        $token = $this->mailer->lastInvitationToken();
        $anon = $this->client();

        for ($i = 0; $i < 3; $i++) {
            $r = $anon->post('/api/v1/invitations/verify', ['token' => $token]);
            $this->assertSame(200, $r->status(), $r->body());
            $this->assertSame('○○大学', $r->json()['organizationName']);
        }
        $this->assertSame(1, $org->get('/api/v1/org/invitations')->json()['pendingCount']);
        $this->assertError($anon->post('/api/v1/invitations/verify', ['token' => str_repeat('A', 43)]), 410, 'INVITATION_INVALID');
        $this->assertError($anon->post('/api/v1/invitations/verify', ['token' => 'short']), 410, 'INVITATION_INVALID');
        // 本登録のトークンでは、招待の照合はできない。
        $anon->post('/api/v1/registrations', ['email' => 'p@example.com', 'captchaToken' => 'ok']);
        $this->assertError($anon->post('/api/v1/invitations/verify', ['token' => $this->mailer->lastRegistrationToken()]), 410, 'INVITATION_INVALID');
    }

    public function testRegistrationViaInvitationJoinsTheOrganizationAndConsumesTheInvitation(): void
    {
        $org = $this->orgClient();
        $org->post('/api/v1/org/invitations', ['email' => 'a@example.com']);
        $token = $this->mailer->lastInvitationToken();

        $family = $this->client();
        $r = $family->post('/api/v1/registrations/complete', ['invitationToken' => $token, 'users' => [['name' => 'おとうさん'], ['name' => 'はなこ']]]);
        $this->assertSame(201, $r->status(), $r->body());
        $this->assertSame('○○大学', $r->json()['family']['organization']['name']);
        $this->assertNotEmpty($r->json()['recoveryCode']);
        $this->assertSame('○○大学', $family->get('/api/v1/organization-membership')->json()['organization']['name']);
        $this->assertSame(0, $org->get('/api/v1/org/invitations')->json()['pendingCount']);

        // 招待は使い切り。
        $second = $this->client('203.0.113.60');
        $this->assertError($second->post('/api/v1/registrations/complete', ['invitationToken' => $token, 'users' => [['name' => 'ほか']]]), 410, 'INVITATION_INVALID');
    }

    public function testRegistrationViaInvitationValidatesInputBeforeConsumingTheInvitation(): void
    {
        $org = $this->orgClient();
        $org->post('/api/v1/org/invitations', ['email' => 'a@example.com']);
        $token = $this->mailer->lastInvitationToken();
        $family = $this->client();

        $this->assertError($family->post('/api/v1/registrations/complete', ['invitationToken' => $token, 'users' => []]), 422, 'VALIDATION_FAILED');
        $this->assertError($family->post('/api/v1/registrations/complete', ['invitationToken' => $token, 'token' => $token, 'users' => [['name' => 'a']]]), 400, 'BAD_REQUEST');
        $this->assertError($family->post('/api/v1/registrations/complete', ['users' => [['name' => 'a']]]), 400, 'BAD_REQUEST');
        $this->assertSame(1, $org->get('/api/v1/org/invitations')->json()['pendingCount']);
        $this->assertSame(201, $family->post('/api/v1/registrations/complete', ['invitationToken' => $token, 'users' => [['name' => 'a']]])->status());
    }

    public function testRegistrationTokenIsNotAnInvitationAndViceVersa(): void
    {
        $org = $this->orgClient();
        $org->post('/api/v1/org/invitations', ['email' => 'a@example.com']);
        $invitation = $this->mailer->lastInvitationToken();
        $family = $this->client();
        $this->assertError($family->post('/api/v1/registrations/complete', ['token' => $invitation, 'users' => [['name' => 'a']]]), 410, 'REGISTRATION_TOKEN_INVALID');

        $family->post('/api/v1/registrations', ['email' => 'p@example.com', 'captchaToken' => 'ok']);
        $registration = $this->mailer->lastRegistrationToken();
        $this->assertError($family->post('/api/v1/registrations/complete', ['invitationToken' => $registration, 'users' => [['name' => 'a']]]), 410, 'INVITATION_INVALID');
        $this->assertSame(1, $org->get('/api/v1/org/invitations')->json()['pendingCount']);
    }

    public function testExistingFamilyJoinsWithElevationAndMovesBetweenOrganizations(): void
    {
        $a = $this->orgClient();
        $this->createOrganization('△△研究室', 'other-lab');
        $b = $this->client('203.0.113.51');
        $this->orgLogin($b, 'other-lab');

        $family = $this->client();
        $reg = $this->registerFamily($family);
        $this->assertNull($family->get('/api/v1/organization-membership')->json()['organization']);

        $a->post('/api/v1/org/invitations', ['email' => 'x@example.com']);
        $tokenA = $this->mailer->lastInvitationToken();
        $this->assertError($family->post('/api/v1/organization-membership', ['invitationToken' => $tokenA]), 403, 'ELEVATION_REQUIRED');
        $this->elevate($family, $reg['recoveryCode']);
        $joined = $family->post('/api/v1/organization-membership', ['invitationToken' => $tokenA]);
        $this->assertSame(200, $joined->status(), $joined->body());
        $this->assertSame('○○大学', $joined->json()['organization']['name']);
        $this->assertNull($joined->json()['previousOrganization']);
        $this->assertSame(0, $a->get('/api/v1/org/invitations')->json()['pendingCount']);
        $this->assertCount(1, $a->get('/api/v1/org/members')->json()['families']);

        // 別の組織の招待で、移る。元の組織は、以降、この家族を参照できない。
        $b->post('/api/v1/org/invitations', ['email' => 'y@example.com']);
        $moved = $family->post('/api/v1/organization-membership', ['invitationToken' => $this->mailer->lastInvitationToken()]);
        $this->assertSame(200, $moved->status(), $moved->body());
        $this->assertSame('△△研究室', $moved->json()['organization']['name']);
        $this->assertSame(['name' => '○○大学'], $moved->json()['previousOrganization']);
        $this->assertCount(0, $a->get('/api/v1/org/members')->json()['families']);
        $this->assertCount(1, $b->get('/api/v1/org/members')->json()['families']);
    }

    public function testJoiningTheSameOrganizationAgainKeepsTheInvitation(): void
    {
        $org = $this->orgClient();
        $family = $this->client('203.0.113.60');
        $reg = $this->registerFamilyInto($org, $family);
        $this->assertSame(0, $org->get('/api/v1/org/invitations')->json()['pendingCount']);

        $org->post('/api/v1/org/invitations', ['email' => 'again@example.com']);
        $token = $this->mailer->lastInvitationToken();
        $this->elevate($family, $reg['recoveryCode']);
        $this->assertError($family->post('/api/v1/organization-membership', ['invitationToken' => $token]), 409, 'ALREADY_MEMBER');
        $this->assertSame(1, $org->get('/api/v1/org/invitations')->json()['pendingCount']);
    }

    public function testJoinWithInvalidInvitationAndWithoutLogin(): void
    {
        $family = $this->client();
        $reg = $this->registerFamily($family);
        $this->elevate($family, $reg['recoveryCode']);
        $this->assertError($family->post('/api/v1/organization-membership', ['invitationToken' => str_repeat('B', 43)]), 410, 'INVITATION_INVALID');
        $this->assertError($family->post('/api/v1/organization-membership', ['invitationToken' => 'x']), 410, 'INVITATION_INVALID');

        $anon = $this->client('203.0.113.77');
        $this->assertError($anon->get('/api/v1/organization-membership'), 401, 'UNAUTHENTICATED');
        $this->assertError($anon->post('/api/v1/organization-membership', ['invitationToken' => 'x']), 401, 'UNAUTHENTICATED');
        $this->assertError($anon->delete('/api/v1/organization-membership'), 401, 'UNAUTHENTICATED');
    }

    public function testLeaveRequiresElevationAndMembership(): void
    {
        $org = $this->orgClient();
        $family = $this->client('203.0.113.60');
        $reg = $this->registerFamilyInto($org, $family);
        $code = $reg['recoveryCode'];

        $this->assertError($family->delete('/api/v1/organization-membership'), 403, 'ELEVATION_REQUIRED');
        $this->elevate($family, $code);
        $this->assertSame(204, $family->delete('/api/v1/organization-membership')->status());
        $this->assertNull($family->get('/api/v1/organization-membership')->json()['organization']);
        $this->assertCount(0, $org->get('/api/v1/org/members')->json()['families']);
        $this->assertError($family->delete('/api/v1/organization-membership'), 409, 'NOT_A_MEMBER');
    }

    public function testInvitationEndpointsShareTheRegistrationIpLimit(): void
    {
        $anon = $this->client('203.0.113.99');
        for ($i = 0; $i < 60; $i++) {
            $this->assertError($anon->post('/api/v1/invitations/verify', ['token' => str_repeat('A', 43)]), 410, 'INVITATION_INVALID');
        }
        $this->assertError($anon->post('/api/v1/invitations/verify', ['token' => str_repeat('A', 43)]), 429, 'RATE_LIMITED');
        $this->assertError($anon->post('/api/v1/registrations/verify', ['token' => str_repeat('A', 43)]), 429, 'RATE_LIMITED');
    }

    public function testMembersListShowsOnlyIdsJoinDateAndUserNames(): void
    {
        $org = $this->orgClient();
        $older = $this->client('203.0.113.60');
        $this->registerFamilyInto($org, $older, ['おとうさん', 'はなこ']);
        $this->clock->advance('+1 hour');
        $newer = $this->client('203.0.113.61');
        $this->registerFamilyInto($org, $newer, ['ひとり']);
        // 所属していない家族は、含まれない。
        $this->registerFamily($this->client('203.0.113.62'), ['ほかの人']);

        $families = $org->get('/api/v1/org/members')->json()['families'];
        $this->assertCount(2, $families);
        // 所属した日時の新しい順。ユーザは表示順。
        $this->assertSame(['ひとり'], array_column($families[0]['users'], 'name'));
        $this->assertSame(['おとうさん', 'はなこ'], array_column($families[1]['users'], 'name'));
        $this->assertSame(['id', 'joinedAt', 'users'], array_keys($families[0]));
        $this->assertSame(['id', 'name'], array_keys($families[0]['users'][0]));
    }

    public function testRemovingAMemberOnlyWorksForOwnFamilies(): void
    {
        $a = $this->orgClient();
        $this->createOrganization('△△研究室', 'other-lab');
        $b = $this->client('203.0.113.51');
        $this->orgLogin($b, 'other-lab');

        $family = $this->client('203.0.113.60');
        $this->registerFamilyInto($a, $family);
        $familyId = $a->get('/api/v1/org/members')->json()['families'][0]['id'];

        // 他の組織の家族・存在しない家族は、区別せず 404。
        $this->assertError($b->delete('/api/v1/org/members/' . $familyId), 404, 'NOT_FOUND');
        $this->assertError($a->delete('/api/v1/org/members/' . $this->idString(random_bytes(16))), 404, 'NOT_FOUND');
        $this->assertError($a->delete('/api/v1/org/members/nope'), 404, 'NOT_FOUND');
        $this->assertCount(1, $a->get('/api/v1/org/members')->json()['families']);

        $this->assertSame(204, $a->delete('/api/v1/org/members/' . $familyId)->status());
        $this->assertCount(0, $a->get('/api/v1/org/members')->json()['families']);
        $this->assertNull($family->get('/api/v1/organization-membership')->json()['organization']);
        $this->assertError($a->delete('/api/v1/org/members/' . $familyId), 404, 'NOT_FOUND');
    }

    public function testFamilyWithdrawalRemovesTheMembership(): void
    {
        $org = $this->orgClient();
        $family = $this->client('203.0.113.60');
        $reg = $this->registerFamilyInto($org, $family);
        $this->elevate($family, $reg['recoveryCode']);
        $this->assertSame(204, $family->delete('/api/v1/family')->status());
        $this->assertCount(0, $org->get('/api/v1/org/members')->json()['families']);
    }
}
