# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
"""Música de foco do Poiesis — "Jardim de Luz".

Composição original gerada por código (síntese aditiva e FM, sem amostras de terceiros),
para tocar em loop sem emenda: os rastros das notas e a reverberação "dão a volta" no
fim do loop e caem no começo. Saída: public/audio/jardim-de-luz.opus

    python3 design/musica/compor.py   (precisa de numpy, scipy e ffmpeg com libopus)
"""
import os, subprocess, sys, tempfile
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 44100
BPM = 68
BEAT = 60 / BPM
BAR = 4 * BEAT
RNG = np.random.default_rng(20261025)  # semente fixa: a mesma música sempre

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "..", "..", "public", "audio", "jardim-de-luz.opus")

def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)

# ---------------------------------------------------------------- harmonia (Ré maior)
# acordes em MIDI: (baixo, notas do pad/teclado)
CH = {
    "Dmaj9": (38, [50, 54, 57, 61, 64]),
    "Bm11":  (35, [50, 54, 57, 59, 64]),
    "Gmaj9": (43, [50, 55, 59, 62, 66]),
    "A69":   (45, [52, 54, 57, 59, 61]),
    "Em9":   (40, [52, 55, 59, 62, 66]),
    "F#m7":  (42, [52, 54, 57, 61, 64]),
    "Gmaj7": (43, [50, 54, 55, 59, 61]),
    "A13":   (45, [52, 55, 57, 61, 66]),
}
A = ["Dmaj9", "Bm11", "Gmaj9", "A69"] * 2
B = ["Em9", "F#m7", "Gmaj7", "A13", "Em9", "F#m7", "Gmaj9", "A69"]
# seções: (acordes, teclado, bateria, sininhos)
FORM = [
    (A, 0.35, False, 0.0),   # entrada leve (combina com a saída: o loop não "recomeça")
    (A, 0.8, True, 0.15),
    (B, 0.9, True, 0.25),
    (A, 0.8, True, 0.35),
    (B, 0.7, True, 0.2),
    (A, 0.35, False, 0.1),   # saída leve
]
PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81]  # ré pentatônica (melodia e sininhos)

bars = sum(len(s[0]) for s in FORM)
L = int(round(bars * BAR * SR))
TAIL = int(6 * SR)

def bus():
    return np.zeros((2, L + TAIL))

dry, wet, drums = bus(), bus(), bus()

def put(buf, t, sig, pan=0.0, gain=1.0):
    i = int(round(t * SR))
    n = min(len(sig), buf.shape[1] - i)
    if n <= 0:
        return
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    buf[0, i:i + n] += sig[:n] * l * gain
    buf[1, i:i + n] += sig[:n] * r * gain

def env(n, a, d, s=0.0, rel=None):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    e *= s + (1 - s) * np.exp(-np.maximum(0, t - a) / d)
    if rel:
        k = int(rel * SR)
        if 0 < k < n:
            e[-k:] *= np.linspace(1, 0, k) ** 2
    return e

# ---------------------------------------------------------------- instrumentos
def epiano(m, vel, dur=2.6):
    """Piano elétrico (FM): portadora senoidal, modulador com índice que decai."""
    f = hz(m)
    n = int(dur * SR)
    t = np.arange(n) / SR
    idx = (1.6 + 1.4 * vel) * np.exp(-t / 0.35) + 0.25
    sig = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    sig += 0.12 * np.sin(2 * np.pi * f * 4.02 * t) * np.exp(-t / 0.08)  # "tine" curtinho
    sig *= env(n, 0.004, 0.9 + 0.5 * (60 / max(m, 40)), 0.0, rel=0.4)
    sig *= 1 + 0.08 * np.sin(2 * np.pi * 4.3 * t)  # tremolo leve
    return sig * vel

def pad(m, dur):
    f = hz(m)
    n = int((dur + 2.0) * SR)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    for det in (-0.004, 0.0035):
        ff = f * (1 + det)
        for h in range(1, 7):
            sig += np.sin(2 * np.pi * ff * h * t + RNG.uniform(0, 6.28)) / (h * h)
    a = np.minimum(1, t / 1.3)
    r = np.clip((dur + 2.0 - t) / 2.0, 0, 1)
    sig *= a * r * (0.8 + 0.2 * np.sin(2 * np.pi * 0.11 * t + m))
    sos = butter(2, 1800, "low", fs=SR, output="sos")
    return sosfilt(sos, sig)

def bass(m, dur, vel=1.0):
    f = hz(m)
    n = int((dur + 0.4) * SR)
    t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t) + 0.05 * np.sin(2 * np.pi * 3 * f * t)
    return sig * env(n, 0.012, 1.4, 0.35, rel=0.35) * vel

def bell(m, vel):
    f = hz(m)
    n = int(3.5 * SR)
    t = np.arange(n) / SR
    sig = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t / d) for k, a, d in ((1, 1, 1.1), (2.76, 0.35, 0.5), (5.4, 0.15, 0.25)))
    return sig * env(n, 0.002, 10) * vel

def kick(vel):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 46 + 44 * np.exp(-t / 0.04)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.16) * vel

def brush(vel):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = RNG.standard_normal(n)
    sos = butter(2, [900, 5200], "band", fs=SR, output="sos")
    return sosfilt(sos, noise) * np.minimum(1, t / 0.012) * np.exp(-t / 0.09) * vel

def hat(vel):
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    sos = butter(2, 6500, "high", fs=SR, output="sos")
    return sosfilt(sos, RNG.standard_normal(n)) * np.exp(-t / 0.018) * vel

# ---------------------------------------------------------------- arranjo
t0 = 0.0
last_mel = 69
for chords, keys, drum, bells in FORM:
    for ci, name in enumerate(chords):
        root, notes = CH[name]
        bt = t0
        # pad: o acorde inteiro, entrando devagar
        for m in notes[:4]:
            put(dry, bt, pad(m, BAR), pan=RNG.uniform(-0.5, 0.5), gain=0.05)
        # baixo
        put(dry, bt, bass(root, 1.6 * BEAT, 0.9), gain=0.30)
        if RNG.random() < 0.6:
            put(dry, bt + 2.5 * BEAT, bass(root + (7 if RNG.random() < 0.5 else 12), 1.2 * BEAT, 0.7), gain=0.24)
        # teclado: acorde dedilhado no 1 e às vezes no 3
        for k, m in enumerate(notes):
            put(dry, bt + 0.028 * k + RNG.uniform(0, 0.01), epiano(m, keys * RNG.uniform(0.55, 0.8)), pan=-0.35 + 0.17 * k, gain=0.11)
        if RNG.random() < 0.55 * keys:
            for k, m in enumerate(notes[1:4]):
                put(dry, bt + 2 * BEAT + 0.03 * k, epiano(m + 12 * (k == 2), keys * RNG.uniform(0.35, 0.55)), pan=0.2 - 0.2 * k, gain=0.09)
        # melodia esparsa na pentatônica, perto da nota anterior
        for e in range(8):
            if RNG.random() < 0.18 * keys and e not in (0,):
                cands = [p for p in PENTA if abs(p - last_mel) <= 5] or PENTA
                last_mel = int(RNG.choice(cands))
                swing = 0.08 * BEAT if e % 2 else 0
                put(dry, bt + e * BEAT / 2 + swing, epiano(last_mel, keys * RNG.uniform(0.45, 0.7), 2.2), pan=RNG.uniform(-0.2, 0.3), gain=0.10)
        # sininhos (o "pólen" e a "luz")
        if RNG.random() < bells:
            put(wet, bt + RNG.integers(1, 7) * BEAT / 2, bell(int(RNG.choice(PENTA[3:])) + 12, RNG.uniform(0.3, 0.5)), pan=RNG.uniform(-0.7, 0.7), gain=0.045)
        # bateria lo-fi bem baixinha
        if drum:
            for b in range(4):
                tb = bt + b * BEAT
                if b in (0, 2) or (b == 3 and RNG.random() < 0.25):
                    put(drums, tb + (BEAT / 2 if b == 3 else 0), kick(RNG.uniform(0.8, 1.0)), gain=0.32)
                if b in (1, 3):
                    put(drums, tb + 0.012, brush(RNG.uniform(0.6, 0.85)), pan=0.1, gain=0.10)
                for h in range(2):
                    if RNG.random() < 0.8:
                        put(drums, tb + h * BEAT * 0.58, hat(RNG.uniform(0.35, 0.6) * (1 if h == 0 else 0.7)), pan=0.3, gain=0.05)
        t0 += BAR

# ---------------------------------------------------------------- mixagem (loop sem emenda)
def fold(buf):
    out = buf[:, :L].copy()
    out[:, :TAIL] += buf[:, L:L + TAIL]
    return out

dry, wet, drums = fold(dry), fold(wet), fold(drums)

def reverb_ir(seconds=3.2, seed=7):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.zeros((2, n))
    for c in range(2):
        noise = r.standard_normal(n)
        lp = sosfilt(butter(1, 5000, "low", fs=SR, output="sos"), noise)
        ir[c] = (0.55 * lp + 0.45 * noise * np.exp(-t / 0.35)) * np.exp(-t / 0.9)
        ir[c, : int(0.012 * SR)] = 0  # pré-delay
    return ir / np.max(np.abs(ir))

def circ_conv(x, h):
    n = x.shape[1]
    H = np.fft.rfft(h, n)
    return np.fft.irfft(np.fft.rfft(x, n) * H, n)

ir = reverb_ir()
send = dry * 0.55 + wet
rev = np.stack([circ_conv(send[c:c + 1], ir[c:c + 1])[0] for c in range(2)]) * 0.012
mix = dry + wet * 0.3 + rev + drums * 0.9

# respiro de fundo: ruído rosado bem baixo, feito no domínio da frequência (já é periódico)
f = np.fft.rfftfreq(L, 1 / SR)
shape = np.where((f > 30) & (f < 2500), 1 / np.sqrt(np.maximum(f, 1)), 0)
pink = np.stack([np.fft.irfft(shape * np.exp(2j * np.pi * RNG.random(len(f))), L) for _ in range(2)])
pink /= np.max(np.abs(pink))
mix += pink * 0.006

# cor lo-fi e limite suave; os filtros "aquecem" com o fim do loop para não estalar na emenda
def circ_filter(x, sos, warm=int(3 * SR)):
    y = sosfilt(sos, np.concatenate([x[:, -warm:], x], axis=1), axis=1)
    return y[:, warm:]

mix = circ_filter(mix, butter(2, 9000, "low", fs=SR, output="sos"))
mix = circ_filter(mix, butter(1, 35, "high", fs=SR, output="sos"))
rms = np.sqrt(np.mean(mix ** 2))
mix *= 10 ** (-19 / 20) / rms  # ~ -19 dBFS RMS: fundo, não primeiro plano
mix = np.tanh(mix * 1.1) / 1.1
peak = np.max(np.abs(mix))
if peak > 0.89:
    mix *= 0.89 / peak

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with tempfile.TemporaryDirectory() as d:
    wav = os.path.join(d, "m.wav")
    wavfile.write(wav, SR, (mix.T * 32767).astype(np.int16))
    if "--wav" in sys.argv:
        import shutil
        shutil.copy(wav, os.path.join(ROOT, "jardim-de-luz.wav"))
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-c:a", "libopus", "-b:a", "72k", "-vbr", "on", "-application", "audio",
                    "-metadata", "title=Jardim de Luz", "-metadata", "artist=Poiesis", "-metadata", "comment=Composição original gerada por design/musica/compor.py (GPL-3.0-only)", OUT], check=True)
print(f"{L / SR:.1f} s, {bars} compassos → {os.path.relpath(OUT)} ({os.path.getsize(OUT) / 1024:.0f} KB)")
