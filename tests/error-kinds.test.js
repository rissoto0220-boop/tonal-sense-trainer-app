import { test } from "node:test";
import assert from "node:assert/strict";
import { ERROR_KINDS, ERROR_IMPACTS, NOTIFY_RESEARCHER_TEXT, kindFromAudioNotice, describeError } from "../src/shared/error-kinds.js";

test("エラーの種類の表: 種類の一覧。どれにも見出し・何が起きたか・研究者への連絡の有無がある", () => {
  assert.deepEqual(Object.keys(ERROR_KINDS), ["audio-load", "audio-duration", "audio-play", "audio-start", "setup", "unexpected"]);
  for (const [kind, entry] of Object.entries(ERROR_KINDS)) {
    assert.ok(entry.title.length > 0, `${kind}: 見出し`);
    assert.ok(entry.cause.endsWith("。"), `${kind}: 何が起きたか`);
    assert.equal(typeof entry.notifyResearcher, "boolean", `${kind}: 研究者への連絡`);
  }
});

test("データへの影響の文言: 5つ", () => {
  assert.deepEqual(Object.keys(ERROR_IMPACTS), ["session-interrupted", "recorded-interrupted", "interrupted-uncounted", "not-recorded", "kept-as-saved"]);
  assert.equal(ERROR_IMPACTS["session-interrupted"], "このテストは、中断として記録しました。");
  for (const text of Object.values(ERROR_IMPACTS)) assert.ok(text.endsWith("。"));
});

test("音の通知の種類(load / duration / schedule / start)を、表の種類に直す。知らない種類は audio-load", () => {
  assert.equal(kindFromAudioNotice("load"), "audio-load");
  assert.equal(kindFromAudioNotice("duration"), "audio-duration");
  assert.equal(kindFromAudioNotice("schedule"), "audio-play");
  assert.equal(kindFromAudioNotice("start"), "audio-start");
  assert.equal(kindFromAudioNotice("unknown"), "audio-load");
  assert.equal(kindFromAudioNotice(undefined), "audio-load");
  for (const notice of ["load", "duration", "schedule", "start"]) assert.ok(kindFromAudioNotice(notice) in ERROR_KINDS);
});

test("describeError: 見出し・何が起きたか・詳細・データへの影響・次にすべきこと", () => {
  const error = describeError({ kind: "audio-load", impact: "recorded-interrupted", backTo: "メニュー選択", details: ["a.wav"] });
  assert.deepEqual(error, {
    title: "音声を読み込めませんでした",
    cause: "音声ファイルを読み込めませんでした。",
    details: ["a.wav"],
    impact: "ここまでの回答は、中断として記録しました。",
    next: "メニュー選択へ戻って、やり直してください。",
  });
});

test("次にすべきこと: 研究者への連絡がある種類は、先頭に「研究者へお知らせください。」を添える", () => {
  assert.equal(describeError({ kind: "audio-duration", backTo: "Key選択" }).next, `${NOTIFY_RESEARCHER_TEXT}Key選択へ戻って、やり直してください。`);
  assert.equal(describeError({ kind: "audio-start", backTo: "テスト選択" }).next, "研究者へお知らせください。テスト選択へ戻って、やり直してください。");
  assert.equal(describeError({ kind: "audio-play", backTo: "テスト選択" }).next, "テスト選択へ戻って、やり直してください。");
});

test("戻り先がないときは、再読み込みを案内する。想定外の例外だけは、決まった文言(帯用)", () => {
  assert.equal(describeError({ kind: "audio-load" }).next, "ページを再読み込みして、やり直してください。");
  assert.equal(describeError({ kind: "unexpected", backTo: "テスト選択" }).next, "動きがおかしいときは、「最初からやり直す」を押してください。研究者へお知らせください。");
});

test("影響を渡さなければ、影響の行は null。未対応の種類・影響は例外", () => {
  assert.equal(describeError({ kind: "setup" }).impact, null);
  assert.throws(() => describeError({ kind: "storage-write" }), /未対応のエラーの種類です: storage-write/);
  assert.throws(() => describeError({ kind: "setup", impact: "unknown" }), /未対応のデータへの影響です: unknown/);
});

test("describeError は、渡された詳細の配列を書き換えない(複製を返す)", () => {
  const details = ["x"];
  const error = describeError({ kind: "setup", details });
  error.details.push("y");
  assert.deepEqual(details, ["x"]);
});

test("表の文言に、正解・不正解を連想させる語を使わない", () => {
  const texts = [...Object.values(ERROR_KINDS).flatMap((e) => [e.title, e.cause, e.next ?? ""]), ...Object.values(ERROR_IMPACTS)];
  for (const text of texts) {
    for (const word of ["不正解", "正しい", "間違", "誤り"]) assert.equal(text.includes(word), false, `${word}: ${text}`);
  }
});
