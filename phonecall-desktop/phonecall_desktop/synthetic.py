"""SYNTHETIC test conversations (fictitious, no real customer).

Each scenario is a list of turns. ``generate_wav`` renders a 2-channel WAV
(channel 0 = remote party / PC sound, channel 1 = advisor / microphone) where each turn is a
voice-like signal (harmonic tone with syllable rhythm) of a duration proportional to the number
of words, plus the matching script used by the scripted recogniser. With ``tts=True`` the turns
are spoken by espeak-ng (real French speech for the recognition benchmark).
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

SECONDS_PER_WORD = 0.32
GAP_S = 0.8

SCENARIOS: dict[str, list[tuple[str, str]]] = {
    "demenagement": [
        ("mic", "Sector Alarm bonjour, je vous écoute."),
        ("system", "Bonjour, je vous appelle parce que je déménage le mois prochain et je voudrais garder mon alarme."),
        ("mic", "Très bien. Vous déménagez dans une maison ou dans un appartement ?"),
        ("system", "Dans une maison, un peu plus grande que mon appartement actuel."),
        ("mic", "D'accord. Un technicien désinstalle le matériel puis l'installe dans la maison. Une étude pourra être nécessaire."),
        ("system", "Et combien ça coûterait, le matériel en plus ?"),
        ("mic", "Je ne peux pas vous donner de montant aujourd'hui. Je peux vous proposer un rendez-vous avec un technicien."),
        ("system", "Je préfère en parler avec ma compagne, je vous rappellerai pour le rendez-vous."),
        ("mic", "Aucun souci. Je viens de vous envoyer le formulaire de déménagement par e-mail."),
        ("system", "Parfait, merci beaucoup, au revoir."),
    ],
    "resiliation": [
        ("mic", "Sector Alarm bonjour."),
        ("system", "Bonjour, je souhaite résilier mon contrat, l'abonnement est devenu trop cher pour moi."),
        ("mic", "Je comprends. Est-ce uniquement une question de prix ?"),
        ("system", "Oui, le service me convient, c'est vraiment le prix."),
        ("mic", "Je peux vous proposer deux mois d'abonnement offerts si vous conservez votre contrat."),
        ("system", "D'accord, dans ce cas je garde le contrat."),
        ("mic", "C'est noté, j'ai appliqué les deux mois offerts sur votre contrat."),
        ("system", "Merci, au revoir."),
    ],
}


def _voice_like(seconds: float, rate: int, f0: float, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(int(seconds * rate)) / rate
    vibrato = f0 * (1 + 0.03 * np.sin(2 * np.pi * 5 * t))
    phase = 2 * np.pi * np.cumsum(vibrato) / rate
    sig = np.sin(phase) + 0.5 * np.sin(2 * phase) + 0.3 * np.sin(3 * phase)
    syllables = 0.55 + 0.45 * np.abs(np.sin(2 * np.pi * 3.2 * t + rng.uniform(0, np.pi)))
    fade = np.minimum(1, np.minimum(t, seconds - t) / 0.03)
    return (0.25 * sig * syllables * fade / 1.8).astype(np.float32)


def _espeak(text: str, rate: int) -> np.ndarray:
    exe = shutil.which("espeak-ng") or shutil.which("espeak")
    if not exe:
        raise RuntimeError("espeak-ng is required for tts=True")
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "tts.wav"
        subprocess.run([exe, "-v", "fr", "-s", "150", "-w", str(out), text], check=True, capture_output=True)
        with wave.open(str(out), "rb") as w:
            sr, n = w.getframerate(), w.getnframes()
            data = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32) / 32768.0
    if sr != rate:
        import soxr

        data = soxr.resample(data, sr, rate)
    return (data * 0.8).astype(np.float32)


PIPER_VOICES = {"system": "fr_FR-siwis-medium", "mic": "fr_FR-tom-medium"}


def _piper(text: str, rate: int, voice: str, data_dir: Path) -> np.ndarray:
    """Neural French voice (piper-tts, local). Voices are downloaded beforehand with
    ``python -m piper.download_voices <voice> --data-dir <dir>``."""
    import sys

    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "tts.wav"
        subprocess.run([sys.executable, "-m", "piper", "-m", voice, "--data-dir", str(data_dir), "-f", str(out), "--", text],
                       check=True, capture_output=True)
        with wave.open(str(out), "rb") as w:
            sr, n = w.getframerate(), w.getnframes()
            data = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32) / 32768.0
    if sr != rate:
        import soxr

        data = soxr.resample(data, sr, rate)
    return (data * 0.8).astype(np.float32)


def generate_wav(scenario: str, out_dir: str | Path, rate: int = 22_050, tts: bool | str = False,
                 noise_dbfs: float = -60.0, seed: int = 1, piper_dir: Path | None = None) -> tuple[Path, Path]:
    """Returns (wav_path, script_path)."""
    rng = np.random.default_rng(seed)
    turns = SCENARIOS[scenario]
    pieces: list[tuple[int, float, np.ndarray, str]] = []
    t = 1.0
    for who, text in turns:
        ch = 0 if who == "system" else 1
        if tts == "piper":
            audio = _piper(text, rate, PIPER_VOICES[who], piper_dir or Path("."))
        elif tts:
            audio = _espeak(text, rate)
        else:
            audio = _voice_like(len(text.split()) * SECONDS_PER_WORD, rate, 130.0 if ch else 210.0, rng)
        pieces.append((ch, t, audio, text))
        t += len(audio) / rate + GAP_S
    total = int((t + 1.0) * rate)
    data = np.zeros((total, 2), dtype=np.float32)
    noise_amp = 10 ** (noise_dbfs / 20)
    data[:, 1] += rng.normal(0, noise_amp, total).astype(np.float32)  # microphone floor noise
    script = []
    for ch, start, audio, text in pieces:
        i = int(start * rate)
        data[i : i + len(audio), ch] += audio
        script.append({"channel": "system" if ch == 0 else "mic", "start": round(start, 3),
                       "end": round(start + len(audio) / rate, 3), "text": text})
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    suffix = "_piper" if tts == "piper" else "_tts" if tts else ""
    wav_path = out_dir / f"{scenario}{suffix}.wav"
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    with wave.open(str(wav_path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    script_path = out_dir / f"{scenario}{suffix}.script.json"
    script_path.write_text(json.dumps({"scenario": scenario, "synthetic": True, "segments": script},
                                      ensure_ascii=False, indent=1), encoding="utf-8")
    return wav_path, script_path


def ensure_test_audio(out_dir: str | Path) -> Path:
    out_dir = Path(out_dir)
    for name in SCENARIOS:
        if not (out_dir / f"{name}.wav").exists():
            generate_wav(name, out_dir)
    return out_dir
