"""Places a device stream on the session timeline.

WASAPI loopback delivers *no packets at all* while nothing is played. Without correction, the
remote party's next sentence would be glued to the previous one and timestamps would drift.
The timeline therefore inserts silence for every gap longer than ``gap_tolerance`` and lets the
capture monitor push silence while a source is quiet, so utterances are closed on time.
"""

from __future__ import annotations

import numpy as np

from .dsp import TARGET_RATE, Resampler, to_mono
from .types import AudioChunk, Channel


class ChannelTimeline:
    def __init__(self, channel: Channel, in_rate: int, session_start: float, gap_tolerance: float = 0.25):
        self.channel = channel
        self.in_rate = int(in_rate)
        self.session_start = session_start
        self.gap_tolerance = gap_tolerance
        self.resampler = Resampler(self.in_rate, TARGET_RATE)
        self.produced = 0  # output samples (16 kHz) emitted so far

    @property
    def position(self) -> float:
        return self.produced / TARGET_RATE

    def _emit(self, samples: np.ndarray) -> AudioChunk | None:
        if samples.size == 0:
            return None
        chunk = AudioChunk(self.channel, samples.astype(np.float32, copy=False), self.position)
        self.produced += len(samples)
        return chunk

    def _silence_until(self, t: float) -> AudioChunk | None:
        missing = int(round((t - self.position) * TARGET_RATE))
        return self._emit(np.zeros(missing, dtype=np.float32)) if missing > 0 else None

    def push(self, frames: np.ndarray, arrival_wall: float) -> list[AudioChunk]:
        """``frames`` (n, channels) captured just before ``arrival_wall`` (same clock as session_start)."""
        out: list[AudioChunk] = []
        duration = len(frames) / self.in_rate
        began_at = arrival_wall - self.session_start - duration
        if began_at - self.position > self.gap_tolerance:
            gap = self._silence_until(began_at)
            if gap:
                out.append(gap)
        chunk = self._emit(self.resampler.process(to_mono(frames)))
        if chunk:
            out.append(chunk)
        return out

    def fill_silence(self, now_wall: float, margin: float = 0.3) -> AudioChunk | None:
        """Called while the source sends nothing: advance the timeline with silence."""
        return self._silence_until(now_wall - self.session_start - margin)

    def flush(self) -> AudioChunk | None:
        return self._emit(self.resampler.process(np.zeros(0, dtype=np.float32), last=True))
