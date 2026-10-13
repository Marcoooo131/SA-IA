"""Optional self-hosted provider based on faster-whisper (audio never leaves the company infra).

Install with ``pip install faster-whisper`` (and ffmpeg). Not exercised by the automated tests:
quality on real Sector Alarm calls must be measured during the pilot (WER on an anonymised,
human-transcribed sample) before any choice of provider.

Limitations: no diarisation. With dual-channel Twilio recordings, speakers can be separated by
channel (one transcription per channel) — to implement once the channel/role mapping
(advisor vs customer, per call direction) is confirmed.
"""

from __future__ import annotations

import os
import tempfile
from typing import Any

from ..errors import InvalidAudio, TranscriptionFailed
from .base import Segment, TranscriptionProvider, TranscriptResult, normalise


class FasterWhisperProvider(TranscriptionProvider):
    name = "faster_whisper"

    def __init__(self, model_size: str = "medium", device: str = "cpu", compute_type: str = "int8"):
        try:
            from faster_whisper import WhisperModel  # type: ignore
        except ImportError as exc:  # pragma: no cover - optional dependency
            raise RuntimeError("faster-whisper is not installed") from exc
        self._model = WhisperModel(model_size, device=device, compute_type=compute_type)

    def transcribe(self, audio: bytes, extension: str, metadata: dict[str, Any]) -> TranscriptResult:  # pragma: no cover
        fd, path = tempfile.mkstemp(suffix=f".{extension}")
        try:
            with os.fdopen(fd, "wb") as fh:
                fh.write(audio)
            try:
                segments, _info = self._model.transcribe(path, language="fr", vad_filter=True)
                segments = list(segments)
            except (ValueError, RuntimeError) as exc:
                if "decode" in str(exc).lower() or "invalid data" in str(exc).lower():
                    raise InvalidAudio("audio cannot be decoded", code="corrupted_audio") from exc
                raise TranscriptionFailed(type(exc).__name__) from exc
        finally:
            os.unlink(path)

        out: list[Segment] = []
        for i, s in enumerate(segments, start=1):
            # avg_logprob is not a probability; mapped to a crude [0,1] indicator for flagging only.
            conf = max(0.0, min(1.0, 1.0 + float(s.avg_logprob)))
            uncertain = float(s.no_speech_prob) > 0.6 or float(s.avg_logprob) < -1.0
            out.append(Segment(id=f"S{i}", text=s.text, start=s.start, end=s.end, confidence=conf, uncertain=uncertain))
        return normalise(TranscriptResult(provider=self.name, language="fr", segments=out, speaker_labels=False))
