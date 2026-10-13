"""SIMULATION — returns pre-written model answers for synthetic transcripts (tests and demo)."""

from __future__ import annotations

from ..demo_data import load_ai_response_fixture
from ..errors import GenerationFailed
from ..transcription.base import TranscriptResult
from .base import GenerationResult, ReportGenerator, parse_structured, render_text
from .prompt import GenerationContext


class SimulatedReportGenerator(ReportGenerator):
    name = "simulated"

    def __init__(self, mapping: dict[str, list[str] | str] | None = None, default: str = "demenagement"):
        # recording_sid -> fixture name, or list of fixture names consumed one per attempt
        self.mapping: dict[str, list[str] | str] = dict(mapping or {})
        self.default = default
        self.fail_next = 0
        self.calls = 0

    def _fixture_for(self, recording_sid: str) -> str:
        entry = self.mapping.get(recording_sid, self.default)
        if isinstance(entry, list):
            return entry.pop(0) if len(entry) > 1 else entry[0]
        return entry

    def generate(self, transcript: TranscriptResult, ctx: GenerationContext) -> GenerationResult:
        self.calls += 1
        if self.fail_next > 0:
            self.fail_next -= 1
            raise GenerationFailed("simulated model outage")
        raw = load_ai_response_fixture(self._fixture_for(ctx.metadata.get("_recording_sid", "")))
        structured = parse_structured(raw)
        return GenerationResult(
            structured=structured,
            text=render_text(structured, ctx.business.report.template),
            generator=self.name,
            model="simulated",
        )
