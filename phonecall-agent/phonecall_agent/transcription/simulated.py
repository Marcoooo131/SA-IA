"""SIMULATION — returns synthetic transcripts. Never used outside dev/test (enforced by config)."""

from __future__ import annotations

from typing import Any

from ..demo_data import load_transcript_fixture
from ..errors import TranscriptionFailed
from .base import TranscriptionProvider, TranscriptResult, normalise


class SimulatedTranscriptionProvider(TranscriptionProvider):
    name = "simulated"

    def __init__(self, default_fixture: str = "demenagement", mapping: dict[str, str] | None = None):
        self.default_fixture = default_fixture
        # recording_sid -> fixture name (lets tests / demo choose a scenario per call)
        self.mapping: dict[str, str] = dict(mapping or {})
        self.fail_next: int = 0  # test hook: number of upcoming calls that fail transiently

    def transcribe(self, audio: bytes, extension: str, metadata: dict[str, Any]) -> TranscriptResult:
        if self.fail_next > 0:
            self.fail_next -= 1
            raise TranscriptionFailed("simulated provider outage")
        name = self.mapping.get(metadata.get("recording_sid", ""), self.default_fixture)
        result = TranscriptResult.from_dict(load_transcript_fixture(name))
        result.provider = self.name
        return normalise(result)
