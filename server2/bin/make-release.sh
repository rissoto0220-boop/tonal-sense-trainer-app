#!/usr/bin/env bash
# デプロイ用のフォルダを作る（手元の PC で実行する）。Transmit などで、そのままドラッグ＆ドロップできる。
#   bash bin/make-release.sh [出力先の親フォルダ]
#
#   既定の出力先: ~/Desktop/uec-tst-release/uec-tst/
#   （実行のたびに、uec-tst-release/ を、削除して作り直す。ドロップするのは、中の uec-tst フォルダ）
#
# uec-tst 全体（server/・server2/・その他）の、作業ツリーの現在の状態を、コピーする。コミットされていない変更も含む。
# Transmit は、.gitignore を見ずに、すべてをアップロードしてしまう。そのため、次のものは、あらかじめ除いておく。
#   - 本物の設定ファイル（server2/config/AppConfig.json・DBConfig.json）… 手元の MAMP 用で、サーバーの設定を壊す。鍵も含む
#   - server2/vendor/（サーバーで composer install する）、server2/tests/
#   - ログ（*.log）… メールのリンク（トークン）を含む
#   - server/data/ の中身 … サーバーの CSV データを、手元のもので、置き換えないため
#   - .git/、node_modules/、dev/、.DS_Store
set -euo pipefail

cd "$(dirname "$0")/../.."
root="$(basename "$PWD")"
parent="${1:-$HOME/Desktop}"
dest="${parent}/${root}-release"

rm -rf "$dest"
mkdir -p "$dest/$root"

rsync -a \
  --exclude='/.git/' \
  --exclude='/dev/' \
  --exclude='node_modules/' \
  --exclude='.DS_Store' \
  --exclude='/server2/vendor/' \
  --exclude='/server2/tests/' \
  --exclude='/server2/.phpunit.cache/' \
  --exclude='/server2/.phpunit.result.cache' \
  --exclude='/server2/config/AppConfig.json' \
  --exclude='/server2/config/DBConfig.json' \
  --exclude='/server/data/*' \
  --exclude='*.log' \
  ./ "$dest/$root/"

# 本物の設定ファイルと .git が入っていないことを確認する。
for f in server2/config/AppConfig.json server2/config/DBConfig.json; do
  if [ -e "$dest/$root/$f" ]; then
    echo "エラー: $f が含まれています" >&2
    exit 1
  fi
done
if [ -e "$dest/$root/.git" ]; then
  echo "エラー: .git が含まれています" >&2
  exit 1
fi

echo "作成しました: $(cd "$dest" && pwd)/$root"
echo "このフォルダ（$root）を、Transmit で、サーバーにドラッグ＆ドロップしてください。"
if command -v open >/dev/null 2>&1; then
  open "$dest"
fi
