<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use UecTst\Tests\Support\TestClient;

/** 家族の管理（O27〜O29）。運用担当者の組織だけが実行できる。 */
final class OrgFamilyTest extends OrgApiTestCase
{
    private function superClient(): TestClient
    {
        $this->createOrganization('運用担当者', 'operator', isSuper: true);
        $c = $this->client('203.0.113.10');
        $this->loginSuperWithPasskey($c);
        return $c;
    }

    private function normalOrgClient(string $name = 'A大学', string $loginId = 'a-univ'): TestClient
    {
        $this->createOrganization($name, $loginId);
        $c = $this->client('203.0.113.20');
        $this->orgLogin($c, $loginId);
        return $c;
    }

    public function testNormalOrganizationCannotUseFamilyApis(): void
    {
        $org = $this->normalOrgClient();
        $this->orgElevate($org);
        $id = $this->idString(random_bytes(16));
        $this->assertError($org->get('/api/v1/org/families'), 403, 'SUPER_ONLY');
        $this->assertError($org->delete("/api/v1/org/families/{$id}/organization"), 403, 'SUPER_ONLY');
        $this->assertError($org->delete("/api/v1/org/families/{$id}"), 403, 'SUPER_ONLY');
    }

    public function testListShowsAllFamiliesWithOrganizationAndUserNamesOnly(): void
    {
        $org = $this->normalOrgClient();
        $member = $this->client('203.0.113.60');
        $this->registerFamilyInto($org, $member, ['おとうさん', 'はなこ']);
        $individual = $this->client('203.0.113.61');
        $registered = $this->registerFamily($individual, ['ひとり']);
        $super = $this->superClient();

        $response = $super->get('/api/v1/org/families');
        $this->assertSame(200, $response->status(), $response->body());
        $families = $response->json()['families'];
        $this->assertCount(2, $families);
        $byOrganization = [];
        foreach ($families as $family) {
            $byOrganization[$family['organization']['name'] ?? '(なし)'] = $family;
        }
        // 登録が新しい順（個人ユーザの家族のほうが、あとに登録している）。
        $this->assertSame(['(なし)', 'A大学'], array_keys($byOrganization));
        $this->assertSame(['おとうさん', 'はなこ'], array_column($byOrganization['A大学']['users'], 'name'));
        $this->assertNotNull($byOrganization['A大学']['joinedAt']);
        $this->assertSame(['ひとり'], array_column($byOrganization['(なし)']['users'], 'name'));
        $this->assertNull($byOrganization['(なし)']['joinedAt']);
        // 復旧コードなどは含まない。
        $this->assertStringNotContainsString($registered['recoveryCode'], $response->body());
        $this->assertSame(['id', 'createdAt', 'organization', 'joinedAt', 'users'], array_keys($byOrganization['A大学']));
    }

    public function testReleaseRequiresElevationAndMakesTheFamilyAnIndividual(): void
    {
        $org = $this->normalOrgClient();
        $member = $this->client('203.0.113.60');
        $this->registerFamilyInto($org, $member);
        $super = $this->superClient();
        $familyId = $super->get('/api/v1/org/families')->json()['families'][0]['id'];

        $this->assertError($super->delete("/api/v1/org/families/{$familyId}/organization"), 403, 'ELEVATION_REQUIRED');
        $this->orgElevate($super);
        $this->assertSame(204, $super->delete("/api/v1/org/families/{$familyId}/organization")->status());

        $this->assertNull($member->get('/api/v1/organization-membership')->json()['organization']);
        $family = $super->get('/api/v1/org/families')->json()['families'][0];
        $this->assertNull($family['organization']);
        $this->assertNull($family['joinedAt']);
        $this->assertSame([], $org->get('/api/v1/org/members')->json()['families']);
        // 家族は削除されない。
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM families')->fetchColumn());

        // すでに所属していない家族は、区別できるエラーにする。
        $this->assertError($super->delete("/api/v1/org/families/{$familyId}/organization"), 409, 'NOT_A_MEMBER');
    }

    public function testReleaseAndDeleteErrorsForUnknownFamilies(): void
    {
        $super = $this->superClient();
        $this->orgElevate($super);
        $unknown = $this->idString(random_bytes(16));
        $this->assertError($super->delete("/api/v1/org/families/{$unknown}/organization"), 404, 'NOT_FOUND');
        $this->assertError($super->delete("/api/v1/org/families/{$unknown}"), 404, 'NOT_FOUND');
        $this->assertError($super->delete('/api/v1/org/families/not-an-id/organization'), 404, 'NOT_FOUND');
        $this->assertError($super->delete('/api/v1/org/families/not-an-id'), 404, 'NOT_FOUND');
    }

    public function testDeleteRequiresElevationAndRemovesTheFamilyWithItsUsersAndSessions(): void
    {
        $org = $this->normalOrgClient();
        $member = $this->client('203.0.113.60');
        $this->registerFamilyInto($org, $member, ['おとうさん', 'はなこ']);
        $other = $this->client('203.0.113.61');
        $this->registerFamily($other, ['のこる']);
        $super = $this->superClient();
        $families = $super->get('/api/v1/org/families')->json()['families'];
        $this->assertCount(2, $families);
        $target = null;
        foreach ($families as $family) {
            if ($family['organization'] !== null) {
                $target = $family['id'];
            }
        }

        $this->assertError($super->delete("/api/v1/org/families/{$target}"), 403, 'ELEVATION_REQUIRED');
        $this->orgElevate($super);
        $this->assertSame(204, $super->delete("/api/v1/org/families/{$target}")->status());

        // 削除された家族は、ログインしていた端末からも使えなくなる。
        $this->assertError($member->get('/api/v1/sessions/current'), 401, 'UNAUTHENTICATED');
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM families')->fetchColumn());
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM users')->fetchColumn());
        $this->assertSame([], $org->get('/api/v1/org/members')->json()['families']);
        $remaining = $super->get('/api/v1/org/families')->json()['families'];
        $this->assertCount(1, $remaining);
        $this->assertSame(['のこる'], array_column($remaining[0]['users'], 'name'));
        $this->assertError($super->delete("/api/v1/org/families/{$target}"), 404, 'NOT_FOUND');
    }

    public function testOperationsAreLogged(): void
    {
        $org = $this->normalOrgClient();
        $this->registerFamilyInto($org, $this->client('203.0.113.60'));
        $super = $this->superClient();
        $this->orgElevate($super);
        $familyId = $super->get('/api/v1/org/families')->json()['families'][0]['id'];
        $super->delete("/api/v1/org/families/{$familyId}/organization");
        $super->delete("/api/v1/org/families/{$familyId}");

        $log = (string) file_get_contents($this->logFile);
        $this->assertStringContainsString('org.family.release', $log);
        $this->assertStringContainsString('org.family.delete', $log);
    }
}
