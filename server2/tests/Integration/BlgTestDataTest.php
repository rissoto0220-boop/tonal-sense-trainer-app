<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use UecTst\Tests\Support\TestClient;
use ZipArchive;

/** 運用担当者・所属の、利用データの API（B22〜B26）。 */
final class BlgTestDataTest extends TestDataApiTestCase
{
    /** @var array{blg: TestClient, a: TestClient, userA: string, b: TestClient, userB: string, super: TestClient} */
    private array $world;

    /** 通常の所属(A大学)に所属する家族 A と、個人ユーザの家族 B、運用担当者を用意し、それぞれが各種のデータを送る。 */
    private function setUpWorld(): void
    {
        $this->createBelonging('A大学', 'example-univ');
        $this->createBelonging('運用担当者', 'operator', isSuper: true);

        $blg = $this->client('203.0.113.1');
        $this->blgLogin($blg, 'example-univ');
        $a = $this->client('198.51.100.1');
        $joined = $this->registerFamilyInto($blg, $a, ['はなこ']);
        $userA = $joined['family']['users'][0]['id'];

        $b = $this->client('198.51.100.2');
        $userB = $this->familyWithUser($b);

        $this->assertSame(201, $this->submit($a, $userA, $this->training())->status());
        $this->assertSame(201, $this->submit($a, $userA, $this->absolutePitch())->status());
        $this->assertSame(201, $this->submit($b, $userB, $this->relativePitch())->status());
        $this->assertSame(201, $this->submit($b, $userB, $this->functionalPitch())->status());

        $super = $this->client('203.0.113.10');
        $this->loginSuperWithPasskey($super);
        $this->world = ['blg' => $blg, 'a' => $a, 'userA' => $userA, 'b' => $b, 'userB' => $userB, 'super' => $super];
    }

    public function testRequiresLoginAndPasswordChange(): void
    {
        $anonymous = $this->client();
        $this->assertError($anonymous->get('/api/v1/blg/users'), 401, 'UNAUTHENTICATED');
        $this->assertError($anonymous->get('/api/v1/blg/test-exports'), 401, 'UNAUTHENTICATED');

        $this->createBelonging('B大学', 'b-univ', changeRequired: true);
        $c = $this->client();
        $this->blgLogin($c, 'b-univ');
        $this->assertError($c->get('/api/v1/blg/users'), 403, 'PASSWORD_CHANGE_REQUIRED');

        $this->createBelonging('運用担当者', 'operator', isSuper: true);
        $super = $this->client('203.0.113.10');
        $this->blgLogin($super, 'operator');
        $this->assertError($super->get('/api/v1/blg/users'), 403, 'PASSKEY_REQUIRED');
    }

    public function testNormalBelongingSeesOnlyItsOwnMembers(): void
    {
        $this->setUpWorld();
        ['blg' => $blg, 'userA' => $userA, 'userB' => $userB] = $this->world;

        $users = $blg->get('/api/v1/blg/users')->json();
        $this->assertCount(1, $users['users']);
        $this->assertSame($userA, $users['users'][0]['userId']);
        $this->assertSame('はなこ', $users['users'][0]['name']);
        $this->assertSame(2, $users['users'][0]['sessionCount']);
        $this->assertArrayNotHasKey('belonging', $users['users'][0]);
        $this->assertNull($users['nextCursor']);

        $sessions = $blg->get("/api/v1/blg/users/{$userA}/test-sessions?includeInterrupted=true")->json()['sessions'];
        $this->assertCount(2, $sessions);
        $detail = $blg->get("/api/v1/blg/users/{$userA}/test-sessions/" . self::TR_ID);
        $this->assertSame(200, $detail->status());
        $this->assertSame($userA, $detail->json()['session']['userId']);

        // 他の所属・個人ユーザのデータは、存在しない場合と区別せず 404。
        $this->assertError($blg->get("/api/v1/blg/users/{$userB}/test-sessions"), 404, 'NOT_FOUND');
        $this->assertError($blg->get("/api/v1/blg/users/{$userB}/test-sessions/" . self::RP_ID), 404, 'NOT_FOUND');
        $this->assertError($blg->get('/api/v1/blg/users/0192f3a0-7c1e-7b52-9d4e-3a5b6c7d8e9f/test-sessions'), 404, 'NOT_FOUND');
        // 他のユーザのセッションを、自分のユーザの下で指定しても 404。
        $this->assertError($blg->get("/api/v1/blg/users/{$userA}/test-sessions/" . self::RP_ID), 404, 'NOT_FOUND');
    }

    public function testResearcherSeesEveryoneIncludingDeletedUsers(): void
    {
        $this->setUpWorld();
        ['super' => $super, 'a' => $a, 'userA' => $userA, 'userB' => $userB] = $this->world;

        // 家族 B には、データのないユーザもいる（一覧には含める）。
        $users = $super->get('/api/v1/blg/users')->json()['users'];
        $byId = array_column($users, null, 'userId');
        $this->assertCount(3, $users);
        $this->assertSame(['name' => 'A大学'], $byId[$userA]['belonging']);
        $this->assertNull($byId[$userB]['belonging']);

        // 家族 A が退会しても、運用担当者はデータを参照できる。通常の所属は参照できなくなる。
        $family = $a->get('/api/v1/sessions/current')->json();
        $this->assertArrayHasKey('family', $family);
        $this->pdo->exec('DELETE FROM families');
        $users = $super->get('/api/v1/blg/users')->json()['users'];
        $byId = array_column($users, null, 'userId');
        $this->assertCount(2, $users);
        $this->assertNull($byId[$userA]['name']);
        $this->assertSame(2, $byId[$userA]['sessionCount']);
        $this->assertSame(200, $super->get("/api/v1/blg/users/{$userA}/test-sessions?includeInterrupted=true")->status());
        $this->assertError($this->world['blg']->get("/api/v1/blg/users/{$userA}/test-sessions"), 404, 'NOT_FOUND');
        $this->assertSame([], $this->world['blg']->get('/api/v1/blg/users')->json()['users']);
    }

    public function testUsersListPaging(): void
    {
        $this->setUpWorld();
        $super = $this->world['super'];
        $first = $super->get('/api/v1/blg/users?limit=2')->json();
        $this->assertCount(2, $first['users']);
        $this->assertNotNull($first['nextCursor']);
        $second = $super->get('/api/v1/blg/users?limit=2&cursor=' . $first['nextCursor'])->json();
        $this->assertCount(1, $second['users']);
        $this->assertNull($second['nextCursor']);
        $this->assertNotContains($second['users'][0]['userId'], array_column($first['users'], 'userId'));
        $this->assertError($super->get('/api/v1/blg/users?cursor=zzz'), 422, 'VALIDATION_FAILED');
    }

    public function testZipExport(): void
    {
        $this->setUpWorld();
        ['super' => $super, 'blg' => $blg, 'userA' => $userA, 'userB' => $userB] = $this->world;

        $r = $super->get('/api/v1/blg/test-exports');
        $this->assertSame(200, $r->status(), $r->body());
        $this->assertSame('application/zip', $r->header('Content-Type'));
        $this->assertMatchesRegularExpression('/^attachment; filename="uec-tst_test-data_\d{8}_\d{6}\.zip"$/', (string) $r->header('Content-Disposition'));
        $entries = $this->zipEntries($r->body());
        ksort($entries);
        $expected = [
            "absolute_pitch/responses_{$userA}.csv", "absolute_pitch/sessions_{$userA}.csv",
            "functional_pitch/responses_{$userB}.csv", "functional_pitch/sessions_{$userB}.csv",
            "relative_pitch/responses_{$userB}.csv", "relative_pitch/sessions_{$userB}.csv",
            "training/responses_{$userA}.csv", "training/sessions_{$userA}.csv",
        ];
        sort($expected);
        $this->assertSame($expected, array_keys($entries));
        foreach ($entries as $name => $content) {
            $this->assertStringStartsWith("\xEF\xBB\xBF", $content, $name);
        }
        $this->assertCount(4, explode("\r\n", rtrim($entries["training/responses_{$userA}.csv"], "\r\n")));

        // 通常の所属の ZIP には、自分の所属のデータだけ。
        $own = $this->zipEntries($blg->get('/api/v1/blg/test-exports')->body());
        $this->assertSame(["absolute_pitch/responses_{$userA}.csv", "absolute_pitch/sessions_{$userA}.csv", "training/responses_{$userA}.csv", "training/sessions_{$userA}.csv"], array_keys($own));

        // 絞り込み
        $filtered = $this->zipEntries($super->get("/api/v1/blg/test-exports?userId={$userB}&testType=relative_pitch&kind=sessions")->body());
        $this->assertSame(["relative_pitch/sessions_{$userB}.csv"], array_keys($filtered));
        $row = str_getcsv(explode("\r\n", substr($filtered["relative_pitch/sessions_{$userB}.csv"], 3))[1], ',', '"', '');
        $this->assertSame('simplified', $row[3]);
        // 範囲内にデータがなければ、空の ZIP
        $empty = $super->get('/api/v1/blg/test-exports?testType=training&from=' . rawurlencode('2030-01-01T00:00:00+09:00'));
        $this->assertSame(200, $empty->status());
        $this->assertSame([], $this->zipEntries($empty->body()));
    }

    public function testCsvExportAndItsRules(): void
    {
        $this->setUpWorld();
        ['super' => $super, 'blg' => $blg, 'userA' => $userA, 'userB' => $userB] = $this->world;

        $r = $super->get("/api/v1/blg/test-exports?format=csv&userId={$userA}&testType=training&kind=sessions");
        $this->assertSame(200, $r->status(), $r->body());
        $this->assertSame('text/csv; charset=utf-8', $r->header('Content-Type'));
        $this->assertCount(2, explode("\r\n", rtrim(substr($r->body(), 3), "\r\n")));

        // csv は、ユーザ・種類・種別が1つに決まっている場合のみ。
        foreach (['?format=csv', "?format=csv&userId={$userA}&testType=training", "?format=csv&userId={$userA}&kind=sessions", '?format=xml'] as $bad) {
            $this->assertError($super->get('/api/v1/blg/test-exports' . $bad), 422, 'VALIDATION_FAILED');
        }
        // 参照できないユーザが1人でも含まれていれば 404。
        $this->assertError($blg->get("/api/v1/blg/test-exports?userId={$userA},{$userB}"), 404, 'NOT_FOUND');
        $this->assertError($blg->get('/api/v1/blg/test-exports?userId=nope'), 404, 'NOT_FOUND');
        $this->assertError($blg->get("/api/v1/blg/test-exports?format=csv&userId={$userB}&testType=relative_pitch&kind=sessions"), 404, 'NOT_FOUND');
        $this->assertError($super->get('/api/v1/blg/test-exports?testType=nope'), 422, 'VALIDATION_FAILED');
    }

    public function testExportLimitAndRateLimit(): void
    {
        $this->setUpWorld();
        $super = $this->world['super'];
        $this->assertSame(200, $super->get('/api/v1/blg/test-exports')->status()); // 1回目

        $config = \UecTst\Config\AppConfig::fromArray(['testData' => ['exportMaxSessions' => 1]] + \UecTst\Tests\Unit\Config\AppConfigTest::dev() + ['logFile' => $this->logFile]);
        $services = new \UecTst\Services($config, $this->pdo, $this->clock, $this->mailer, new \UecTst\Tests\Support\TestCaptcha(), new \UecTst\Log\Logger($this->logFile));
        $limited = new TestClient(\UecTst\App::createKernelWith($services), '203.0.113.10');
        $limited->cookies = $super->cookies;
        $this->assertError($limited->get('/api/v1/blg/test-exports'), 422, 'EXPORT_TOO_LARGE');

        for ($i = 0; $i < 28; $i++) {
            $super->get('/api/v1/blg/test-exports?testType=training&from=' . rawurlencode('2030-01-01T00:00:00+09:00'));
        }
        $r = $super->get('/api/v1/blg/test-exports');
        $this->assertError($r, 429, 'RATE_LIMITED');
    }

    public function testDeleteIsForResearcherWithElevation(): void
    {
        $this->setUpWorld();
        ['super' => $super, 'blg' => $blg, 'userA' => $userA] = $this->world;

        // 通常の所属は 403 SUPER_ONLY（確認の前に判定）
        $this->blgElevate($blg);
        $this->assertError($blg->delete('/api/v1/blg/test-sessions/' . self::TR_ID), 403, 'SUPER_ONLY');
        // 運用担当者でも、確認が必要
        $this->assertError($super->delete('/api/v1/blg/test-sessions/' . self::TR_ID), 403, 'ELEVATION_REQUIRED');
        $this->blgElevate($super);

        $this->assertSame(204, $super->delete('/api/v1/blg/test-sessions/' . self::TR_ID)->status());
        $this->assertSame(3, $this->countRows('test_sessions'));
        $this->assertSame(0, $this->countRows('training_trials'));
        $this->assertSame(0, $this->countRows('training_trial_responses'));
        $this->assertError($super->delete('/api/v1/blg/test-sessions/' . self::TR_ID), 404, 'NOT_FOUND');
        $this->assertError($super->delete('/api/v1/blg/test-sessions/not-a-uuid'), 404, 'NOT_FOUND');
        $this->assertError($this->world['blg']->get("/api/v1/blg/users/{$userA}/test-sessions/" . self::TR_ID), 404, 'NOT_FOUND');
    }

    public function testAccessIsLoggedWithoutContents(): void
    {
        $this->setUpWorld();
        ['super' => $super, 'userA' => $userA] = $this->world;
        $super->get('/api/v1/blg/users');
        $super->get("/api/v1/blg/users/{$userA}/test-sessions");
        $super->get("/api/v1/blg/users/{$userA}/test-sessions/" . self::TR_ID);
        $super->get("/api/v1/blg/test-exports?userId={$userA}");
        $this->blgElevate($super);
        $super->delete('/api/v1/blg/test-sessions/' . self::AP_ID);

        $log = (string) file_get_contents($this->logFile);
        foreach (['blg.test_data.users', 'blg.test_data.sessions', 'blg.test_data.session', 'blg.test_data.export', 'blg.test_data.delete'] as $action) {
            $this->assertStringContainsString($action, $log);
        }
        // ユーザ名・回答の内容は、記録しない。
        $this->assertStringNotContainsString('はなこ', $log);
        $this->assertStringNotContainsString('menu-06', $log);
    }

    /** @return array<string, string> ZIP の中のファイル名 => 内容 */
    private function zipEntries(string $zipBytes): array
    {
        $path = tempnam(sys_get_temp_dir(), 'uectst-zip');
        file_put_contents($path, $zipBytes);
        $zip = new ZipArchive();
        $this->assertTrue($zip->open($path) === true, 'ZIP として開けません');
        $entries = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = (string) $zip->getNameIndex($i);
            $entries[$name] = (string) $zip->getFromIndex($i);
        }
        $zip->close();
        unlink($path);
        return $entries;
    }
}
