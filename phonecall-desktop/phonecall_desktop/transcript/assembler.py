"""Assembles transcription events into one coherent conversation.

- events are applied idempotently: a final received twice is stored once;
- a partial is replaced by newer partials, then removed when the final arrives;
- segments are ordered by start time across channels;
- ECHO: without a headset, the microphone also picks up the remote party from the loudspeakers.
  A microphone segment overlapping in time a PC-sound segment with similar words is marked as
  echo and excluded (it stays visible, struck through, in the UI for transparency).
"""

from __future__ import annotations

import difflib
import re
import threading
import unicodedata
from dataclasses import asdict, dataclass

from ..audio.types import SPEAKER_OF_CHANNEL, Channel
from ..stt.base import TranscriptEvent
from .enhancer import TextEnhancer

SPEAKER_LABELS = {"advisor": "Conseiller", "remote": "Interlocuteur"}


@dataclass
class Segment:
    utterance_id: str
    channel: Channel
    t_start: float
    t_end: float
    text: str
    final: bool
    uncertain: bool = False
    echo: bool = False
    raw_text: str | None = None  # recognition output before the text enhancer (None: unchanged)

    @property
    def speaker(self) -> str:
        return SPEAKER_OF_CHANNEL[self.channel]

    def to_dict(self) -> dict:
        d = asdict(self)
        d["channel"] = self.channel.value
        d["speaker"] = self.speaker
        d["speaker_label"] = SPEAKER_LABELS[self.speaker]
        return d


def _words(text: str) -> list[str]:
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.findall(r"[a-z0-9]+", text)


def similarity(a: str, b: str) -> float:
    wa, wb = _words(a), _words(b)
    if not wa or not wb:
        return 0.0
    return difflib.SequenceMatcher(None, wa, wb).ratio()


class TranscriptAssembler:
    def __init__(self, echo_similarity: float = 0.6, echo_time_tolerance_s: float = 1.0,
                 enhancer: TextEnhancer | None = None):
        self.enhancer = enhancer
        self._finals: dict[str, Segment] = {}
        self._partials: dict[str, Segment] = {}
        self._lock = threading.Lock()
        self.echo_similarity = echo_similarity
        self.echo_tolerance = echo_time_tolerance_s
        self.duplicates_ignored = 0
        self.version = 0

    def apply(self, ev: TranscriptEvent) -> list[Segment]:
        """Returns the segments whose display changed."""
        with self._lock:
            if ev.utterance_id in self._finals:
                self.duplicates_ignored += 1
                return []
            if ev.kind == "partial":
                seg = Segment(ev.utterance_id, ev.channel, ev.t_start, ev.t_end, ev.text, final=False, uncertain=True)
                self._partials[ev.utterance_id] = seg
                self.version += 1
                return [seg]
            self._partials.pop(ev.utterance_id, None)
            text = self.enhancer.enhance(ev.text) if self.enhancer else ev.text
            seg = Segment(ev.utterance_id, ev.channel, ev.t_start, ev.t_end, text, final=True, uncertain=ev.uncertain,
                          raw_text=ev.text if text != ev.text else None)
            self._finals[ev.utterance_id] = seg
            changed = [seg] + self._update_echo(seg)
            self.version += 1
            return changed

    def _overlap(self, a: Segment, b: Segment) -> bool:
        return a.t_start < b.t_end + self.echo_tolerance and b.t_start < a.t_end + self.echo_tolerance

    def _update_echo(self, new: Segment) -> list[Segment]:
        changed = []
        others = [s for s in self._finals.values() if s.channel != new.channel and s.text and not s.echo]
        for other in others:
            mic, system = (new, other) if new.channel == Channel.MIC else (other, new)
            if mic.echo or not mic.text:
                continue
            if self._overlap(mic, system) and similarity(mic.text, system.text) >= self.echo_similarity:
                mic.echo = True
                changed.append(mic)
        return [c for c in changed if c is not new]  # ``new`` is already reported by apply()

    def snapshot(self, include_partials: bool = True) -> list[Segment]:
        with self._lock:
            items = list(self._finals.values()) + (list(self._partials.values()) if include_partials else [])
        return sorted((s for s in items if s.text), key=lambda s: (s.t_start, s.channel.value))

    def final_segments(self) -> list[Segment]:
        """What is sent for the note: definitive, non-empty, non-echo segments in order."""
        return [s for s in self.snapshot(include_partials=False) if not s.echo]

    def plain_text(self) -> str:
        return "\n".join(f"{SPEAKER_LABELS[s.speaker]} : {s.text}" for s in self.final_segments())

    def clear(self) -> None:
        with self._lock:
            self._finals.clear()
            self._partials.clear()
            self.version += 1
