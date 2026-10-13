"""SIMULATION — recogniser driven by a script (tests, demo, UI checks). No real recognition.

The script lists what is said and when: ``[(channel, t_start, t_end, text), ...]``. The recogniser
returns the text of the script lines overlapping the utterance; partials return the beginning.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import numpy as np

from ..audio.types import Channel
from .base import RecognitionResult, Recognizer


class ScriptedRecognizer(Recognizer):
    name = "scripted"

    def __init__(self, script: list[tuple[str, float, float, str]], delay_s: float = 0.0):
        self.script = [(Channel(c), a, b, t) for c, a, b, t in script]
        self.delay_s = delay_s
        self.calls = 0

    @classmethod
    def from_file(cls, path: str | Path, delay_s: float = 0.0) -> ScriptedRecognizer:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls([(s["channel"], s["start"], s["end"], s["text"]) for s in data["segments"]], delay_s)

    def transcribe(self, audio: np.ndarray, *, context: str = "", fast: bool = False,
                   channel: Channel | None = None, t_start: float = 0.0) -> RecognitionResult:
        self.calls += 1
        if self.delay_s:
            time.sleep(self.delay_s)
        t0, t1 = t_start, t_start + len(audio) / 16_000
        mid = (t0 + t1) / 2
        lines = [t for c, a, b, t in self.script if c == channel and a < t1 - 0.1 and b > t0 + 0.1]
        text = " ".join(lines)
        uncertain = "[inaudible]" in text
        if fast:
            words = text.split()
            covered = [t for c, a, b, t in self.script if c == channel and a < t1 and b > t0 and a < mid]
            text = " ".join(words[: max(1, len(words) // 2)]) if covered else ""
        return RecognitionResult(text=text, confidence=None if not text else 0.9, uncertain=uncertain)
