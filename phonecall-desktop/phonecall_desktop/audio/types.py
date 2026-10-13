from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

import numpy as np


class Channel(str, Enum):
    SYSTEM = "system"  # sound played by the PC (remote party in Teams, softphone, browser...)
    MIC = "mic"  # advisor's microphone


SPEAKER_OF_CHANNEL = {Channel.SYSTEM: "remote", Channel.MIC: "advisor"}


@dataclass(frozen=True)
class AudioChunk:
    """16 kHz mono float32 audio positioned on the session timeline (seconds since Start)."""

    channel: Channel
    samples: np.ndarray
    t_start: float
    sample_rate: int = 16_000

    @property
    def duration(self) -> float:
        return len(self.samples) / self.sample_rate

    @property
    def t_end(self) -> float:
        return self.t_start + self.duration
