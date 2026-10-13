from ..config import Settings
from .base import INAUDIBLE_MARKER, Segment, TranscriptionProvider, TranscriptResult


def build_transcription_provider(settings: Settings) -> TranscriptionProvider:
    if settings.transcription_provider == "simulated":
        from .simulated import SimulatedTranscriptionProvider

        return SimulatedTranscriptionProvider()
    if settings.transcription_provider == "faster_whisper":
        from .faster_whisper_provider import FasterWhisperProvider

        return FasterWhisperProvider(settings.whisper_model, settings.whisper_device)
    raise ValueError(f"unknown transcription provider {settings.transcription_provider!r}")


__all__ = ["INAUDIBLE_MARKER", "Segment", "TranscriptResult", "TranscriptionProvider", "build_transcription_provider"]
