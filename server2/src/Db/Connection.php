<?php

declare(strict_types=1);

namespace UecTst\Db;

use PDO;
use PDOException;
use RuntimeException;
use UecTst\Config\DbConfig;

/**
 * DB 接続の生成。接続ごとにセッションのタイムゾーンを UTC に揃える
 * （TableSpec_Account.md 0. 共通事項。DATETIME(6) の既定値を UTC にするため）。
 */
final class Connection
{
    public static function create(DbConfig $config): PDO
    {
        try {
            $pdo = new PDO($config->dsn(), $config->user(), $config->password(), $config->pdoOptions());
            // time_zone は文字列の置換を避けるため、検証済みの値をプリペアドステートメントで渡す。
            $stmt = $pdo->prepare('SET time_zone = ?');
            $stmt->execute([$config->timezone]);
        } catch (PDOException $e) {
            // PDOException のメッセージ・トレースに、DSN やパスワードが含まれることがあるため、
            // 原因のコード以外は引き継がない。
            throw new RuntimeException(
                sprintf('DB に接続できません（host=%s, port=%d, database=%s, code=%s）', $config->host, $config->port, $config->database, (string) $e->getCode()),
            );
        }
        return $pdo;
    }
}
