<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use UecTst\Tests\Support\TestClient;

/** 家族の管理（B27〜B29）。運用担当者の所属だけが実行できる。 */
final class BlgFamilyTest extends BlgApiTestCase
{
    private function superClient(): TestClient
    {
        $this->createBelonging('運用担当者', 'operator', isSuper: true);
        $c = $this->client('203.0.113.10');
        $this->loginSuperWithPasskey($c);
        return $c;
    }

    private function normalBlgClient(string $name = 'A大学', string $loginId = 'a-univ'): TestClient
    {
        $this->createBelonging($name, $loginId);
        $c = $this->client('203.0.113.20');
        $this->blgLogin($c, $loginId);
        return $c;
    }

    public function testNormalBelongingCannotUseFamilyApis(): void
    {
        $blg = $this->normalBlgClient();
        $this->blgElevate($blg);
        $id = $this->idString(random_bytes(16));
        $this->assertError($blg->get('/api/v1/blg/families'), 403, 'SUPER_ONLY');
        $this->assertError($blg->delete("/api/v1/blg/families/{$id}/belonging"), 403, 'SUPER_ONLY');
        $this->assertError($blg->delete("/api/v1/blg/families/{$id}"), 403, 'SUPER_ONLY');
    }

    public function testListShowsAllFamiliesWithBelongingAndUserNamesOnly(): void
    {
        $blg = $this->normalBlgClient();
        $member = $this->client('203.0.113.60');
        $this->registerFamilyInto($blg, $member, ['おとうさん', 'はなこ']);
        $individual = $this->client('203.0.113.61');
        $registered = $this->registerFamily($individual, ['ひとり']);
        $super = $this->superClient();

        $response = $super->get('/api/v1/blg/families');
        $this->assertSame(200, $response->status(), $response->body());
        $families = $response->json()['families'];
        $this->assertCount(2, $families);
        $byBelonging = [];
        foreach ($families as $family) {
            $byBelonging[$family['belonging']['name'] ?? '(なし)'] = $family;
        }
        // 登録が新しい順（個人ユーザの家族のほうが、あとに登録している）。
        $this->assertSame(['(なし)', 'A大学'], array_keys($byBelonging));
        $this->assertSame(['おとうさん', 'はなこ'], array_column($byBelonging['A大学']['users'], 'name'));
        $this->assertNotNull($byBelonging['A大学']['joinedAt']);
        $this->assertSame(['ひとり'], array_column($byBelonging['(なし)']['users'], 'name'));
        $this->assertNull($byBelonging['(なし)']['joinedAt']);
        // 復旧コードなどは含まない。
        $this->assertStringNotContainsString($registered['recoveryCode'], $response->body());
        $this->assertSame(['id', 'createdAt', 'belonging', 'joinedAt', 'users'], array_keys($byBelonging['A大学']));
    }

    public function testReleaseRequiresElevationAndMakesTheFamilyAnIndividual(): void
    {
        $blg = $this->normalBlgClient();
        $member = $this->client('203.0.113.60');
        $this->registerFamilyInto($blg, $member);
        $super = $this->superClient();
        $familyId = $super->get('/api/v1/blg/families')->json()['families'][0]['id'];

        $this->assertError($super->delete("/api/v1/blg/families/{$familyId}/belonging"), 403, 'ELEVATION_REQUIRED');
        $this->blgElevate($super);
        $this->assertSame(204, $super->delete("/api/v1/blg/families/{$familyId}/belonging")->status());

        $this->assertNull($member->get('/api/v1/belonging')->json()['belonging']);
        $family = $super->get('/api/v1/blg/families')->json()['families'][0];
        $this->assertNull($family['belonging']);
        $this->assertNull($family['joinedAt']);
        $this->assertSame([], $blg->get('/api/v1/blg/members')->json()['families']);
        // 家族は削除されない。
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM families')->fetchColumn());

        // すでに所属していない家族は、区別できるエラーにする。
        $this->assertError($super->delete("/api/v1/blg/families/{$familyId}/belonging"), 409, 'NOT_A_MEMBER');
    }

    public function testReleaseAndDeleteErrorsForUnknownFamilies(): void
    {
        $super = $this->superClient();
        $this->blgElevate($super);
        $unknown = $this->idString(random_bytes(16));
        $this->assertError($super->delete("/api/v1/blg/families/{$unknown}/belonging"), 404, 'NOT_FOUND');
        $this->assertError($super->delete("/api/v1/blg/families/{$unknown}"), 404, 'NOT_FOUND');
        $this->assertError($super->delete('/api/v1/blg/families/not-an-id/belonging'), 404, 'NOT_FOUND');
        $this->assertError($super->delete('/api/v1/blg/families/not-an-id'), 404, 'NOT_FOUND');
    }

    public function testDeleteRequiresElevationAndRemovesTheFamilyWithItsUsersAndSessions(): void
    {
        $blg = $this->normalBlgClient();
        $member = $this->client('203.0.113.60');
        $this->registerFamilyInto($blg, $member, ['おとうさん', 'はなこ']);
        $other = $this->client('203.0.113.61');
        $this->registerFamily($other, ['のこる']);
        $super = $this->superClient();
        $families = $super->get('/api/v1/blg/families')->json()['families'];
        $this->assertCount(2, $families);
        $target = null;
        foreach ($families as $family) {
            if ($family['belonging'] !== null) {
                $target = $family['id'];
            }
        }

        $this->assertError($super->delete("/api/v1/blg/families/{$target}"), 403, 'ELEVATION_REQUIRED');
        $this->blgElevate($super);
        $this->assertSame(204, $super->delete("/api/v1/blg/families/{$target}")->status());

        // 削除された家族は、ログインしていた端末からも使えなくなる。
        $this->assertError($member->get('/api/v1/sessions/current'), 401, 'UNAUTHENTICATED');
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM families')->fetchColumn());
        $this->assertSame(1, (int) $this->pdo->query('SELECT COUNT(*) FROM users')->fetchColumn());
        $this->assertSame([], $blg->get('/api/v1/blg/members')->json()['families']);
        $remaining = $super->get('/api/v1/blg/families')->json()['families'];
        $this->assertCount(1, $remaining);
        $this->assertSame(['のこる'], array_column($remaining[0]['users'], 'name'));
        $this->assertError($super->delete("/api/v1/blg/families/{$target}"), 404, 'NOT_FOUND');
    }

    public function testOperationsAreLogged(): void
    {
        $blg = $this->normalBlgClient();
        $this->registerFamilyInto($blg, $this->client('203.0.113.60'));
        $super = $this->superClient();
        $this->blgElevate($super);
        $familyId = $super->get('/api/v1/blg/families')->json()['families'][0]['id'];
        $super->delete("/api/v1/blg/families/{$familyId}/belonging");
        $super->delete("/api/v1/blg/families/{$familyId}");

        $log = (string) file_get_contents($this->logFile);
        $this->assertStringContainsString('blg.family.release', $log);
        $this->assertStringContainsString('blg.family.delete', $log);
    }
}
