// 「このモジュールは、保存・参加者ID・CSV・送信の部品に依存しない」を調べるための部品(テスト用)。
// 「許可するもの」の一覧ではなく「禁止するもの」で調べる。共通の部品を足しても、直さなくてよい。
import { readdirSync, readFileSync } from "node:fs";

const SRC = new URL("../../src/", import.meta.url);

// 行末のコメント(// …)を除く(コメントに書かれた語や import を、使っていると取り違えない)
export function stripComments(source) {
  return source.replace(/(^|\s)\/\/.*$/gm, "$1");
}

// import している相手のパス(静的な import・副作用だけの import・動的な import(...))
export function importedPaths(source) {
  return [...stripComments(source).matchAll(/(?:\bfrom|\bimport)\s*\(?\s*"([^"]+)"/g)].map((m) => m[1]);
}

// 禁止のパターンに合う import(パスの配列)を返す。なければ空
export function findForbiddenImports(source, forbiddenPatterns) {
  return importedPaths(source).filter((path) => forbiddenPatterns.some((pattern) => pattern.test(path)));
}

// 禁止の語(ブラウザの機能など)を使っていれば、その語を返す。なければ空
export function findForbiddenWords(source, wordPattern) {
  return [...stripComments(source).matchAll(new RegExp(wordPattern.source, "g"))].map((m) => m[0]);
}

// src/<dir>/ の .js ファイル名(exclude に挙げたものを除く)。ファイルを足したときに自動で調べる範囲へ入る
export function listModules(dir, exclude = []) {
  return readdirSync(new URL(`${dir}/`, SRC))
    .filter((name) => name.endsWith(".js") && !exclude.includes(name))
    .sort();
}

export function readModule(dir, name) {
  return readFileSync(new URL(`${dir}/${name}`, SRC), "utf8");
}
