<?php

declare(strict_types=1);

namespace UecTst\Config;

use RuntimeException;

/**
 * 設定ファイルの読み込み・検証の失敗。メッセージには、パスワードなどの値を含めない
 * （どの項目が、なぜ不正かだけを書く）。
 */
final class ConfigException extends RuntimeException
{
}
