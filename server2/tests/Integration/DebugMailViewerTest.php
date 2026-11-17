<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use UecTst\App;
use UecTst\Config\AppConfig;
use UecTst\Log\Logger;
use UecTst\Mail\LogMailer;
use UecTst\Services;
use UecTst\Tests\Support\TestCaptcha;
use UecTst\Tests\Unit\Config\AppConfigTest;

/** デバッグ状態（debug.features.mailViewer）: メール表示ページと、レスポンスへのリンクの追加。 */
final class DebugMailViewerTest extends BlgApiTestCase
{
    private string $mailFile;

    protected function tearDown(): void
    {
        if (isset($this->mailFile)) {
            @unlink($this->mailFile);
        }
        parent::tearDown();
    }

    /**
     * メールを実際にファイルへ書く LogMailer と、デバッグの設定で、組み立て直す。
     *
     * @param array<string, mixed>|null $debug AppConfig の debug（null なら記載なし）
     */
    private function useLogMailer(?array $debug): void
    {
        $this->mailFile = sys_get_temp_dir() . '/uectst-mail-' . bin2hex(random_bytes(4)) . '.log';
        $data = AppConfigTest::dev() + ['logFile' => $this->logFile];
        $data['mail']['logFile'] = $this->mailFile;
        if ($debug !== null) {
            $data['debug'] = $debug;
        }
        $config = AppConfig::fromArray($data);
        $this->services = new Services($config, $this->pdo, $this->clock, new LogMailer($config->mailLogFile, $config->mailFrom), new TestCaptcha(), new Logger($this->logFile));
        $this->kernel = App::createKernelWith($this->services);
    }

    public function testNothingChangesWhenDebugIsOff(): void
    {
        $client = $this->client();
        $start = $client->post('/api/v1/registrations', ['email' => 'parent@example.com', 'captchaToken' => 'ok']);
        $this->assertSame(202, $start->status(), $start->body());
        $this->assertArrayNotHasKey('debug', $start->json());
        $this->assertNull($start->header('X-Debug-Mode'));
        $this->assertError($client->get('/debug/mails'), 404, 'NOT_FOUND');
    }

    public function testFeatureStaysOffWithoutTheMasterSwitch(): void
    {
        $this->useLogMailer(['enabled' => false, 'features' => ['mailViewer' => true]]);
        $client = $this->client();
        $start = $client->post('/api/v1/registrations', ['email' => 'parent@example.com', 'captchaToken' => 'ok']);
        $this->assertSame(202, $start->status(), $start->body());
        $this->assertArrayNotHasKey('debug', $start->json());
        $this->assertNull($start->header('X-Debug-Mode'));
        $this->assertError($client->get('/debug/mails'), 404, 'NOT_FOUND');
    }

    public function testMasterSwitchAloneDoesNotEnableTheViewer(): void
    {
        $this->useLogMailer(['enabled' => true]);
        $client = $this->client();
        $start = $client->post('/api/v1/registrations', ['email' => 'parent@example.com', 'captchaToken' => 'ok']);
        $this->assertSame(202, $start->status(), $start->body());
        $this->assertArrayNotHasKey('debug', $start->json());
        $this->assertSame('on', $start->header('X-Debug-Mode'), 'デバッグ状態であることは、ヘッダで分かる');
        $this->assertError($client->get('/debug/mails'), 404, 'NOT_FOUND');
    }

    public function testRegistrationMailIsLinkedAndShownInTheViewer(): void
    {
        $this->useLogMailer(['enabled' => true, 'features' => ['mailViewer' => true]]);
        $client = $this->client();

        $start = $client->post('/api/v1/registrations', ['email' => 'parent@example.com', 'captchaToken' => 'ok']);
        $this->assertSame(202, $start->status(), $start->body());
        $this->assertSame('no-reply@example.com', $start->json()['sender'], '既存の項目は、そのまま');
        $this->assertSame('on', $start->header('X-Debug-Mode'));
        $url = $start->json()['debug']['mailViewUrl'];
        $this->assertMatchesRegularExpression('#^/debug/mails\?highlight=\d{14}-[0-9a-f]{8}$#', $url);

        // 表示ページ（HTML）。メールの内容は、HTML に埋め込まない（JSON を取得して、textContent で表示する）。
        $page = $client->get('/debug/mails');
        $this->assertSame(200, $page->status());
        $this->assertStringStartsWith('text/html', (string) $page->header('Content-Type'));
        $this->assertStringContainsString("script-src 'unsafe-inline'", (string) $page->header('Content-Security-Policy'));
        $this->assertStringNotContainsString('parent@example.com', $page->body());

        // 一覧（JSON）に、リンクのメール ID のメールがあり、本登録URLが読める。
        $list = $client->get('/debug/mails?format=json');
        $this->assertSame(200, $list->status());
        $mails = $list->json()['mails'];
        $this->assertCount(1, $mails);
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        $this->assertSame($query['highlight'], $mails[0]['id']);
        $this->assertSame('parent@example.com', $mails[0]['to']);
        $this->assertSame('no-reply@example.com', $mails[0]['from']);
        $this->assertStringContainsString('本登録', $mails[0]['subject']);
        $this->assertMatchesRegularExpression('#http://localhost:8888/register\#token=[A-Za-z0-9_-]{43}#', $mails[0]['body']);

        // メールを送らない API には、リンクを加えない。2通目のメールは、新しい ID で、一覧の先頭になる。
        $this->assertArrayNotHasKey('debug', $client->get('/api/v1/sessions/current')->json());
        $second = $client->post('/api/v1/registrations', ['email' => 'second@example.com', 'captchaToken' => 'ok']);
        $this->assertNotSame($url, $second->json()['debug']['mailViewUrl']);
        $newest = $client->get('/debug/mails?format=json')->json()['mails'];
        $this->assertSame(['second@example.com', 'parent@example.com'], array_column($newest, 'to'));
    }

    public function testInvitationMailIsLinkedToo(): void
    {
        $this->useLogMailer(['enabled' => true, 'features' => ['mailViewer' => true]]);
        $this->createBelonging('○○大学', 'example-univ');
        $blg = $this->client('203.0.113.50');
        $this->blgLogin($blg, 'example-univ');

        $send = $blg->post('/api/v1/blg/invitations', ['email' => 'invitee@example.com']);
        $this->assertSame(202, $send->status(), $send->body());
        $this->assertMatchesRegularExpression('#^/debug/mails\?highlight=#', $send->json()['debug']['mailViewUrl']);

        $mails = $blg->get('/debug/mails?format=json')->json()['mails'];
        $this->assertSame('invitee@example.com', $mails[0]['to']);
        $this->assertStringContainsString('○○大学', $mails[0]['subject']);
        $this->assertMatchesRegularExpression('#http://localhost:8888/invite\#token=[A-Za-z0-9_-]{43}#', $mails[0]['body']);
    }

    public function testIndexPageIsShownOnlyWhenItsFeatureIsOn(): void
    {
        $this->assertError($this->client()->get('/'), 404, 'NOT_FOUND');

        $this->useLogMailer(['enabled' => true, 'features' => ['mailViewer' => true]]);
        $this->assertError($this->client()->get('/'), 404, 'NOT_FOUND');

        $this->useLogMailer(['enabled' => false, 'features' => ['indexPage' => true]]);
        $this->assertError($this->client()->get('/'), 404, 'NOT_FOUND');

        $this->useLogMailer(['enabled' => true, 'features' => ['indexPage' => true, 'mailViewer' => true]]);
        $page = $this->client()->get('/');
        $this->assertSame(200, $page->status());
        $this->assertStringStartsWith('text/html', (string) $page->header('Content-Type'));
        $this->assertStringContainsString('href="/debug/mails"', $page->body());
        $this->assertStringContainsString('/api/v1/blg', $page->body());
        // 秘密の値は表示しない
        $this->assertStringNotContainsString('ZGV2LW9ubHkt', $page->body());

        // メール表示ページが無効なら、リンクを出さない
        $this->useLogMailer(['enabled' => true, 'features' => ['indexPage' => true]]);
        $this->assertStringNotContainsString('/debug/mails', $this->client()->get('/')->body());
    }

    public function testIndexPageLinksIncludeTheBasePathAndAreEscaped(): void
    {
        $this->useLogMailer(['enabled' => true, 'features' => ['indexPage' => true, 'mailViewer' => true]]);
        $controller = new \UecTst\Debug\DebugIndexController($this->services->config);
        $request = new \UecTst\Http\Request('GET', '/', basePath: '/uec-tst/server2/public/index.php"><b>');
        $body = $controller->show($request)->body;
        $this->assertStringContainsString('href="/uec-tst/server2/public/index.php&quot;&gt;&lt;b&gt;/debug/mails"', $body);
        $this->assertStringNotContainsString('<b>', $body);
    }

    public function testViewerWithoutMailsIsEmpty(): void
    {
        $this->useLogMailer(['enabled' => true, 'features' => ['mailViewer' => true]]);
        $this->assertSame([], $this->client()->get('/debug/mails?format=json')->json()['mails']);
    }
}
