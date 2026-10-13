"""Provider-agnostic transcription interface.

A provider must:
- transcribe French faithfully, never filling gaps with invented sentences;
- return timestamped segments when available, with a speaker label when reliable;
- flag inaudible or low-confidence passages (``uncertain=True``) instead of guessing.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import Any

INAUDIBLE_MARKER = "[inaudible]"


@dataclass
class Segment:
    id: str  # stable reference used as evidence by the generated report, e.g. "S3"
    text: str
    start: float | None = None
    end: float | None = None
    speaker: str | None = None  # "advisor" | "customer" | "speaker_1"... | None if unknown
    confidence: float | None = None
    uncertain: bool = False


@dataclass
class TranscriptResult:
    provider: str
    language: str
    segments: list[Segment]
    speaker_labels: bool = False
    cost_usd: float = 0.0
    warnings: list[str] = field(default_factory=list)

    @property
    def word_count(self) -> int:
        return sum(len(s.text.split()) for s in self.segments if s.text != INAUDIBLE_MARKER)

    @property
    def uncertain_count(self) -> int:
        return sum(1 for s in self.segments if s.uncertain)

    def segment_ids(self) -> set[str]:
        return {s.id for s in self.segments}

    def full_text(self) -> str:
        return "\n".join(s.text for s in self.segments)

    def to_json(self) -> str:
        return json.dumps(
            {
                "provider": self.provider,
                "language": self.language,
                "speaker_labels": self.speaker_labels,
                "segments": [asdict(s) for s in self.segments],
                "warnings": self.warnings,
            },
            ensure_ascii=False,
        )

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TranscriptResult:
        segments = [Segment(**s) for s in data["segments"]]
        return cls(
            provider=data.get("provider", "unknown"),
            language=data.get("language", "fr"),
            segments=segments,
            speaker_labels=bool(data.get("speaker_labels")),
            cost_usd=float(data.get("cost_usd", 0.0)),
            warnings=list(data.get("warnings", [])),
        )

    @classmethod
    def from_json(cls, raw: str) -> TranscriptResult:
        return cls.from_dict(json.loads(raw))


class TranscriptionProvider(ABC):
    name: str = "abstract"

    @abstractmethod
    def transcribe(self, audio: bytes, extension: str, metadata: dict[str, Any]) -> TranscriptResult:
        """Return the transcript. Raise TranscriptionFailed (retryable) or InvalidAudio (permanent)."""


def normalise(result: TranscriptResult, low_confidence: float = 0.55) -> TranscriptResult:
    """Common post-processing: stable ids, uncertain flags, explicit inaudible markers."""
    for i, seg in enumerate(result.segments, start=1):
        seg.id = seg.id or f"S{i}"
        seg.text = (seg.text or "").strip()
        if not seg.text:
            seg.text = INAUDIBLE_MARKER
            seg.uncertain = True
        if seg.confidence is not None and seg.confidence < low_confidence:
            seg.uncertain = True
    return result
