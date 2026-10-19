"""Audio diagnostic for Windows workstations (manual test procedure).

    python -m phonecall_desktop.diag                 # list WASAPI devices
    python -m phonecall_desktop.diag --record 10     # capture 10 s from the default (or chosen)
                                                     # PC sound + microphone and report levels

Nothing is written to disk except the text report printed on screen: no audio is saved.
"""

from __future__ import annotations

import argparse
import sys
import threading
import time

import numpy as np

from .audio.dsp import rms_dbfs, to_mono
from .audio.types import Channel
from .errors import AppError


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="phonecall_desktop.diag")
    ap.add_argument("--record", type=float, default=0, help="seconds to capture from each channel (0 = list only)")
    ap.add_argument("--system", help="device id of the output to capture (see list)")
    ap.add_argument("--mic", help="device id of the microphone (see list)")
    args = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure") and getattr(sys.stdout, "encoding", "").lower() != "utf-8":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # accents readable in redirected output
    print(f"Python {sys.version.split()[0]} — plateforme {sys.platform}")
    try:
        from .audio.devices import WasapiBackend

        backend = WasapiBackend()
        devices = backend.list_devices()
    except AppError as exc:
        print(f"ERREUR : {exc.user_message}")
        return 2
    except ImportError:
        print("ERREUR : PyAudioWPatch n'est pas installé (pip install PyAudioWPatch).")
        return 2
    print(f"{len(devices)} périphérique(s) WASAPI :")
    for d in devices:
        kind = "SON DU PC (loopback)" if d.channel == Channel.SYSTEM else "MICRO"
        print(f"  [{kind:20}] {'*' if d.is_default else ' '} {d.name}  ({d.sample_rate} Hz) id={d.id!r} {d.note}")
    if not devices:
        print("Aucun périphérique : vérifiez qu'un casque / des haut-parleurs et un micro sont actifs dans Windows.")
        return 1
    if args.record <= 0:
        return 0
    print(f"\nCapture de {args.record:.0f} s — parlez dans le micro et faites jouer un son (ou un appel test) …")
    results = {}
    for channel, dev in ((Channel.SYSTEM, args.system), (Channel.MIC, args.mic)):
        try:
            src = backend.open(dev, channel)
        except AppError as exc:
            results[channel] = f"impossible d'ouvrir : {exc.user_message}"
            continue
        buf: list[np.ndarray] = []
        first: list[float] = []
        lock = threading.Lock()

        def on_data(frames, b=buf, f=first, lock=lock):
            with lock:
                if not f:
                    f.append(time.monotonic())
                b.append(to_mono(frames))

        t0 = time.monotonic()
        src.start(on_data, lambda e: print(f"  erreur flux : {type(e).__name__}"))
        time.sleep(args.record)
        src.stop()
        audio = np.concatenate(buf) if buf else np.zeros(0, np.float32)
        secs = len(audio) / src.sample_rate
        level = rms_dbfs(audio)
        peak = 20 * np.log10(max(1e-9, float(np.max(np.abs(audio))))) if audio.size else -100
        verdict = ("AUCUNE DONNÉE (rien n'est joué sur ce périphérique, ou mauvais périphérique)" if secs == 0
                   else "silence (niveau très faible)" if level < -55 else "son détecté")
        results[channel] = (f"{src.device_name} : {secs:.1f} s reçues sur {args.record:.0f} s, "
                            f"{src.sample_rate} Hz × {src.channels} canal(aux), niveau {level:.0f} dBFS, crête {peak:.0f} dBFS, "
                            f"premier paquet après {((first[0] - t0) if first else float('nan')):.2f} s → {verdict}")
    for ch, text in results.items():
        print(f"  {'Son du PC' if ch == Channel.SYSTEM else 'Micro':9} : {text}")
    print("\nAucun son n'a été enregistré sur disque.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
