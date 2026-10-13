"""Streaming transcription: segmentation per channel + one recognition worker.

Scheduling rules (CPU is limited on an advisor's PC):
- finals have priority over partials and are NEVER dropped (no text loss);
- a partial is skipped if the utterance has meanwhile become final or a newer partial exists;
- ``finish()`` turns the utterances in progress into finals and waits until all are recognised.
"""

from __future__ import annotations

import heapq
import itertools
import logging
import threading
import time
from collections.abc import Callable

from ..audio.types import AudioChunk, Channel
from ..errors import AppError, ErrorCode
from .base import Recognizer, TranscriptEvent
from .segmenter import Segmenter, SegmenterConfig, Utterance

log = logging.getLogger(__name__)

HALLUCINATIONS = (
    "sous-titres réalisés par", "sous-titrage", "merci d'avoir regardé", "amara.org", "abonnez-vous",
    "sous-titres par", "merci de votre attention.",
)


def is_hallucination(text: str) -> bool:
    t = text.lower().strip()
    return any(h in t for h in HALLUCINATIONS)


class StreamingTranscriber:
    def __init__(self, recognizer: Recognizer, on_event: Callable[[TranscriptEvent], None],
                 channels: list[Channel], seg_cfg: SegmenterConfig | None = None, context_prompt: str = ""):
        self.recognizer = recognizer
        self.on_event = on_event
        self.context_prompt = context_prompt
        self._segmenters = {ch: Segmenter(ch, seg_cfg) for ch in channels}
        self._heap: list = []
        self._seq = itertools.count()
        self._cv = threading.Condition()
        self._finalized: set[str] = set()
        self._latest_partial: dict[str, int] = {}
        self._last_text: dict[Channel, str] = {}
        self._busy = False
        self._closed = False
        self.audio_position: dict[Channel, float] = {ch: 0.0 for ch in channels}
        self.last_final_end: dict[Channel, float] = {ch: 0.0 for ch in channels}
        self.stats = {"finals": 0, "partials": 0, "partials_skipped": 0, "dropped_hallucinations": 0,
                      "recognition_seconds": 0.0, "audio_seconds_final": 0.0, "final_latency_s": []}
        self._worker = threading.Thread(target=self._run, daemon=True, name="stt-worker")
        self._worker.start()

    # ------------------------------------------------------------------ input

    def feed(self, chunk: AudioChunk) -> None:
        seg = self._segmenters.get(chunk.channel)
        if seg is None:
            return
        self.audio_position[chunk.channel] = chunk.t_end
        for utt in seg.feed(chunk):
            self._submit(utt)

    def _submit(self, utt: Utterance) -> None:
        with self._cv:
            if self._closed:
                return
            if utt.final:
                priority = 0
            else:
                priority = 1
                self._latest_partial[utt.id] = len(utt.audio)
            heapq.heappush(self._heap, (priority, next(self._seq), utt, time.monotonic()))
            self._cv.notify()

    # ------------------------------------------------------------------ worker

    def _run(self) -> None:
        while True:
            with self._cv:
                while not self._heap and not self._closed:
                    self._cv.wait()
                if not self._heap and self._closed:
                    return
                _, _, utt, submitted = heapq.heappop(self._heap)
                if not utt.final and (utt.id in self._finalized or self._latest_partial.get(utt.id) != len(utt.audio)):
                    self.stats["partials_skipped"] += 1
                    continue
                if utt.final:
                    self._finalized.add(utt.id)
                self._busy = True
            try:
                self._recognize(utt, submitted)
            except Exception:  # noqa: BLE001 - one bad utterance must not stop the transcription
                log.exception("recognition failed for %s", utt.id)
                if utt.final:
                    self.on_event(TranscriptEvent("final", utt.channel, utt.id, utt.t_start, utt.t_end,
                                                  "[passage non transcrit]", uncertain=True))
            finally:
                with self._cv:
                    self._busy = False
                    self._cv.notify_all()

    def _recognize(self, utt: Utterance, submitted: float) -> None:
        context = (self.context_prompt + " " + self._last_text.get(utt.channel, "")).strip()
        t0 = time.monotonic()
        res = self.recognizer.transcribe(utt.audio, context=context[-400:], fast=not utt.final,
                                         channel=utt.channel, t_start=utt.t_start)
        elapsed = time.monotonic() - t0
        self.stats["recognition_seconds"] += elapsed
        text = res.text.strip()
        if text and is_hallucination(text):
            self.stats["dropped_hallucinations"] += 1
            text = ""
        if utt.final:
            self.stats["finals"] += 1
            self.stats["audio_seconds_final"] += len(utt.audio) / 16_000
            self.stats["final_latency_s"].append(round(time.monotonic() - submitted, 3))
            self.last_final_end[utt.channel] = utt.t_end
            if text:
                self._last_text[utt.channel] = text
            # an empty final still closes the utterance (removes its partial in the UI)
            self.on_event(TranscriptEvent("final", utt.channel, utt.id, utt.t_start, utt.t_end, text,
                                          res.uncertain, res.confidence))
        else:
            self.stats["partials"] += 1
            if text:
                self.on_event(TranscriptEvent("partial", utt.channel, utt.id, utt.t_start, utt.t_end, text, True))

    # ------------------------------------------------------------------ end of capture

    def lag_seconds(self) -> float:
        """How far the definitive transcript is behind the captured audio (shown to the user)."""
        with self._cv:
            pending_finals = [u for p, _, u, _ in self._heap if p == 0]
        if not pending_finals:
            return 0.0
        oldest = min(u.t_start for u in pending_finals)
        return max(0.0, max(self.audio_position.values(), default=0.0) - oldest)

    def finish(self, timeout: float = 120.0) -> None:
        """Flush every channel, wait for all finals. Raises TRANSCRIPTION_TIMEOUT if too slow."""
        for seg in self._segmenters.values():
            for utt in seg.flush():
                self._submit(utt)
        deadline = time.monotonic() + timeout
        with self._cv:
            # partials are useless now
            self._heap = [item for item in self._heap if item[0] == 0]
            heapq.heapify(self._heap)
            while self._heap or self._busy:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise AppError(ErrorCode.TRANSCRIPTION_TIMEOUT)
                self._cv.wait(min(remaining, 0.2))

    def close(self) -> None:
        with self._cv:
            self._closed = True
            self._heap.clear()
            self._cv.notify_all()
        self._worker.join(timeout=10)
