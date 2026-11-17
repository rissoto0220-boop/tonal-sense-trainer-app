<?php

declare(strict_types=1);

namespace UecTst\Tests\Integration;

use PHPUnit\Framework\TestCase;
use UecTst\Config\DbConfig;
use UecTst\Db\Connection;
use UecTst\Db\Uuid7;

/**
 * 実際の DB（config/DBConfig.json の接続先、MySQL 8.4）を使うテスト。
 * 設定ファイルがない、または接続できない場合は、スキップする。
 */
final class DbConnectionTest extends TestCase
{
    private \PDO $pdo;

    protected function setUp(): void
    {
        try {
            $this->pdo = Connection::create(DbConfig::load());
        } catch (\Throwable $e) {
            $this->markTestSkipped('DB に接続できないため、スキップします: ' . $e->getMessage());
        }
    }

    public function testSessionTimeZoneIsUtc(): void
    {
        $this->assertSame('+00:00', $this->pdo->query('SELECT @@session.time_zone')->fetchColumn());
    }

    public function testExceptionsAreThrownForSqlErrors(): void
    {
        $this->expectException(\PDOException::class);
        $this->pdo->query('SELECT * FROM table_that_does_not_exist');
    }

    public function testPreparedStatementsAreNative(): void
    {
        // PHP の版によって、false または 0 が返るため、真偽値として比べる。
        $this->assertFalse((bool) $this->pdo->getAttribute(\PDO::ATTR_EMULATE_PREPARES));
        // 文字列に見える値でも、文字列として束縛され、SQL としては解釈されない。
        $stmt = $this->pdo->prepare('SELECT ? AS v');
        $stmt->execute(["x'; DROP TABLE users; --"]);
        $this->assertSame("x'; DROP TABLE users; --", $stmt->fetchColumn());
    }

    public function testUuid7RoundTripsThroughBinary16Column(): void
    {
        $stmt = $this->pdo->prepare('SELECT BIN_TO_UUID(?) AS u');
        $uuid = Uuid7::generate();
        $stmt->execute([Uuid7::toBinary($uuid)]);
        $this->assertSame($uuid, $stmt->fetchColumn(), 'UUID_TO_BIN/BIN_TO_UUID（並べ替えなし）と、アプリの変換が一致する');
    }

    public function testTablesFromTheSpecExist(): void
    {
        $count = (int) $this->pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('families','users','belongings','sessions','belonging_sessions')")->fetchColumn();
        $this->assertSame(5, $count, 'UECTSTDB に、sql/create_all.sql で作ったテーブルがあること');
    }

    public function testWrongPasswordFailsWithoutLeakingCredentials(): void
    {
        $good = DbConfig::load();
        $bad = DbConfig::fromArray([
            'host' => $good->host, 'port' => $good->port, 'database' => $good->database, 'user' => 'no_such_user_xyz',
            'password' => 'leaky-password-123', 'charset' => 'utf8mb4', 'timezone' => '+00:00',
        ]);
        try {
            Connection::create($bad);
            $this->fail('接続に失敗するはず');
        } catch (\RuntimeException $e) {
            $this->assertStringNotContainsString('leaky-password-123', $e->getMessage());
            $this->assertStringNotContainsString('leaky-password-123', $e->getTraceAsString());
            $this->assertNull($e->getPrevious(), '元の PDOException（DSN・パスワードを含みうる）を連鎖させない');
        }
    }
}
