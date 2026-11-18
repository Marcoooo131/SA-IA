"""Bande son originale de la publicité Venio : musique + design sonore, synthétisés (aucun échantillon externe).

Grille : 100 BPM, une mesure = 2,4 s ; les temps forts de l'image (13,2 / 22,8 / 39,6 / 51,6 / 61,2 / 70,8 s)
tombent sur des débuts de mesure. Les événements ponctuels (sonnerie, taps, cartes, impacts) viennent de events.json.
"""
import json
import sys

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
EV = json.load(open(sys.argv[1]))
EV["notif"] = [7.6, 8.6, 9.2, 9.8]
OUT = sys.argv[2]
END = 80.0
N = int(END * SR) + SR * 4
BEAT = 0.6
BAR = 2.4
G0 = 13.2  # origine de la grille (première mesure « solution »)
rng = np.random.default_rng(7)

mix = {k: np.zeros((N, 2)) for k in ("music", "drums", "fx")}


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def lp(x, f, order=2):
    return sosfilt(butter(order, min(f, SR / 2 - 100), "low", fs=SR, output="sos"), x, axis=0)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x, axis=0)


def env(n, a=0.005, d=0.1, s=0.7, r=0.2, hold=None):
    t = np.arange(n) / SR
    hold = hold if hold is not None else n / SR - r
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = np.clip(1 - (t - hold) / max(r, 1e-6), 0, 1)
    return e * np.where(t > hold, rel, 1)


def put(bus, t0, sig, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= N:
        return
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l, sig * r], 1) * np.sqrt(2)
    j = min(N, i + len(sig))
    mix[bus][i:j] += sig[: j - i] * gain


def saw(f, n, detune=0.0, harm=24):
    t = np.arange(n) / SR
    out = np.zeros(n)
    ff = f * (1 + detune)
    for k in range(1, harm + 1):
        if ff * k > SR / 2.2:
            break
        out += np.sin(2 * np.pi * ff * k * t + rng.uniform(0, 6.28)) / k
    return out * 0.6


def sine(f, n, ph=0.0):
    return np.sin(2 * np.pi * f * np.arange(n) / SR + ph)


# ---------------- instruments ----------------
def pad(notes, dur, cutoff=1400, gain=0.12, attack=0.8, release=1.2):
    n = int((dur + release) * SR)
    sig = np.zeros((n, 2))
    for m in notes:
        for d, p in ((-0.004, -0.6), (0.0, 0.0), (0.005, 0.6)):
            s = saw(hz(m), n, d, harm=14)
            l, r = np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)
            sig[:, 0] += s * l
            sig[:, 1] += s * r
    sig = lp(sig, cutoff, 2)
    e = env(n, attack, 1.0, 1.0, release, hold=dur)
    return sig * e[:, None] * gain * 1.7 / len(notes)


def pluck(m, dur=0.35, cutoff=3200, gain=0.16):
    gain *= 1.7
    n = int((dur + 0.3) * SR)
    s = saw(hz(m), n, 0, 18) + 0.5 * saw(hz(m + 12), n, 0.002, 10)
    t = np.arange(n) / SR
    # filtre qui se ferme : attaque brillante, queue douce
    bright = lp(s, cutoff)
    dull = lp(s, 700)
    k = np.exp(-t / 0.08)
    s = bright * k + dull * (1 - k)
    return s * np.exp(-t / (dur * 0.55)) * gain


def bass(m, dur, gain=0.32):
    gain *= 0.75
    n = int((dur + 0.05) * SR)
    s = 0.6 * sine(hz(m), n) + 0.5 * lp(saw(hz(m), n, 0, 10), 700)
    return s * env(n, 0.01, 0.3, 0.8, 0.08, hold=dur - 0.05) * gain


def kick(gain=0.9):
    gain *= 0.72
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 45 + 95 * np.exp(-t / 0.04)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t / 0.11)
    click = hp(rng.standard_normal(n), 2000) * np.exp(-t / 0.004) * 0.25
    return (s + click) * gain


def clap(gain=0.22):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    nz = bp(rng.standard_normal(n), 900, 4000)
    e = np.exp(-t / 0.09) * (1 + 0.6 * np.exp(-((t - 0.012) % 0.011) / 0.002) * (t < 0.035))
    return nz * e * gain


def hat(open_=False, gain=0.06):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7000, 3) * np.exp(-t / (0.08 if open_ else 0.015)) * gain


def bell(f, dur=2.2, gain=0.18, ratio=3.5, index=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * f * ratio * t) * index * np.exp(-t / 0.35)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t / (dur / 3.2)) * gain


def noise_sweep(dur, f0, f1, gain=0.2, shape="up"):
    n = int(dur * SR)
    out = np.zeros(n)
    nz = rng.standard_normal(n)
    blk = 1024
    for i in range(0, n, blk):
        x = i / n
        fc = f0 * (f1 / f0) ** x
        seg_ = nz[max(0, i - 2048): i + blk]
        y = bp(seg_, max(40, fc * 0.7), min(SR / 2.3, fc * 1.4))
        out[i: i + blk] = y[-len(nz[i: i + blk]):]
    t = np.linspace(0, 1, n)
    e = t ** 2 if shape == "up" else np.sin(np.pi * t) ** 1.5
    return out * e * gain


def impact(gain=1.0):
    gain *= 0.7
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    f = 32 + 70 * np.exp(-t / 0.08)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.9)
    boom = lp(rng.standard_normal(n), 600) * np.exp(-t / 0.35) * 0.5
    return (sub + boom) * gain


def ringtone(dur):
    """Sonnerie d'un téléphone posé sur une table : deux notes alternées, timbre doux, filtrée comme un petit haut-parleur."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    seq = (np.floor(t / 0.11) % 2).astype(int)
    f = np.where(seq == 0, hz(81), hz(85))
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) + 0.3 * np.sin(3 * ph) + 0.12 * np.sin(5 * ph)
    s = bp(s, 500, 5000)
    e = np.clip(t / 0.02, 0, 1) * np.clip((dur - t) / 0.05, 0, 1)
    buzz = lp(rng.standard_normal(n), 180) * 0.6 * (np.sin(2 * np.pi * 28 * t) > 0)  # vibreur sur la table
    return s * e * 0.12 + buzz * e * 0.035


def tap_click():
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1900 * t) * np.exp(-t / 0.006) + hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.002) * 0.3) * 0.12


def thud(f=hz(45)):
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    return lp(np.sin(2 * np.pi * f * t) * np.exp(-t / 0.12) + 0.3 * rng.standard_normal(n) * np.exp(-t / 0.02), 900) * 0.35


# ---------------- arrangement ----------------
Am, F, C, G = [45, 52], [53, 57, 60, 64], [52, 55, 60, 62], [50, 55, 59, 62]
PROG = [(F, 41), (C, 36), ([52, 57, 60, 67], 33), (G, 31)]  # accords + basse (MIDI)

# 1. Le problème : nappe grave en la mineur, tension
put("music", 0.3, pad([33, 45, 52], 12.6, cutoff=500, gain=0.20, attack=3.0, release=1.0))
put("music", 4.0, pad([57, 60, 64, 71], 9.0, cutoff=900, gain=0.045, attack=4.0, release=0.8), pan=0.2)
for k in range(5):  # pulsation sourde, comme un cœur
    t0 = 2.4 + k * 1.2
    put("fx", t0, thud(hz(36)), 0.35)
for a, b in EV["ring"]:
    put("fx", a, ringtone(b - a), 0.9, pan=0.25)
put("fx", EV["missed"][0], bell(hz(76), 1.6, 0.05, ratio=1.0, index=0.3), pan=0.25)
put("fx", EV["missed"][0] + 0.18, bell(hz(71), 1.8, 0.05, ratio=1.0, index=0.3), pan=0.25)
for t0 in EV["notif"]:
    put("fx", t0, thud(hz(40)), 0.6)
    put("fx", t0 + 0.01, bell(hz(88), 0.6, 0.018, ratio=1.0, index=0.2), pan=0.3)
put("fx", 10.8, noise_sweep(2.4, 300, 6000, 0.10, "up"))  # montée vers la révélation
put("music", 10.0, pad([45, 52, 57], 3.2, cutoff=1200, gain=0.10, attack=2.5, release=0.3))

# 2-6. Grille musicale à partir de 13,2 s
def bar_t(i):
    return G0 + i * BAR

put("fx", 12.9, noise_sweep(0.9, 8000, 400, 0.12, "mid"), pan=-0.2)
put("drums", 13.2, impact(0.55))
SECTIONS = [  # (première mesure, dernière exclue, intensité)
    (0, 4, 1),     # 13,2 – 22,8 : la solution (nappe + pulsation)
    (4, 11, 2),    # 22,8 – 39,6 : l'expérience client (groove)
    (11, 16, 3),   # 39,6 – 51,6 : tableau de bord
    (16, 20, 3),   # 51,6 – 61,2 : automatisations
    (20, 24, 4),   # 61,2 – 70,8 : la promesse (sommet)
]
for b0, b1, lvl in SECTIONS:
    for i in range(b0, b1):
        t0 = bar_t(i)
        notes, root = PROG[i % 4]
        cut = {1: 1100, 2: 1600, 3: 2200, 4: 3200}[lvl]
        put("music", t0, pad(notes, BAR, cutoff=cut, gain={1: 0.12, 2: 0.10, 3: 0.11, 4: 0.13}[lvl], attack=0.25 if lvl > 1 else 0.9, release=0.6))
        if lvl >= 4:
            put("music", t0, pad([n + 12 for n in notes], BAR, cutoff=4200, gain=0.05, attack=0.1, release=0.5), pan=0.1)
        # basse
        if lvl >= 2:
            for k, (off, d) in enumerate(((0, 0.55), (0.9, 0.28), (1.2, 0.55), (2.1, 0.28))):
                put("music", t0 + off, bass(root + (12 if k % 2 else 0) * 0, d, gain=0.30 if lvl < 4 else 0.36))
        else:
            put("music", t0, bass(root, BAR - 0.1, gain=0.20))
        # arpège (doubles croches)
        arp = notes + [notes[1] + 12, notes[2] + 12]
        steps = 16 if lvl >= 2 else 8
        for k in range(steps):
            dt = BAR / steps
            m = arp[(k * 3 + (k // 4)) % len(arp)] + 12
            g = (0.10 if lvl == 1 else 0.12) * (1.0 if k % 4 == 0 else 0.7)
            put("music", t0 + k * dt, pluck(m, 0.28 if lvl >= 2 else 0.45, cutoff=1800 + 600 * lvl, gain=g), pan=0.35 * np.sin(k * 1.3))
        # batterie
        for bt in range(4):
            tb = t0 + bt * BEAT
            if lvl >= 2:
                put("drums", tb, kick(0.75 if lvl < 4 else 0.9))
            elif bt in (0,):
                put("drums", tb, kick(0.35))
            if lvl >= 2 and bt in (1, 3):
                put("drums", tb, clap(0.16 if lvl < 4 else 0.22), pan=0.05)
            if lvl >= 2:
                put("drums", tb + BEAT / 2, hat(open_=(lvl >= 3 and bt == 3), gain=0.05), pan=-0.3)
                if lvl >= 3:
                    put("drums", tb, hat(gain=0.03), pan=0.3)
                    put("drums", tb + BEAT * 0.75, hat(gain=0.025), pan=0.3)
    # transition : montée sur la dernière mesure de chaque section
    put("fx", bar_t(b1) - 1.6, noise_sweep(1.6, 500, 9000, 0.07 + 0.02 * lvl, "up"), pan=0.1)

# accents
for t0 in EV["whoosh"][1:4]:
    put("fx", t0 - 0.3, noise_sweep(0.8, 6000, 300, 0.10, "mid"), pan=-0.3)
put("fx", EV["sms"][0], bell(hz(84), 1.2, 0.09, ratio=2.0, index=0.8), pan=0.3)
put("fx", EV["sms"][0] + 0.12, bell(hz(91), 1.4, 0.07, ratio=2.0, index=0.8), pan=0.3)
for t0 in EV["tap"]:
    put("fx", t0 + 0.05, tap_click(), pan=0.3)
for k, m in enumerate((72, 76, 79, 84)):  # confirmation : arpège clair
    put("fx", EV["success"][0] + k * 0.09, bell(hz(m), 2.0, 0.08, ratio=1.0, index=0.6), pan=0.3)
for k, t0 in enumerate(EV["card"]):  # cartes d'automatisation : notes montantes
    put("fx", t0, bell(hz([69, 72, 74, 76, 79][k] + 12), 1.4, 0.07, ratio=2.0, index=1.0), pan=0.4 - 0.2 * k)
    put("fx", t0, tap_click(), 0.6, pan=0.4)
for t0 in EV["impact"][:3]:
    put("drums", t0, impact(0.7))

# 7. Conclusion : coupure, impact, logo, accord final
put("fx", 69.8, noise_sweep(1.0, 400, 10000, 0.14, "up"))
put("drums", 70.8, impact(1.0))
put("music", 70.8, pad([29, 41, 48, 57, 64, 67], 8.6, cutoff=2400, gain=0.16, attack=0.05, release=2.0))
put("music", 70.8, bass(29, 6.0, 0.30))
for k, m in enumerate((65, 72, 76, 79)):
    put("fx", EV["logo"][0] + k * 0.11, bell(hz(m + 12), 3.2, 0.07, ratio=1.0, index=0.5), pan=-0.2 + 0.15 * k)
put("music", 73.9, pad([65, 69, 72, 76], 5.6, cutoff=3000, gain=0.05, attack=1.5, release=1.5), pan=0.2)


# ---------------- mixage ----------------
def reverb(x, secs=2.6, mixv=0.25, damp=5000):
    n = int(secs * SR)
    t = np.arange(n) / SR
    ir = np.stack([rng.standard_normal(n), rng.standard_normal(n)], 1) * np.exp(-t / (secs / 6.5))[:, None]
    ir = lp(ir, damp)
    ir[: int(0.012 * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum(0))
    wet = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in (0, 1)], 1)
    return x * (1 - mixv) + wet * mixv * 1.6


music = reverb(mix["music"], 2.8, 0.30)
drums = reverb(mix["drums"], 1.4, 0.12)
fx = reverb(mix["fx"], 2.2, 0.28)
# compression latérale légère : la musique s'efface sous chaque kick
duck = np.ones(N)
for b0, b1, lvl in SECTIONS:
    if lvl < 2:
        continue
    for i in range(b0, b1):
        for bt in range(4):
            j = int((bar_t(i) + bt * BEAT) * SR)
            k = np.arange(int(0.25 * SR))
            duck[j: j + len(k)] = np.minimum(duck[j: j + len(k)], 1 - 0.35 * np.exp(-k / (0.08 * SR)))
music *= duck[:, None]
out = music + drums + fx
# coupure nette avant l'impact final (silence de respiration)
cut = int(70.55 * SR), int(70.8 * SR)
fade = np.linspace(1, 0, cut[1] - cut[0])[:, None]
pre = out[: cut[0]].copy()
out[cut[0]: cut[1]] *= fade
# fondu final
end = int(END * SR)
out[end - int(1.2 * SR): end] *= np.linspace(1, 0, int(1.2 * SR))[:, None]
out = out[:end]
out = hp(out, 32)
# légère présence dans les médiums (lisibilité sur petits haut-parleurs)
out = out + 0.35 * bp(out, 1500, 5000)
out = np.tanh(out * 1.4) / 1.4
out /= np.abs(out).max() / 0.89
import wave

pcm = (out * 32767).astype("<i2")
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("ok", OUT, out.shape[0] / SR, "s")
