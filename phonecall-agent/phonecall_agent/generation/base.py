from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass

from jinja2.sandbox import SandboxedEnvironment
from pydantic import ValidationError

from ..errors import InvalidAIResponse
from ..transcription.base import TranscriptResult
from .prompt import GenerationContext
from .schema import StructuredReport


@dataclass
class GenerationResult:
    structured: StructuredReport
    text: str
    generator: str
    model: str | None
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


class ReportGenerator(ABC):
    name = "abstract"

    @abstractmethod
    def generate(self, transcript: TranscriptResult, ctx: GenerationContext) -> GenerationResult:
        """Raise GenerationFailed (transient) or InvalidAIResponse (schema mismatch)."""


def parse_structured(raw: str) -> StructuredReport:
    """Strictly parse the model output. Anything else than the expected JSON object is rejected."""
    raw = (raw or "").strip()
    if not raw:
        raise InvalidAIResponse("empty model response", code="ai_empty")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise InvalidAIResponse("model response is not valid JSON", code="ai_not_json") from exc
    try:
        return StructuredReport.model_validate(data)
    except ValidationError as exc:
        raise InvalidAIResponse(f"model response does not match schema ({exc.error_count()} errors)", code="ai_schema") from exc


_jinja = SandboxedEnvironment(autoescape=False, trim_blocks=True, lstrip_blocks=True)


def render_text(structured: StructuredReport, template: str) -> str:
    """Use the company template if one is configured, otherwise the model's own text."""
    if not template.strip():
        return structured.phone_call_text.strip()
    return _jinja.from_string(template).render(r=structured).strip()
