#!/usr/bin/env python3
"""機能的音感測定用の開発用代替音(仮音源)を生成する一時的なスクリプト。

正式な音源(リコーダー+ピアノのミックス済みWAV)はまだないため、研究者が共有した楽譜(a)(b)
(2026-10-29)のフレーズ構成を、サイン波の仮音源としてここで生成する。研究本番では使用できない
(scripts/generate-relative-pitch-placeholder-audio.py と同じ位置付け)。

生成するファイル(public/sounds/functional-pitch/ 内。Git管理外で、.gitignoreに記載済み):

- フレーズ24本: Key C・Fis(本番の10刺激ずつ)と、Key Es(練習の4刺激)
    <key>-phr-<stimulus-id>-v01.wav
- 音色確認2本: es-practice-recorder-only-v01.wav / es-practice-piano-only-v01.wav

どのファイルも 4.8秒(BPM 75、4/4拍子)・モノラル・44.1kHz・16bit。
- 0.0〜0.8秒: 前余白(無音)
- 0.8〜4.0秒: 4拍(各0.8秒。開始は 0.8 / 1.6 / 2.4 / 3.2秒)
- 4.0〜4.8秒: 後余白(無音)

仮音源の中身(楽譜(a)(b)の内容。Key C の音名で書く。Key Es・Fis は全体を平行移調する):
- 1拍に旋律1音+和音1つ。第1・2・4音は固定で、第3音だけが刺激によって変わる
    第1音: ド(C5) + I       第2音: ミ(E5) + I
    第3音: 刺激の旋律音度 + 刺激の和音
    第4音: ド(C5) + I + 低音C2
- 和音の配置: I = E3 G3 C4、IV = F3 A3 C4、V7 = D3 F3 G3 B3
- 旋律の音域: ソ・ラ・シ(n5〜n7)はドの下(G4〜B4)、レ・ミ・ファ(n2〜n4)はドの上(D5〜F5)
- 第4音の低音は、楽譜では高さがはっきりしないため C2 とした
- 音の大きさは、ファイルごとにピークを同じ値にそろえる

正式音源が揃ったら、このスクリプトで生成したファイルを正式WAVに差し替え、
このスクリプトは不要になる(削除してよい)。

Python標準ライブラリのみを使用し、追加のインストールは不要。
使い方: python3 scripts/generate-functional-pitch-placeholder-audio.py
"""
import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 44100
TOTAL_SECONDS = 4.8
BEAT_SECONDS = 0.8
FIRST_BEAT_SECONDS = 0.8
PEAK = 0.5  # 全ファイルでピークをこの値(満点=1.0)にそろえる
EDGE_FADE_SECONDS = 0.01  # 音の出入りのクリック音を防ぐ

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "public" / "sounds" / "functional-pitch"

KEY_SEMITONES = {"C": 0, "Es": 3, "Fis": 6}
FILENAME_PREFIX = {"C": "c", "Es": "es", "Fis": "fis"}
# 以下の音の高さは、Key C での C4 からの半音数(楽譜(a)(b)の配置)。
# 旋律: ソ・ラ・シはドの下、レ・ミ・ファはドの上。
MELODY_SEMITONES = {"n1": 12, "n2": 14, "n3": 16, "n4": 17, "n5": 7, "n6": 9, "n7": 11}
# 和音(根音度, 品質) → 構成音。I = E3 G3 C4、IV = F3 A3 C4、V7 = D3 F3 G3 B3。
CHORD_VOICINGS = {
    ("n1", "maj"): [-8, -5, 0],
    ("n4", "maj"): [-7, -3, 0],
    ("n5", "dom7"): [-10, -7, -5, -1],
}
FINAL_BASS = -24  # 第4音の低音 C2
TONIC = ("n1", "maj")

# (刺激ID, 和音根音度, 和音品質, 旋律音度)。src/functional-pitch/stimuli.js と同じ内容。
STIMULI = [
    ("ch-n1-maj-mel-n1", "n1", "maj", "n1"),
    ("ch-n1-maj-mel-n3", "n1", "maj", "n3"),
    ("ch-n1-maj-mel-n5", "n1", "maj", "n5"),
    ("ch-n4-maj-mel-n4", "n4", "maj", "n4"),
    ("ch-n4-maj-mel-n6", "n4", "maj", "n6"),
    ("ch-n4-maj-mel-n1", "n4", "maj", "n1"),
    ("ch-n5-dom7-mel-n5", "n5", "dom7", "n5"),
    ("ch-n5-dom7-mel-n7", "n5", "dom7", "n7"),
    ("ch-n5-dom7-mel-n2", "n5", "dom7", "n2"),
    ("ch-n5-dom7-mel-n4", "n5", "dom7", "n4"),
]
PRACTICE_STIMULUS_IDS = [
    "ch-n1-maj-mel-n1", "ch-n1-maj-mel-n3", "ch-n4-maj-mel-n1", "ch-n5-dom7-mel-n7",
]


def frequency(semitones_from_c4):
    return 261.6256 * (2.0 ** (semitones_from_c4 / 12.0))


def add_note(samples, freq, start_seconds, length_seconds, amplitude):
    start = int(round(start_seconds * SAMPLE_RATE))
    length = int(round(length_seconds * SAMPLE_RATE))
    fade = int(EDGE_FADE_SECONDS * SAMPLE_RATE)
    for i in range(length):
        envelope = min(1.0, i / fade, (length - 1 - i) / fade)
        samples[start + i] += amplitude * envelope * math.sin(2 * math.pi * freq * i / SAMPLE_RATE)


def beat_start(beat_index):
    return FIRST_BEAT_SECONDS + BEAT_SECONDS * beat_index


def add_chord(samples, key, chord, beat_index, with_bass=False):
    notes = CHORD_VOICINGS[chord] + ([FINAL_BASS] if with_bass else [])
    for semitones in notes:
        add_note(samples, frequency(KEY_SEMITONES[key] + semitones), beat_start(beat_index),
                 BEAT_SECONDS - 0.05, 1.0 / len(notes))


def add_melody_note(samples, key, degree, beat_index):
    semitones = KEY_SEMITONES[key] + MELODY_SEMITONES[degree]
    add_note(samples, frequency(semitones), beat_start(beat_index), BEAT_SECONDS - 0.05, 0.8)


def phrase_beats(chord, melody):
    # 楽譜(a): (旋律音度, 和音, 低音の有無) を4拍分。第3音だけが刺激によって変わる。
    return [("n1", TONIC, False), ("n3", TONIC, False), (melody, chord, False), ("n1", TONIC, True)]


def write_wav(path, samples):
    peak = max(abs(s) for s in samples) or 1.0
    scale = PEAK / peak
    data = b"".join(struct.pack("<h", int(round(s * scale * 32767))) for s in samples)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(data)


def new_buffer():
    return [0.0] * int(round(TOTAL_SECONDS * SAMPLE_RATE))


def generate_phrase(key, stimulus):
    stimulus_id, chord_root, quality, melody = stimulus
    samples = new_buffer()
    for beat, (degree, chord, with_bass) in enumerate(phrase_beats((chord_root, quality), melody)):
        add_melody_note(samples, key, degree, beat)
        add_chord(samples, key, chord, beat, with_bass)
    write_wav(OUTPUT_DIR / f"{FILENAME_PREFIX[key]}-phr-{stimulus_id}-v01.wav", samples)


def generate_tone_checks():
    # 楽譜(a)そのまま(第3音 = レ + V7)を、旋律だけ・和音だけに分けて鳴らす。
    # リコーダー単独: ド・ミ・レ・ド。ピアノ単独: I・I・V7・I(最後は低音つき)。
    beats = phrase_beats(("n5", "dom7"), "n2")
    recorder = new_buffer()
    for beat, (degree, _, _) in enumerate(beats):
        add_melody_note(recorder, "Es", degree, beat)
    write_wav(OUTPUT_DIR / "es-practice-recorder-only-v01.wav", recorder)

    piano = new_buffer()
    for beat, (_, chord, with_bass) in enumerate(beats):
        add_chord(piano, "Es", chord, beat, with_bass)
    write_wav(OUTPUT_DIR / "es-practice-piano-only-v01.wav", piano)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for key in ("C", "Fis"):
        for stimulus in STIMULI:
            generate_phrase(key, stimulus)
    for stimulus in STIMULI:
        if stimulus[0] in PRACTICE_STIMULUS_IDS:
            generate_phrase("Es", stimulus)
    generate_tone_checks()
    print(f"{len(list(OUTPUT_DIR.glob('*.wav')))}本を {OUTPUT_DIR} に生成しました")


if __name__ == "__main__":
    main()
