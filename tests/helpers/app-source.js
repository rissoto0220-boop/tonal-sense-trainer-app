// app.js(と、ブラウザ・音声が要る画面のファイル)を、ソースの文字列として調べるための部品(テスト用)。
// app.js はブラウザなしでは動かせない。ここで調べるのは、壊れると研究データに響く「配線」(確認の付け外し・
// 中断の確定と保存の順序・記録を作る前に失敗の画面を出す、など)だけにする。文言や書き方の細かい一致は調べない。
import { readFileSync } from "node:fs";

export const readSource = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
export const appSource = readSource("app.js");

// 空白・改行の違いを無視して比べるために、連続する空白を1つにする
export const compact = (text) => text.replace(/\s+/g, " ");

// 行末のコメント(// …)を除く。コメントアウトした処理を、「ある」と取り違えないため
export const stripComments = (text) => text.replace(/(^|\s)\/\/.*$/gm, "$1");

// source の中の、name で始まる関数の本体(次の「行頭の }」まで)
export function functionBody(source, name) {
  const at = source.indexOf(name);
  if (at < 0) throw new Error(`関数が見つからない: ${name}`);
  const rest = source.slice(at);
  return rest.slice(0, rest.indexOf("\n}\n") + 3);
}

// needles が、text の中でこの順に(間に他の文字があってもよい)現れること。空白の違いは無視し、コメントの中は数えない
export function assertInOrder(assert, text, needles, message = "") {
  const t = compact(stripComments(text));
  let from = 0;
  for (const needle of needles) {
    const at = t.indexOf(compact(needle), from);
    assert.ok(at >= 0, `${message} 「${needle}」が、前の項目より後ろに見つからない`);
    from = at + needle.length;
  }
}
