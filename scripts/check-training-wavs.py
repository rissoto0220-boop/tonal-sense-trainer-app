#!/usr/bin/env python3
"""音感訓練用WAVを確認する、読み取り専用のスクリプト(音源を差し替えたときに実行する)。

WAVの加工・変換・改名は一切行わない(開いて数値を読むだけ)。
scripts/check-functional-pitch-wavs.py と同じ作法。

アプリ(src/training/question-audio.js)は、WAVの実際の長さから再生を予約するので、
長さが変わっても止まらずに動く。ただし「どのWAVも前後に0.5秒ずつ無音がある」
(AUDIO_EDGE_SILENCE_SECONDS)を前提に、次の時刻を計算している:
- 調セットアップの音が終わってから出題音の音が始まるまでの1秒
- 回答できるようになる時刻(反応時間の起点 = 出題音の音が鳴り始める時刻)
- 正解のとき、フィードバックのフレーズが終わってから次の問題へ進むまでの0.5秒
前後の無音が0.5秒でないと、これらがエラーを出さずにずれる。このスクリプトで確かめる。

確認する項目:
- ファイルがそろっているか: 調セットアップ4本、出題音40本、フィードバック40本(不合格)
- 前の無音・後ろの無音: 0.5秒(±0.05秒)(不合格)
- 形式(チャンネル数・サンプリング周波数・ビット深度): すべてのファイルで同じ(不合格)
- 長さ: 目安 調セットアップ5.0秒、出題音3.0秒、フィードバック3.0秒(警告のみ。アプリは止まらない)
- 音量(実効値): ファイル間で大きくずれていないか(警告のみ)

使い方: python3 scripts/check-training-wavs.py [フォルダー]
  フォルダーを省略すると public/sounds/training/ を調べる。
終了コード: すべて合格なら0、不合格の項目があれば1(警告だけなら0)。

Python標準ライブラリのみを使用する(16bitと24bitのPCMに対応)。
"""
import math
import statistics
import struct
import sys
import wave
from pathlib import Path

# src/training/question-audio.js の AUDIO_EDGE_SILENCE_SECONDS と同じ値にする
# (一致することを tests/training/check-wavs-script.test.js で確認している)。
EXPECTED_EDGE_SILENCE = 0.5
EDGE_TOLERANCE = 0.05
# 長さの目安(仮音源の値)。外れても警告だけ。
EXPECTED_DURATIONS = {"setup": 5.0, "q": 3.0, "fb": 3.0}
DURATION_TOLERANCE = 0.05
SILENCE_THRESHOLD = 0.005  # 満点を1.0として、これ以下を無音とみなす(約-46dBFS。機能的音感の検査と同じ)
LOUDNESS_WARNING_DB = 3.0

DEFAULT_DIR = Path(__file__).resolve().parent.parent / "public" / "sounds" / "training"

# src/training/stimuli.js と同じ内容・同じ順(一致することをテストで確認している)。
KEY_PREFIXES = {"C": "c", "Es": "es", "Fis": "fis", "A": "a"}
STIMULI = [
    ("n7", "ch-n5-dom7"),  # シ/Ⅴ
    ("n1", "ch-n1-maj"),  # ド/Ⅰ
    ("n2", "ch-n5-dom7"),  # レ/Ⅴ
    ("n6", "ch-n4-maj"),  # ラ/Ⅳ
    ("n3", "ch-n1-maj"),  # ミ/Ⅰ
    ("n5", "ch-n5-dom7"),  # ソ/Ⅴ
    ("n4", "ch-n5-dom7"),  # ファ/Ⅴ
    ("n5", "ch-n1-maj"),  # ソ/Ⅰ
    ("n1", "ch-n4-maj"),  # ド/Ⅳ
    ("n4", "ch-n4-maj"),  # ファ/Ⅳ
]
AUDIO_VERSION = "01"


def expected_files():
    """{ファイル名: 種類("setup" / "q" / "fb")} を返す。"""
    files = {}
    for prefix in KEY_PREFIXES.values():
        files[f"{prefix}-setup-v{AUDIO_VERSION}.wav"] = "setup"
        for degree, chord_ref in STIMULI:
            stimulus_id = f"st-{degree}-{chord_ref}"
            files[f"{prefix}-q-{stimulus_id}-v{AUDIO_VERSION}.wav"] = "q"
            files[f"{prefix}-fb-{stimulus_id}-v{AUDIO_VERSION}.wav"] = "fb"
    return files


def read_samples(path):
    """(チャンネル数, サンプリング周波数, ビット深度, 長さ(秒), 第1チャンネルのサンプル列(-1.0〜1.0))を返す。"""
    with wave.open(str(path), "rb") as wav:
        channels, width, rate, frames = wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getnframes()
        raw = wav.readframes(frames)
    step = width * channels
    samples = []
    if width == 2:
        for i in range(0, len(raw), step):
            samples.append(struct.unpack_from("<h", raw, i)[0] / 32768.0)
    elif width == 3:
        for i in range(0, len(raw), step):
            samples.append(int.from_bytes(raw[i:i + 3], "little", signed=True) / 8388608.0)
    else:
        samples = None  # 8bit・32bitなどは形式の確認だけ行う
    return channels, rate, width * 8, frames / rate, samples


def analyze(path, kind):
    channels, rate, bits, duration, samples = read_samples(path)
    info = {"name": path.name, "kind": kind, "channels": channels, "rate": rate, "bits": bits, "duration": duration,
            "lead": None, "trail": None, "rms_db": None, "readable": samples is not None}
    if samples:
        loud = [i for i, s in enumerate(samples) if abs(s) > SILENCE_THRESHOLD]
        if loud:
            info["lead"] = loud[0] / rate
            info["trail"] = (len(samples) - 1 - loud[-1]) / rate
        rms = math.sqrt(sum(s * s for s in samples) / len(samples))
        info["rms_db"] = 20 * math.log10(rms) if rms > 0 else float("-inf")
    return info


def main():
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DIR
    expected = expected_files()
    present = {path.name for path in folder.glob("*.wav")}
    errors, warnings = [], []

    missing = sorted(set(expected) - present)
    extra = sorted(present - set(expected))
    if missing:
        errors.append(f"足りないファイル({len(missing)}本): " + ", ".join(missing))
    if extra:
        warnings.append(f"一覧にないファイル({len(extra)}本。アプリは使わない): " + ", ".join(extra))

    results = [analyze(folder / name, kind) for name, kind in expected.items() if name in present]
    if not results:
        print(f"確認できるWAVがありません: {folder}")
        return 1

    formats = {(r["channels"], r["rate"], r["bits"]) for r in results}
    if len(formats) > 1:
        errors.append(f"チャンネル数・サンプリング周波数・ビット深度がそろっていません: {sorted(formats)}")

    silence_problem = False
    print(f"{'ファイル':<40}{'ch':>3}{'Hz':>7}{'bit':>4}{'長さ':>7}{'前無音':>7}{'後無音':>7}{'実効dB':>8}")
    for r in results:
        problems, notes = [], []
        if not r["readable"]:
            problems.append("無音を確認できない(未対応のビット深度)")
        elif r["lead"] is None:
            problems.append("無音のみ")
        else:
            if abs(r["lead"] - EXPECTED_EDGE_SILENCE) > EDGE_TOLERANCE + 1e-9:
                problems.append("前の無音")
            if abs(r["trail"] - EXPECTED_EDGE_SILENCE) > EDGE_TOLERANCE + 1e-9:
                problems.append("後ろの無音")
        if any("無音" in p for p in problems):
            silence_problem = True
        if abs(r["duration"] - EXPECTED_DURATIONS[r["kind"]]) > DURATION_TOLERANCE + 1e-9:
            notes.append(f"長さ(目安{EXPECTED_DURATIONS[r['kind']]}秒)")
        fmt = lambda v, f: "-" if v is None else format(v, f)
        mark = ""
        if problems:
            mark += f"  ← 不合格: {'・'.join(problems)}"
            errors.append(f"{r['name']}: {'・'.join(problems)}")
        if notes:
            mark += f"  ← 警告: {'・'.join(notes)}"
            warnings.append(f"{r['name']}: {'・'.join(notes)}")
        print(f"{r['name']:<40}{r['channels']:>3}{r['rate']:>7}{r['bits']:>4}{r['duration']:>7.3f}"
              f"{fmt(r['lead'], '.3f'):>7}{fmt(r['trail'], '.3f'):>7}{fmt(r['rms_db'], '.1f'):>8}{mark}")

    rms_values = [r["rms_db"] for r in results if r["rms_db"] not in (None, float("-inf"))]
    if rms_values:
        median = statistics.median(rms_values)
        for r in results:
            if r["rms_db"] not in (None, float("-inf")) and abs(r["rms_db"] - median) > LOUDNESS_WARNING_DB:
                warnings.append(f"{r['name']}: 実効値が中央値({median:.1f}dB)から{LOUDNESS_WARNING_DB}dB以上ずれています")

    print()
    if warnings:
        print("警告(アプリは止まりません。意図した変更なら問題ありません):")
        for w in warnings:
            print(f"  {w}")
        print()
    if errors:
        print("不合格の項目があります:")
        for e in errors:
            print(f"  {e}")
        if silence_problem:
            print()
            print("前後の無音が0.5秒でないと、調セットアップと出題音の間隔(1秒)、回答できるようになる時刻、")
            print("正解時に次へ進む時刻がずれます。音源の前後の無音を0.5秒にそろえるか、正式音源の無音の長さに合わせて")
            print("src/training/question-audio.js の AUDIO_EDGE_SILENCE_SECONDS と、このスクリプトの")
            print("EXPECTED_EDGE_SILENCE を、同じ値に直してください。")
        return 1
    print(f"{len(results)}本すべて、ファイル・形式・前後の無音が合格です。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
