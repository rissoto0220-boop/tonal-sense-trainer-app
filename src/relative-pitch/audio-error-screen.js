// 相対音感の練習・本番で、音源の読み込みに失敗したときの画面(仕様22.1)。
// セッションの中断の保存は呼び出し側が先に行う。ここでは、テスト選択へ戻れるエラー画面を出す
// (見出し・文言はエラーの種類の表 src/shared/error-kinds.js。2026-11-15 に表へ統一した)。
import { showErrorScreen } from "../shared/error-screen.js";

export function showRelativeAudioError({ screenEl, onBack }) {
  showErrorScreen({ screenEl, kind: "audio-load", impact: "recorded-interrupted", backTo: "テスト選択", onBack });
}
