"""Prompt construction.

The system prompt lives in a versioned template file (``prompts/phone_call_v2.md`` by default,
overridable with ``report.prompt_file`` in the business config). Any change must bump the
``version:`` header and be re-evaluated on the anonymised evaluation set before deployment."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from jinja2.sandbox import SandboxedEnvironment

from ..config import BusinessConfig
from ..transcription.base import TranscriptResult
from .schema import UNDETERMINED

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"
DEFAULT_PROMPT_FILE = PROMPTS_DIR / "phone_call_v2.md"
_VERSION_RE = re.compile(r"version:\s*([\w.-]+)")

SPEAKER_LABELS = {
    "advisor": "conseiller",
    "customer": "client",
    "remote": "interlocuteur",  # sound received by the advisor's PC: usually the customer
    None: "locuteur inconnu",
}


@dataclass
class GenerationContext:
    business: BusinessConfig
    # Only metadata explicitly authorised for the AI (no phone number, no customer identity).
    metadata: dict[str, Any] = field(default_factory=dict)


def _prompt_path(business: BusinessConfig) -> Path:
    return Path(business.report.prompt_file) if business.report.prompt_file else DEFAULT_PROMPT_FILE


@lru_cache(maxsize=8)
def _load_template(path: str) -> tuple[str, str]:
    source = Path(path).read_text(encoding="utf-8")
    match = _VERSION_RE.search(source.split("-#}", 1)[0])
    if not match:
        raise ValueError(f"prompt file {path} has no 'version:' header")
    return match.group(1), source


def prompt_version(business: BusinessConfig) -> str:
    return _load_template(str(_prompt_path(business)))[0]


def build_system_prompt(business: BusinessConfig) -> str:
    _, source = _load_template(str(_prompt_path(business)))
    template = _jinja.from_string(source)
    return template.render(
        categories=business.categories,
        undetermined=UNDETERMINED,
        max_chars=business.report.max_chars,
        style_instructions=business.report.style_instructions.strip(),
        examples=business.report.examples,
    ).strip()


_jinja = SandboxedEnvironment(autoescape=False, keep_trailing_newline=False)


def format_transcript(transcript: TranscriptResult) -> str:
    lines = []
    for s in transcript.segments:
        who = SPEAKER_LABELS.get(s.speaker, s.speaker or "locuteur inconnu")
        ts = f"{int(s.start // 60):02d}:{int(s.start % 60):02d}" if s.start is not None else "--:--"
        flag = " [incertain]" if s.uncertain else ""
        lines.append(f"[{s.id}] [{ts}] [{who}]{flag} {s.text}")
    return "\n".join(lines)


def build_user_message(transcript: TranscriptResult, ctx: GenerationContext) -> str:
    # Keys starting with "_" are technical (never sent to the model).
    meta = "\n".join(f"- {k} : {v}" for k, v in sorted(ctx.metadata.items()) if not k.startswith("_")) or "- (aucune)"
    speakers = "identifiés" if transcript.speaker_labels else "NON identifiés de manière fiable"
    return (
        f"Métadonnées autorisées de l'appel :\n{meta}\n\n"
        f"Locuteurs : {speakers}.\n\n"
        f"<transcription>\n{format_transcript(transcript)}\n</transcription>\n\n"
        "Produis le compte rendu structuré."
    )
