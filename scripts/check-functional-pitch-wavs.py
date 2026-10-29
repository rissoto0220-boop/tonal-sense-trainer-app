#!/usr/bin/env python3
"""機能的音感測定用WAVの形式を確認する、読み取り専用のスクリプト。

WAVの加工・変換・改名は一切行わない(開いて数値を読むだけ)。
ブラウザは読み込み時に音声を別の形式へ変換するため、ビット深度やサンプリング周波数は
ブラウザ上では確認できない。正式WAVを受け取ったときは、このスクリプトで確認する。

確認する項目(仕様7章):
- 長さ: 4.8秒(許容誤差±0.05秒)
- 前余白(最初の音が出るまで): 0.8秒(±0.05秒)
- 後余白(最後の音の後): 0.75秒以上(最後の音が4.0秒で終わる想定)
- チャンネル数・サンプリング周波数・ビット深度: すべてのファイルで同じ
- 音量(ピークと実効値): ファイル間で大きくずれていないか(警告のみ)

使い方: python3 scripts/check-functional-pitch-wavs.py [フォルダー]
  フォルダーを省略すると public/sounds/functional-pitch/ を調べる。
終了コード: すべて合格なら0、不合格の項目があれば1(音量の警告だけなら0)。

Python標準ライブラリのみを使用する(16bitと24bitのPCMに対応)。
"""
import math
import statistics
import struct
import sys
import wave
from pathlib import Path

EXPECTED_DURATION = 4.8
DURATION_TOLERANCE = 0.05
EXPECTED_LEADING_SILENCE = 0.8
LEADING_TOLERANCE = 0.05
MIN_TRAILING_SILENCE = 0.75
SILENCE_THRESHOLD = 0.005  # 満点を1.0として、これ以下を無音とみなす(約-46dBFS)
LOUDNESS_WARNING_DB = 3.0

DEFAULT_DIR = Path(__file__).resolve().parent.parent / "public" / "sounds" / "functional-pitch"


def read_samples(path):
    """(チャンネル数, サンプリング周波数, ビット深度, 第1チャンネルのサンプル列(-1.0〜1.0))を返す。"""
    with wave.open(str(path), "rb") as wav:
        channels, width, rate, frames = wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getnframes()
        raw = wav.readframes(frames)
    bits = width * 8
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
    return channels, rate, bits, samples


def analyze(path):
    channels, rate, bits, samples = read_samples(path)
    with wave.open(str(path), "rb") as wav:
        duration = wav.getnframes() / wav.getframerate()
    info = {"name": path.name, "channels": channels, "rate": rate, "bits": bits, "duration": duration,
            "lead": None, "trail": None, "peak_db": None, "rms_db": None}
    if samples:
        loud = [i for i, s in enumerate(samples) if abs(s) > SILENCE_THRESHOLD]
        if loud:
            info["lead"] = loud[0] / rate
            info["trail"] = (len(samples) - 1 - loud[-1]) / rate
        peak = max(abs(s) for s in samples)
        rms = math.sqrt(sum(s * s for s in samples) / len(samples))
        to_db = lambda v: 20 * math.log10(v) if v > 0 else float("-inf")
        info["peak_db"], info["rms_db"] = to_db(peak), to_db(rms)
    return info


def main():
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DIR
    files = sorted(folder.glob("*.wav"))
    if not files:
        print(f"WAVが見つかりません: {folder}")
        return 1

    results = [analyze(f) for f in files]
    formats = {(r["channels"], r["rate"], r["bits"]) for r in results}
    errors = []
    if len(formats) > 1:
        errors.append(f"チャンネル数・サンプリング周波数・ビット深度がそろっていません: {sorted(formats)}")

    print(f"{'ファイル':<46}{'ch':>3}{'Hz':>7}{'bit':>4}{'長さ':>7}{'前余白':>7}{'後余白':>7}{'ピークdB':>9}{'実効dB':>8}")
    for r in results:
        problems = []
        if abs(r["duration"] - EXPECTED_DURATION) > DURATION_TOLERANCE + 1e-9:
            problems.append("長さ")
        if r["lead"] is None:
            problems.append("無音のみ" if r["peak_db"] is not None else "音量未確認(未対応のビット深度)")
        else:
            if abs(r["lead"] - EXPECTED_LEADING_SILENCE) > LEADING_TOLERANCE + 1e-9:
                problems.append("前余白")
            if r["trail"] < MIN_TRAILING_SILENCE - 1e-9:
                problems.append("後余白")
        fmt = lambda v, f: "-" if v is None else format(v, f)
        print(f"{r['name']:<46}{r['channels']:>3}{r['rate']:>7}{r['bits']:>4}{r['duration']:>7.3f}"
              f"{fmt(r['lead'], '.3f'):>7}{fmt(r['trail'], '.3f'):>7}{fmt(r['peak_db'], '.1f'):>9}{fmt(r['rms_db'], '.1f'):>8}"
              + (f"  ← 要確認: {'・'.join(problems)}" if problems else ""))
        if problems:
            errors.append(f"{r['name']}: {'・'.join(problems)}")

    rms_values = [r["rms_db"] for r in results if r["rms_db"] not in (None, float("-inf"))]
    if rms_values:
        median = statistics.median(rms_values)
        loud_outliers = [r["name"] for r in results
                         if r["rms_db"] not in (None, float("-inf")) and abs(r["rms_db"] - median) > LOUDNESS_WARNING_DB]
        if loud_outliers:
            print(f"\n警告: 実効値が中央値({median:.1f}dB)から{LOUDNESS_WARNING_DB}dB以上ずれているファイルがあります:")
            for name in loud_outliers:
                print(f"  {name}")

    print()
    if errors:
        print("不合格の項目があります:")
        for e in errors:
            print(f"  {e}")
        return 1
    print(f"{len(results)}本すべて、形式・長さ・余白が仕様どおりです。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
