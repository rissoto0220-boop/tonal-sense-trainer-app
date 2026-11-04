<?php

declare(strict_types=1);

namespace UecTst\Db;

use PDO;
use Throwable;

/** トランザクションの実行。例外が発生したら、ロールバックして、例外をそのまま投げ直す。 */
final class Transaction
{
    /**
     * @template T
     * @param callable(): T $work
     * @return T
     */
    public static function run(PDO $pdo, callable $work): mixed
    {
        $pdo->beginTransaction();
        try {
            $result = $work();
            $pdo->commit();
            return $result;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
