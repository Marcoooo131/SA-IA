"""Audio stream processing: mono conversion, streaming resampling, levels.

Every channel is normalised to 16 kHz mono float32 in [-1, 1] — the format expected by the
speech recognisers.
"""

from __future__ import annotations

import math

import numpy as np

TARGET_RATE = 16_000
SILENCE_DBFS = -100.0


def int16_bytes_to_float(data: bytes, channels: int) -> np.ndarray:
    """Interleaved PCM16 bytes → float32 array of shape (frames, channels)."""
    samples = np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        usable = len(samples) - len(samples) % channels
        samples = samples[:usable].reshape(-1, channels)
    else:
        samples = samples.reshape(-1, 1)
    return samples


def to_mono(frames: np.ndarray) -> np.ndarray:
    """(frames, channels) → (frames,). Averages channels (a loopback stream is often stereo)."""
    if frames.ndim == 1:
        return frames.astype(np.float32, copy=False)
    return frames.mean(axis=1).astype(np.float32)


def rms_dbfs(samples: np.ndarray) -> float:
    if samples.size == 0:
        return SILENCE_DBFS
    rms = float(np.sqrt(np.mean(np.square(samples, dtype=np.float64))))
    return SILENCE_DBFS if rms <= 1e-10 else max(SILENCE_DBFS, 20 * math.log10(rms))


class Resampler:
    """Streaming resampler (libsoxr). Keeps filter state between chunks: no clicks, no drift."""

    def __init__(self, in_rate: int, out_rate: int = TARGET_RATE):
        self.in_rate, self.out_rate = int(in_rate), int(out_rate)
        self._passthrough = self.in_rate == self.out_rate
        if not self._passthrough:
            import soxr

            self._stream = soxr.ResampleStream(self.in_rate, self.out_rate, 1, dtype="float32", quality="HQ")

    def process(self, mono: np.ndarray, last: bool = False) -> np.ndarray:
        if self._passthrough:
            return mono.astype(np.float32, copy=False)
        return self._stream.resample_chunk(mono.astype(np.float32, copy=False), last=last)


class LevelMeter:
    """Peak-hold level for the UI vu-meter, plus 'has signal' detection."""

    def __init__(self, signal_threshold_dbfs: float = -50.0, decay_db_per_s: float = 30.0):
        self.threshold = signal_threshold_dbfs
        self.decay = decay_db_per_s
        self.level = SILENCE_DBFS
        self.last_signal_at: float | None = None

    def update(self, samples: np.ndarray, now: float, duration_s: float) -> float:
        current = rms_dbfs(samples)
        decayed = self.level - self.decay * duration_s
        self.level = max(current, decayed, SILENCE_DBFS)
        if current >= self.threshold:
            self.last_signal_at = now
        return self.level
