// 相対音感の練習・本番で、音源の読み込みに失敗したときの画面(仕様22.1)。
// セッションの中断の保存は呼び出し側が先に行う。ここでは、テスト選択へ戻れるエラー画面を出す
// (以前は状態の文を書き換えるだけで、再読み込みしかなかった。2026-11-14 研究者の決定で戻るボタンを付けた)。
import { showErrorScreen } from "../shared/error-screen.js";

export const RELATIVE_AUDIO_ERROR_TEXT = {
  title: "音声を読み込めませんでした",
  message: "このテストは中断として記録しました。テスト選択へ戻って、最初からやり直してください。",
  backLabel: "テスト選択へ戻る",
};

export function showRelativeAudioError({ screenEl, onBack }) {
  showErrorScreen({ screenEl, ...RELATIVE_AUDIO_ERROR_TEXT, onBack });
}
