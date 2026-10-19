"""Phone Call note from an already transcribed conversation: shared by the notes API (gateway)
and by the desktop app when it calls the AI provider directly.

Stateless: nothing is stored, nothing from the content is logged.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from .config import BusinessConfig
from .errors import InvalidAIResponse
from .generation import GenerationContext, ReportGenerator, prompt_version
from .quality import ReportValidator
from .transcription.base import Segment, TranscriptResult, normalise

NO_CONTENT_TEXT = "Appel sans échange exploitable (aucune conversation reconnue)."


@dataclass
class NoteSegment:
    text: str
    start: float | None = None
    end: float | None = None
    speaker: str | None = None  # advisor | remote | customer
    uncertain: bool = False


def generate_note(generator: ReportGenerator, business: BusinessConfig, segments: Iterable[NoteSegment],
                  *, speaker_labels: bool, duration_s: int | None, ai_max_attempts: int = 2,
                  source: str = "poste du conseiller") -> dict:
    """Returns the note payload of ``POST /api/v1/notes``.

    Raises ``InvalidAIResponse`` (schema mismatch after retries), ``PermanentError`` (auth, refusal,
    rejected request) or another ``PipelineError`` (transient: network, rate limit, server)."""
    transcript = normalise(TranscriptResult(
        provider="client",
        language="fr",
        segments=[Segment(id=f"S{i}", text=s.text, start=s.start, end=s.end, speaker=s.speaker,
                          uncertain=s.uncertain) for i, s in enumerate(segments, start=1)],
        speaker_labels=speaker_labels,
    ))
    version = prompt_version(business)

    if transcript.word_count < business.quality.min_transcript_words:
        return {
            "note_text": NO_CONTENT_TEXT, "no_usable_content": True, "category": None,
            "quality": {"score": None, "needs_review": True, "flags": []}, "points_to_verify": [],
            "structured": None, "prompt_version": version, "model": None, "generator": None, "cost_usd": 0.0,
        }

    ctx = GenerationContext(
        business=business,
        metadata={"durée de l'appel (s)": duration_s or "inconnue", "source": source},
    )
    gen = None
    for _ in range(max(1, ai_max_attempts)):
        try:
            gen = generator.generate(transcript, ctx)
            break
        except InvalidAIResponse:
            continue
    if gen is None:
        raise InvalidAIResponse("invalid AI response after retries")

    quality = ReportValidator(business).validate(gen.structured, gen.text, transcript)
    return {
        "note_text": gen.text,
        "no_usable_content": gen.structured.no_usable_content,
        "category": gen.structured.category,
        "quality": {"score": quality.score, "needs_review": True, "flags": quality.flags_as_dicts()},
        "points_to_verify": gen.structured.points_to_verify,
        "structured": gen.structured.model_dump(),
        "prompt_version": version,
        "model": gen.model,
        "generator": gen.generator,
        "cost_usd": gen.cost_usd,
    }
