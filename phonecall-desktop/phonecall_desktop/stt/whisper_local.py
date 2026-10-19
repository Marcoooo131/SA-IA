"""Local recogniser with faster-whisper (CTranslate2). Audio never leaves the PC.

Model choice (French): ``small`` is the usual compromise on a recent laptop CPU (int8);
``medium`` is more accurate but ~2-3x slower; ``base`` for weak machines. Speed and accuracy
must be measured on the target PCs (see docs/PROCEDURE_TEST_AUDIO.md).
"""

from __future__ import annotations

import logging
import math
import threading

import numpy as np

from ..errors import AppError, ErrorCode
from .base import RecognitionResult, Recognizer

log = logging.getLogger(__name__)


class WhisperRecognizer(Recognizer):
    name = "faster-whisper"

    def __init__(self, model: str = "small", device: str = "cpu", compute_type: str = "int8",
                 cpu_threads: int = 0, download_root: str | None = None, local_files_only: bool = False,
                 beam_size: int = 5, hotwords: str = ""):
        self.model_name, self.device, self.compute_type = model, device, compute_type
        self.cpu_threads, self.download_root, self.local_files_only = cpu_threads, download_root, local_files_only
        self.beam_size = beam_size
        self.hotwords = hotwords or None
        self._model = None
        self._lock = threading.Lock()
        # One call at a time on the model: the live call and a call finishing in the queue share it
        self._run_lock = threading.Lock()

    def warmup(self) -> None:
        with self._lock:
            if self._model is not None:
                return
            try:
                from faster_whisper import WhisperModel
            except ImportError as exc:
                raise AppError(ErrorCode.RECOGNIZER_UNAVAILABLE, "faster-whisper n'est pas installé") from exc
            try:
                self._model = WhisperModel(
                    self.model_name, device=self.device, compute_type=self.compute_type,
                    cpu_threads=self.cpu_threads, download_root=self.download_root,
                    local_files_only=self.local_files_only,
                )
            except Exception as exc:  # noqa: BLE001 - missing model files, bad device...
                raise AppError(ErrorCode.RECOGNIZER_UNAVAILABLE, type(exc).__name__) from exc

    def transcribe(self, audio: np.ndarray, *, context: str = "", fast: bool = False,
                   channel=None, t_start: float = 0.0) -> RecognitionResult:
        self.warmup()
        with self._run_lock:
            return self._transcribe(audio, context=context, fast=fast)

    def _transcribe(self, audio: np.ndarray, *, context: str, fast: bool) -> RecognitionResult:
        segments, _info = self._model.transcribe(
            audio.astype(np.float32, copy=False),
            language="fr",
            task="transcribe",
            beam_size=1 if fast else self.beam_size,
            temperature=0.0 if fast else (0.0, 0.2, 0.4),
            condition_on_previous_text=False,
            initial_prompt=context or None,
            hotwords=self.hotwords,
            vad_filter=False,  # segmentation already done
            without_timestamps=True,
        )
        texts, logprobs, uncertain = [], [], False
        for seg in segments:
            if seg.no_speech_prob > 0.6 and seg.avg_logprob < -0.8:
                continue  # silence or noise decoded as words
            texts.append(seg.text.strip())
            logprobs.append(seg.avg_logprob)
            if seg.avg_logprob < -1.0 or seg.compression_ratio > 2.4:
                uncertain = True
        text = " ".join(t for t in texts if t)
        confidence = round(math.exp(sum(logprobs) / len(logprobs)), 3) if logprobs else None
        return RecognitionResult(text=text, confidence=confidence, uncertain=uncertain)
