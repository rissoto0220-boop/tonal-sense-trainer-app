#!/usr/bin/env bash
# サーバー上で、config/AppConfig.json を作る（鍵は、新しく生成する）。
#   bash bin/generate-app-config.sh
#
# config/AppConfig.deploy.sample.json をもとに、@RECOVERY_CODE_KEY@ と @RATE_LIMIT_KEY@ を、
# 新しく生成した鍵（openssl rand -base64 32）に置き換える。鍵は、画面には表示しない。
# すでに config/AppConfig.json がある場合は、上書きせずに終了する（鍵を作り直すと、登録済みの復旧コードが、すべて使えなくなるため）。
set -euo pipefail

cd "$(dirname "$0")/.."
template="config/AppConfig.deploy.sample.json"
target="config/AppConfig.json"

if [ -e "$target" ]; then
  echo "エラー: $target がすでにあります。上書きしません。" >&2
  exit 1
fi

recovery_key="$(openssl rand -base64 32)"
rate_limit_key="$(openssl rand -base64 32)"

# 鍵は、base64（+ / =）だけを含む。sed の区切りに使う | は含まない。
umask 077
sed -e "s|@RECOVERY_CODE_KEY@|${recovery_key}|" -e "s|@RATE_LIMIT_KEY@|${rate_limit_key}|" "$template" > "$target"

echo "作成しました: $target（権限 600）"
echo "重要: secrets.recoveryCodeKeys を失うと、登録済みの家族の復旧コードが、すべて使えなくなります。"
echo "      $target を、安全な場所にバックアップしてください。"
