// 復旧コードの入力補助（サーバの RecoveryCode.php と同じ規則）。
// 画面で、入力の途中でも、間違いに気づけるようにするためのもの。最終的な判定は、サーバが行う。
//
// 形式: Crockford Base32 の25文字（乱数24文字＋チェック用1文字）を、5文字ずつハイフンで区切る。

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 25;

/**
 * 入力を正規化する。ハイフン・空白（全角を含む）の除去、全角→半角、小文字→大文字、O→0、I・L→1。
 * @param {string} input
 * @returns {string}
 */
export function normalize(input) {
  const s = String(input ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s　\-－ー‐-―]+/g, "");
  return s.replace(/O/g, "0").replace(/[IL]/g, "1");
}

function luhnTerm(value) {
  return Math.floor(value / 32) + (value % 32);
}

/**
 * 正規化済みの入力を検査する。
 * @param {string} normalized
 * @returns {null|"INVALID_FORMAT"|"CHECK_CHARACTER_MISMATCH"} 問題がなければ null
 */
export function validate(normalized) {
  if (!/^[0-9A-HJKMNP-TV-Z]{25}$/.test(normalized)) return "INVALID_FORMAT";
  let factor = 1;
  let sum = 0;
  for (let i = normalized.length - 1; i >= 0; i--) {
    sum += luhnTerm(factor * ALPHABET.indexOf(normalized[i]));
    factor = factor === 2 ? 1 : 2;
  }
  return sum % 32 === 0 ? null : "CHECK_CHARACTER_MISMATCH";
}

/**
 * 表示用の形式（5文字ずつハイフン区切り）にする。25文字に満たなくても、入力途中の表示に使える。
 * @param {string} input
 * @returns {string}
 */
export function format(input) {
  const s = normalize(input).slice(0, LENGTH);
  return s.match(/.{1,5}/g)?.join("-") ?? "";
}

export const RecoveryCode = { ALPHABET, LENGTH, normalize, validate, format };
