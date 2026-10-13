"""Splits a channel's audio into utterances using the energy VAD.

An utterance ends after ``end_silence_s`` of silence, or is cut at ``max_utterance_s`` (long
monologues) so the text keeps appearing during the call. ``pre_roll_s`` of audio before the
detected start is kept so the first syllable is not lost.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..audio.types import AudioChunk, Channel
from ..audio.vad import FRAME_S, EnergyVad, VadConfig

RATE = 16_000
FRAME = int(FRAME_S * RATE)


@dataclass
class SegmenterConfig:
    end_silence_s: float = 0.7
    max_utterance_s: float = 15.0
    min_utterance_s: float = 0.35
    pre_roll_s: float = 0.3
    partial_every_s: float = 1.5


@dataclass
class Utterance:
    channel: Channel
    index: int
    t_start: float
    audio: np.ndarray
    final: bool

    @property
    def id(self) -> str:
        return f"{self.channel.value}-{self.index}"

    @property
    def t_end(self) -> float:
        return self.t_start + len(self.audio) / RATE


class Segmenter:
    def __init__(self, channel: Channel, cfg: SegmenterConfig | None = None, vad: VadConfig | None = None):
        self.channel = channel
        self.cfg = cfg or SegmenterConfig()
        self.vad = EnergyVad(vad)
        self._pending = np.zeros(0, dtype=np.float32)  # incomplete frame
        self._pending_t = 0.0
        self._pre: list[np.ndarray] = []
        self._speech: list[np.ndarray] = []
        self._t_speech_start = 0.0
        self._silence_run = 0.0
        self._since_partial = 0.0
        self._in_speech = False
        self._index = 0
        self._t = 0.0  # timeline position of the next frame

    def feed(self, chunk: AudioChunk) -> list[Utterance]:
        out: list[Utterance] = []
        if self._pending.size == 0:
            self._t = chunk.t_start
        data = np.concatenate([self._pending, chunk.samples]) if self._pending.size else chunk.samples
        n_frames = len(data) // FRAME
        for i in range(n_frames):
            frame = data[i * FRAME : (i + 1) * FRAME]
            out.extend(self._frame(frame))
            self._t += FRAME_S
        self._pending = data[n_frames * FRAME :].copy()
        return out

    def _frame(self, frame: np.ndarray) -> list[Utterance]:
        speech = self.vad.is_speech(frame)
        cfg = self.cfg
        if not self._in_speech:
            self._pre.append(frame)
            max_pre = int(cfg.pre_roll_s / FRAME_S)
            if len(self._pre) > max_pre:
                self._pre.pop(0)
            if speech and self.vad.speech_confirmed:
                self._in_speech = True
                self._speech = list(self._pre)
                self._t_speech_start = self._t + FRAME_S - len(self._pre) * FRAME_S
                self._pre = []
                self._silence_run = 0.0
                self._since_partial = 0.0
            return []
        self._speech.append(frame)
        self._since_partial += FRAME_S
        self._silence_run = 0.0 if speech else self._silence_run + FRAME_S
        duration = len(self._speech) * FRAME_S
        if self._silence_run >= cfg.end_silence_s or duration >= cfg.max_utterance_s:
            return self._close()
        if self._since_partial >= cfg.partial_every_s:
            self._since_partial = 0.0
            return [Utterance(self.channel, self._index, self._t_speech_start, np.concatenate(self._speech), final=False)]
        return []

    def _close(self) -> list[Utterance]:
        audio = np.concatenate(self._speech) if self._speech else np.zeros(0, np.float32)
        # trim the trailing silence (keep 0.2 s)
        keep = len(audio) - max(0, int((self._silence_run - 0.2) * RATE))
        audio = audio[:keep]
        utt = Utterance(self.channel, self._index, self._t_speech_start, audio, final=True)
        self._in_speech = False
        self._speech, self._pre = [], []
        self._silence_run = 0.0
        if len(audio) / RATE < self.cfg.min_utterance_s:
            return []  # click / cough: ignored, index not consumed
        self._index += 1
        return [utt]

    def flush(self) -> list[Utterance]:
        """End of capture: the utterance in progress becomes final (the last words are kept)."""
        if self._pending.size:
            if self._in_speech:
                self._speech.append(self._pending)
            self._pending = np.zeros(0, dtype=np.float32)
        if self._in_speech:
            self._silence_run = 0.0
            return self._close()
        return []
