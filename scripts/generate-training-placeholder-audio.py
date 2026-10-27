#!/usr/bin/env python3
"""音感訓練用の開発用代替音(仮音源)を生成する一時的なスクリプト。

正式な音源はまだないため、訓練の画面と音声の流れを耳と数値で確認できるように、
サイン波の仮音源をここで生成する。研究本番では使用できない
(scripts/generate-functional-pitch-placeholder-audio.py と同じ位置付け)。

生成するファイル(public/sounds/training/ 内。Git管理外で、.gitignoreに記載済み):

- 調セットアップ:   <key>-setup-v01.wav               (Keyごとに1本、4本)
- 出題音:           <key>-q-<刺激ID>-v01.wav          (10刺激 × 4Key = 40本)
- フィードバック:   <key>-fb-<刺激ID>-v01.wav         (10刺激 × 4Key = 40本)
  Key接頭辞は c / es / fis / a。ファイル名の規則は src/training/stimuli.js と同じ。

テンポは ♩=120(1拍0.5秒、研究者の決定 2026-10-27)。前後に1拍(0.5秒)ずつの余白(無音)を付ける。
どのファイルもモノラル・44.1kHz・16bit。
- 調セットアップ: 8拍(5.0秒)。研究者が共有した楽譜(a)の内容:
    旋律 ソ(1) ミ(1) ファ(0.5) レ(0.5) シ(1) | ド(2) ド(2)
    和音 Ⅰ(2) Ⅳ(1) Ⅴ7(1) | Ⅰ(2) Ⅰ(2)、低音 C(2) F(1) G(1) | C(2) C(2)
- 出題音: 2拍(2.0秒)。1拍目 = 第1音+第1和音、2拍目 = ド+Ⅰ。
- フィードバック: 4拍(3.0秒)。第1音から2拍でドへの導線(和音は第1和音)、3〜4拍目 = ド+Ⅰ。
  フレーズの内容は研究者の決定(2026-10-27)。下の FEEDBACK_PHRASES を参照。

仮音源の中身(正式音源の構成とは無関係):
- メロディ: 鍵盤の並びに合わせ、ソ・ラ・シはドの下、レ・ミ・ファはドの上で鳴らす
- 主音(ド)の高さ: Key C=C4、Es=Es4、Fis=Fis4、A=A3(どのKeyもC4の近くに収める)
- 出題音・フィードバックの和音: メロディより1オクターブ下に、根音から積み上げる
- 調セットアップの和音の配置: 楽譜を厳密には再現せず、資料の転回形の規則
  (主和音は主音が最高音、他の和音は最高音が主音に近い)に沿った配置にする
- 音の大きさは、ファイルごとにピークを同じ値にそろえる

正式音源が揃ったら、このスクリプトで生成したファイルを正式WAVに差し替え、
このスクリプトは不要になる(削除してよい)。

Python標準ライブラリのみを使用し、追加のインストールは不要。
使い方: python3 scripts/generate-training-placeholder-audio.py
"""
import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 44100
BPM = 120
BEAT_SECONDS = 60 / BPM
MARGIN_BEATS = 1  # 前後の余白(拍)
SETUP_BEATS = 8
QUESTION_BEATS = 2
FEEDBACK_BEATS = 4
PEAK = 0.5  # 全ファイルでピークをこの値(満点=1.0)にそろえる
EDGE_FADE_SECONDS = 0.01  # 音の出入りのクリック音を防ぐ
NOTE_GAP_SECONDS = 0.04  # 同じ高さの音が続くときに区切って聞こえるようにする

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "public" / "sounds" / "training"

# 主音(ド)の高さ。C4からの半音数。
KEY_TONIC_SEMITONES = {"C": 0, "Es": 3, "Fis": 6, "A": -3}
FILENAME_PREFIX = {"C": "c", "Es": "es", "Fis": "fis", "A": "a"}
# メロディの音度 → ドからの半音数(鍵盤の並び: ソ ラ シ | ド | レ ミ ファ)。
MELODY_SEMITONES = {"n5": -5, "n6": -3, "n7": -1, "n1": 0, "n2": 2, "n3": 4, "n4": 5}
# 和音の根音の音度 → ドからの半音数(長音階)。
ROOT_SEMITONES = {"n1": 0, "n2": 2, "n3": 4, "n4": 5, "n5": 7, "n6": 9, "n7": 11}
CHORD_INTERVALS = {"maj": [0, 4, 7], "dom7": [0, 4, 7, 10]}

# (第1音の音度, 第1和音)。src/training/stimuli.js の TRAINING_STIMULI と同じ内容・同じ順
# (一致することを tests/training/placeholder-audio-script.test.js で確認している)。
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

# フィードバックのフレーズ: 第1音 → [(音度, 拍数), ...]。どれも計4拍で、最後はド(2拍)。
FEEDBACK_PHRASES = {
    "n1": [("n1", 1), ("n1", 1), ("n1", 2)],  # ド→ド→ド
    "n2": [("n2", 2), ("n1", 2)],  # レ→ド
    "n7": [("n7", 2), ("n1", 2)],  # シ→ド
    "n3": [("n3", 1), ("n2", 1), ("n1", 2)],  # ミ→レ→ド
    "n6": [("n6", 1), ("n7", 1), ("n1", 2)],  # ラ→シ→ド
    "n5": [("n5", 1), ("n6", 0.5), ("n7", 0.5), ("n1", 2)],  # ソ→ラ→シ→ド
    "n4": [("n4", 1), ("n3", 0.5), ("n2", 0.5), ("n1", 2)],  # ファ→ミ→レ→ド
}

# 調セットアップ(楽譜(a))。半音数は主音(ド)から。[(半音数のリスト, 拍数), ...]
SETUP_MELODY = [([7], 1), ([4], 1), ([5], 0.5), ([2], 0.5), ([-1], 1), ([0], 2), ([0], 2)]  # ソ ミ ファ レ シ | ド ド
SETUP_CHORDS = [
    ([4, 7, 12], 2),  # Ⅰ  (Key CでE4・G4・C5)
    ([5, 9, 12], 1),  # Ⅳ  (F4・A4・C5)
    ([2, 5, 7, 11], 1),  # Ⅴ7 (D4・F4・G4・B4)
    ([4, 7, 12], 2),  # Ⅰ
    ([4, 7, 12], 2),  # Ⅰ
]
SETUP_BASS = [([-12], 2), ([-19], 1), ([-17], 1), ([-12], 2), ([-12], 2)]  # C3 F2 G2 | C3 C3


def frequency(semitones_from_c4):
    return 261.6256 * (2.0 ** (semitones_from_c4 / 12.0))


def add_note(samples, freq, start_seconds, length_seconds, amplitude):
    start = int(round(start_seconds * SAMPLE_RATE))
    length = int(round(length_seconds * SAMPLE_RATE))
    fade = int(EDGE_FADE_SECONDS * SAMPLE_RATE)
    for i in range(length):
        envelope = min(1.0, i / fade, (length - 1 - i) / fade)
        samples[start + i] += amplitude * envelope * math.sin(2 * math.pi * freq * i / SAMPLE_RATE)


def beat_start(beat):
    return BEAT_SECONDS * (MARGIN_BEATS + beat)


def add_sequence(samples, key, events, amplitude):
    # events: [(主音からの半音数のリスト, 拍数), ...] を1拍目から順に鳴らす。和音は音量を音の数で割る。
    beat = 0.0
    for semitones_list, beats in events:
        for semitones in semitones_list:
            freq = frequency(KEY_TONIC_SEMITONES[key] + semitones)
            add_note(samples, freq, beat_start(beat), BEAT_SECONDS * beats - NOTE_GAP_SECONDS, amplitude / len(semitones_list))
        beat += beats


def chord_semitones(chord_ref):
    # "ch-n5-dom7" → 主音からの半音数(メロディより1オクターブ下に、根音から積み上げる)
    _, root_degree, quality = chord_ref.split("-")
    root = ROOT_SEMITONES[root_degree] - 12
    return [root + interval for interval in CHORD_INTERVALS[quality]]


def melody_events(notes):
    return [([MELODY_SEMITONES[degree]], beats) for degree, beats in notes]


def write_wav(path, samples):
    peak = max(abs(s) for s in samples) or 1.0
    scale = PEAK / peak
    data = b"".join(struct.pack("<h", int(round(s * scale * 32767))) for s in samples)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(data)


def new_buffer(content_beats):
    return [0.0] * int(round(BEAT_SECONDS * (content_beats + 2 * MARGIN_BEATS) * SAMPLE_RATE))


def stimulus_id(first_degree, first_chord_ref):
    return f"st-{first_degree}-{first_chord_ref}"


def filename(kind, key, first_degree, first_chord_ref):
    return f"{FILENAME_PREFIX[key]}-{kind}-{stimulus_id(first_degree, first_chord_ref)}-v01.wav"


def generate_setup(key):
    samples = new_buffer(SETUP_BEATS)
    add_sequence(samples, key, SETUP_CHORDS, 0.6)
    add_sequence(samples, key, SETUP_BASS, 0.4)
    add_sequence(samples, key, SETUP_MELODY, 0.8)
    write_wav(OUTPUT_DIR / f"{FILENAME_PREFIX[key]}-setup-v01.wav", samples)


def generate_question(key, first_degree, first_chord_ref):
    samples = new_buffer(QUESTION_BEATS)
    add_sequence(samples, key, [(chord_semitones(first_chord_ref), 1), (chord_semitones("ch-n1-maj"), 1)], 0.6)
    add_sequence(samples, key, melody_events([(first_degree, 1), ("n1", 1)]), 0.8)
    write_wav(OUTPUT_DIR / filename("q", key, first_degree, first_chord_ref), samples)


def generate_feedback(key, first_degree, first_chord_ref):
    samples = new_buffer(FEEDBACK_BEATS)
    add_sequence(samples, key, [(chord_semitones(first_chord_ref), 2), (chord_semitones("ch-n1-maj"), 2)], 0.6)
    add_sequence(samples, key, melody_events(FEEDBACK_PHRASES[first_degree]), 0.8)
    write_wav(OUTPUT_DIR / filename("fb", key, first_degree, first_chord_ref), samples)


def main():
    for phrase in FEEDBACK_PHRASES.values():
        assert sum(beats for _, beats in phrase) == FEEDBACK_BEATS and phrase[-1] == ("n1", 2), phrase
    for events in (SETUP_MELODY, SETUP_CHORDS, SETUP_BASS):
        assert sum(beats for _, beats in events) == SETUP_BEATS, events
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for key in KEY_TONIC_SEMITONES:
        generate_setup(key)
        for first_degree, first_chord_ref in STIMULI:
            generate_question(key, first_degree, first_chord_ref)
            generate_feedback(key, first_degree, first_chord_ref)
    print(f"{len(list(OUTPUT_DIR.glob('*.wav')))}本を {OUTPUT_DIR} に生成しました")


if __name__ == "__main__":
    main()
