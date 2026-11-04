<?php

declare(strict_types=1);

namespace UecTst\Tests\Support;

use PDO;
use UecTst\Config\DbConfig;
use UecTst\Db\Connection;

/**
 * 結合テスト用のデータベース。開発用のデータベース（DBConfig.json の database）を壊さないよう、
 * 「<開発用の名前>_TEST」という別のデータベースを作り、docs/sql の DDL でテーブルを作る。
 * 作れない（権限がない・接続できない）場合は null を返し、テストはスキップされる。
 */
final class TestDatabase
{
    private static ?PDO $pdo = null;
    private static bool $tried = false;

    public static function connection(): ?PDO
    {
        if (self::$tried) {
            return self::$pdo;
        }
        self::$tried = true;

        try {
            $config = DbConfig::load();
            $testName = $config->database . '_TEST';
            $admin = Connection::create($config);
            $admin->exec("DROP DATABASE IF EXISTS `{$testName}`");
            $admin->exec("CREATE DATABASE `{$testName}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin");

            $testConfig = DbConfig::fromArray([
                'host' => $config->host, 'port' => $config->port, 'database' => $testName, 'user' => $config->user(),
                'password' => $config->password(), 'charset' => $config->charset, 'timezone' => $config->timezone,
                'connectTimeoutSeconds' => $config->connectTimeoutSeconds,
                'ssl' => ['enabled' => $config->sslEnabled, 'caFile' => $config->sslCaFile, 'verifyServerCert' => $config->sslVerifyServerCert],
            ]);
            $pdo = Connection::create($testConfig);
            self::createTables($pdo, $config->database);
            self::$pdo = $pdo;
        } catch (\Throwable) {
            self::$pdo = null;
        }
        return self::$pdo;
    }

    /** すべてのテーブルを空にする（テストごとに呼ぶ）。 */
    public static function truncateAll(PDO $pdo): void
    {
        $tables = $pdo->query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()')->fetchAll(PDO::FETCH_COLUMN);
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($tables as $table) {
            $pdo->exec('TRUNCATE TABLE `' . $table . '`');
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    }

    /** docs/sql/01_〜11_ の、各テーブルの SQL（USE と、外部キーのチェックの切り替えを除く）を実行する。 */
    private static function createTables(PDO $pdo, string $devDatabase): void
    {
        $files = glob(dirname(__DIR__, 2) . '/docs/sql/[0-9][0-9]_*.sql') ?: [];
        sort($files);
        foreach ($files as $file) {
            if (str_contains($file, '/00_')) {
                continue;
            }
            $sql = (string) file_get_contents($file);
            $sql = (string) preg_replace('/^--.*$/m', '', $sql);
            foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
                if (str_starts_with($statement, 'USE ')) {
                    continue;
                }
                $pdo->exec($statement);
            }
        }
    }
}
