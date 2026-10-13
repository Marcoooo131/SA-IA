"""Speech recognition interfaces.

``Recognizer`` turns one utterance (16 kHz mono float32) into text. The streaming layer
(``StreamingTranscriber``) decides *when* to call it: provisional ("partial") results while the
person is speaking, a definitive ("final") result once the utterance is over. Finals are never
modified afterwards, so the transcript never shows duplicates or rewrites of validated text.

A cloud streaming provider (Azure Speech, AssemblyAI, Deepgram, Speechmatics...) can be added by
implementing ``Recognizer`` (utterance mode) or by producing ``TranscriptEvent`` directly.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import numpy as np

from ..audio.types import Channel


@dataclass(frozen=True)
class RecognitionResult:
    text: str
    confidence: float | None = None  # indicative, NOT a calibrated probability
    uncertain: bool = False


@dataclass(frozen=True)
class TranscriptEvent:
    kind: str  # "partial" | "final"
    channel: Channel
    utterance_id: str  # stable id: "<channel>-<n>"
    t_start: float
    t_end: float
    text: str
    uncertain: bool = False
    confidence: float | None = None


class Recognizer(ABC):
    name = "abstract"

    @abstractmethod
    def transcribe(self, audio: np.ndarray, *, context: str = "", fast: bool = False,
                   channel: Channel | None = None, t_start: float = 0.0) -> RecognitionResult:
        """``fast`` is used for provisional results (cheaper decoding). ``channel``/``t_start``
        locate the utterance on the session timeline (informative)."""

    def warmup(self) -> None:
        """Load models before the first call (so 'Démarrer' is not slowed down)."""
