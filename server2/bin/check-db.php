<?php

declare(strict_types=1);

// DB の接続設定（DBConfig.json）の確認用。接続して、サーバの製品・バージョン・タイムゾーンなどを表示する。
//   php bin/check-db.php [DBConfig.json のパス]
// パスワードは表示しない。

require dirname(__DIR__) . '/vendor/autoload.php';

use UecTst\Config\ConfigException;
use UecTst\Config\DbConfig;
use UecTst\Db\Connection;

try {
    $config = DbConfig::load($argv[1] ?? null);
    $pdo = Connection::create($config);
} catch (ConfigException | RuntimeException $e) {
    fwrite(STDERR, "NG: " . $e->getMessage() . "\n");
    exit(1);
}

$row = $pdo->query('SELECT VERSION() AS version, @@version_comment AS comment, @@session.time_zone AS time_zone, DATABASE() AS db, @@sql_mode AS sql_mode, @@lower_case_table_names AS lctn')->fetch();
$tables = $pdo->query('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()')->fetchColumn();

echo "OK: DB に接続できました\n";
printf("  接続先            : %s:%d / %s（user=%s）\n", $config->host, $config->port, $config->database, $config->user);
printf("  サーバ            : MySQL %s（%s）\n", $row['version'], $row['comment']);
printf("  セッションの時刻帯: %s\n", $row['time_zone']);
printf("  テーブル数        : %d\n", (int) $tables);
printf("  lower_case_table_names: %s\n", $row['lctn']);
