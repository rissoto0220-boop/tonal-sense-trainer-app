import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PHRASE_DURATION_SECONDS,
  PHRASE_GAP_SECONDS,
  FUNCTIONAL_SOUNDS_BASE_PATH,
  phraseSrcFor,
  checkPhraseDuration,
} from "../../src/functional-pitch/phrase-audio.js";

test("定数は仕様どおり(4.8秒、間隔1秒)", () => {
  assert.equal(PHRASE_DURATION_SECONDS, 4.8);
  assert.equal(PHRASE_GAP_SECONDS, 1.0);
});

test("phraseSrcFor: 既定は専用フォルダー+仕様のファイル名", () => {
  assert.equal(FUNCTIONAL_SOUNDS_BASE_PATH, "public/sounds/functional-pitch/");
  assert.equal(
    phraseSrcFor("C", "ch-n1-maj-mel-n3"),
    "public/sounds/functional-pitch/c-phr-ch-n1-maj-mel-n3-v01.wav",
  );
});

test("phraseSrcFor: フォルダーを外から指定できる", () => {
  assert.equal(
    phraseSrcFor("Fis", "ch-n4-maj-mel-n6", "../sounds/"),
    "../sounds/fis-phr-ch-n4-maj-mel-n6-v01.wav",
  );
});

test("phraseSrcFor: 未定義のKey・刺激IDはエラー", () => {
  assert.throws(() => phraseSrcFor("A", "ch-n1-maj-mel-n1"));
  assert.throws(() => phraseSrcFor("C", "unknown"));
});

test("checkPhraseDuration: 4.8秒±0.05秒は合格、それ以外は不合格", () => {
  assert.equal(checkPhraseDuration({ duration: 4.8 }).ok, true);
  assert.equal(checkPhraseDuration({ duration: 4.75 }).ok, true);
  assert.equal(checkPhraseDuration({ duration: 4.85 }).ok, true);
  assert.equal(checkPhraseDuration({ duration: 4.7 }).ok, false);
  assert.equal(checkPhraseDuration({ duration: 5.0 }).ok, false);
  assert.equal(checkPhraseDuration({ duration: 0 }).ok, false);
});

test("checkPhraseDuration: 実際の長さも返す", () => {
  assert.deepEqual(checkPhraseDuration({ duration: 2.0 }), { ok: false, durationSeconds: 2.0 });
});
