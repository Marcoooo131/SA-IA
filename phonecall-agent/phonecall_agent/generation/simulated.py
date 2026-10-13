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
        sid = ctx.metadata.get("_recording_sid", "")
        name = self._fixture_for(sid) if sid in self.mapping or not transcript.segments else _closest_fixture(transcript, self.default)
        raw = load_ai_response_fixture(name)
        structured = parse_structured(raw)
        return GenerationResult(
            structured=structured,
            text=render_text(structured, ctx.business.report.template),
            generator=self.name,
            model="simulated",
        )


def _closest_fixture(transcript: TranscriptResult, default: str) -> str:
    """Picks the synthetic scenario whose transcript is closest to the received one (demo / tests of
    the notes API, where no recording SID exists)."""
    import difflib

    from ..demo_data import ai_response_fixture_names, load_transcript_fixture

    text = transcript.full_text().lower()
    best, best_ratio = default, 0.0
    for name in ai_response_fixture_names():
        try:
            ref = " ".join(s["text"] for s in load_transcript_fixture(name)["segments"]).lower()
        except FileNotFoundError:
            continue
        ratio = difflib.SequenceMatcher(None, text, ref).ratio()
        if ratio > best_ratio:
            best, best_ratio = name, ratio
    return best if best_ratio >= 0.5 else default
