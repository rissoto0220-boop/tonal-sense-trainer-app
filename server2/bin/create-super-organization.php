<?php

declare(strict_types=1);

// 最初の運用担当者（スーパー）の組織を作る運用用のスクリプト（TableSpec_Organization.md 7.）。運用担当者の組織は、自己登録できない。
//   php bin/create-super-organization.php [ログインID] [組織名]      （既定: operator / 運用担当者）
// 初期パスワードは、標準入力から読む（コマンドラインに書くと、シェルの履歴に残るため）。
//   例: 端末で実行して、パスワードを入力し、Enter を押す。
// 作った組織は、password_change_required = 1。最初のログインで、パスワードを変更し、続けてパスキーを登録する。
// 運用担当者の組織が、すでにある場合は、何もしない。

require dirname(__DIR__) . '/vendor/autoload.php';

use UecTst\Config\ConfigException;
use UecTst\Config\DbConfig;
use UecTst\Db\Connection;
use UecTst\Db\Uuid7;
use UecTst\Organization\OrgPasswordService;
use UecTst\Security\PasswordHasher;
use UecTst\Validation\Input;

$loginId = strtolower($argv[1] ?? 'operator');
$name = Input::normalizeText($argv[2] ?? '運用担当者');
if (Input::loginIdError($loginId) !== null || Input::organizationNameError($name) !== null) {
    fwrite(STDERR, "NG: ログインID（英小文字・数字・. _ - の4〜64文字）または組織名（1〜100文字）が正しくありません\n");
    exit(1);
}

fwrite(STDERR, "初期パスワード（" . OrgPasswordService::PASSWORD_MIN . "〜" . OrgPasswordService::PASSWORD_MAX . "文字）を入力して、Enter を押してください: ");
$password = rtrim((string) fgets(STDIN), "\r\n");
$length = mb_strlen($password, 'UTF-8');
if ($length < OrgPasswordService::PASSWORD_MIN || $length > OrgPasswordService::PASSWORD_MAX) {
    fwrite(STDERR, "NG: パスワードの長さが正しくありません\n");
    exit(1);
}

try {
    $pdo = Connection::create(DbConfig::load());
} catch (ConfigException | RuntimeException $e) {
    fwrite(STDERR, "NG: " . $e->getMessage() . "\n");
    exit(1);
}

if ($pdo->query('SELECT 1 FROM organizations WHERE is_super = 1 LIMIT 1')->fetchColumn() !== false) {
    fwrite(STDERR, "運用担当者の組織は、すでにあります。何もしませんでした。\n");
    exit(1);
}

$stmt = $pdo->prepare('INSERT INTO organizations (id, name, login_id, password_hash, password_change_required, is_super) VALUES (?, ?, ?, ?, 1, 1)');
try {
    $stmt->execute([Uuid7::generateBinary(), $name, $loginId, (new PasswordHasher())->hash($password)]);
} catch (PDOException $e) {
    fwrite(STDERR, "NG: 作成できませんでした（同じ組織名・ログインIDがある可能性があります）\n");
    exit(1);
}
echo "OK: 運用担当者の組織を作りました（ログインID: {$loginId}）。最初のログインで、パスワードを変更し、パスキーを登録してください。\n";
