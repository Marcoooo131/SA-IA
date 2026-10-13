"""Synthetic, fictitious data (no real customer, no real call). For tests and demo only."""

from __future__ import annotations

import json
from pathlib import Path

_DIR = Path(__file__).parent


def load_transcript_fixture(name: str) -> dict:
    return json.loads((_DIR / "transcripts" / f"{name}.json").read_text(encoding="utf-8"))


def load_ai_response_fixture(name: str) -> str:
    """Raw text the simulated model returns (may be deliberately invalid)."""
    return (_DIR / "ai_responses" / f"{name}.json").read_text(encoding="utf-8")


def transcript_fixture_names() -> list[str]:
    return sorted(p.stem for p in (_DIR / "transcripts").glob("*.json"))
