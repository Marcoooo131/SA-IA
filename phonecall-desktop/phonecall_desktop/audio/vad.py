"""Energy-based voice activity detection with an adaptive noise floor.

Deliberately simple and dependency-free. It only decides *where utterances start and end*;
the recogniser does the actual speech/no-speech judgement on each utterance.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .dsp import rms_dbfs

FRAME_S = 0.03  # 30 ms


@dataclass
class VadConfig:
    min_speech_dbfs: float = -48.0  # absolute floor: quieter is never speech
    margin_db: float = 10.0  # speech must exceed the noise floor by this much
    noise_adapt: float = 0.05  # noise floor tracking speed (on non-speech frames)
    start_frames: int = 3  # consecutive speech frames to open an utterance (90 ms)


class EnergyVad:
    def __init__(self, cfg: VadConfig | None = None):
        self.cfg = cfg or VadConfig()
        self.noise_floor = -70.0
        self._run = 0

    def is_speech(self, frame: np.ndarray) -> bool:
        level = rms_dbfs(frame)
        threshold = max(self.cfg.min_speech_dbfs, self.noise_floor + self.cfg.margin_db)
        speech = level >= threshold
        if not speech:
            self.noise_floor += self.cfg.noise_adapt * (level - self.noise_floor)
            self._run = 0
        else:
            self._run += 1
        return speech

    @property
    def speech_confirmed(self) -> bool:
        return self._run >= self.cfg.start_frames
