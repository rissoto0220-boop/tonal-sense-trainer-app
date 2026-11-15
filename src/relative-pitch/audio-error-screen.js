// 相対音感の練習・本番で、音声のエラーが起きたときの画面(仕様22.1)。
// セッションの中断の保存は呼び出し側が先に行う。ここでは、テスト選択へ戻れるエラー画面を出す
// (見出し・文言はエラーの種類の表 src/shared/error-kinds.js。2026-11-15 に表へ統一した)。
// kind: 音源の読み込みの失敗は audio-load(既定)、音声の起動の失敗は audio-start。
// impact: 回答がある途中の失敗は recorded-interrupted(既定)、まだ回答がない起動の失敗は session-interrupted。
import { showErrorScreen } from "../shared/error-screen.js";

export function showRelativeAudioError({ screenEl, kind = "audio-load", impact = "recorded-interrupted", onBack }) {
  showErrorScreen({ screenEl, kind, impact, backTo: "テスト選択", onBack });
}
