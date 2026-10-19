"""Reads a transcript pasted or copied as text back into segments.

Accepted lines (the format of « Copier la transcription », or any similar export):
  [01:37] Interlocuteur : 07, 71, 69, 75, 68
  Conseiller : D'accord
  Client - je voudrais résilier
A line without a speaker continues the previous one (first line: interlocutor).
"""

from __future__ import annotations

import re

from ..audio.types import Channel
from .assembler import Segment
from .enhancer import TextEnhancer

ADVISOR = ("conseiller", "conseillère", "agent", "advisor", "moi")
LINE_RE = re.compile(
    r"^\s*(?:\[?(?P<ts>\d{1,2}:\d{2}(?::\d{2})?)\]?\s*)?"
    r"(?:(?P<who>conseill[eè]re?|agent|advisor|interlocut(?:eur|rice)|client(?:e)?|appelant(?:e)?|remote|moi)\s*[:\-–]\s*)?"
    r"(?P<text>.*)$",
    re.IGNORECASE,
)


def _seconds(ts: str | None) -> float | None:
    if not ts:
        return None
    parts = [int(p) for p in ts.split(":")]
    return float(sum(p * 60 ** i for i, p in enumerate(reversed(parts))))


def parse_transcript_text(text: str, enhancer: TextEnhancer | None = None) -> list[Segment]:
    segments: list[Segment] = []
    for raw in (text or "").splitlines():
        m = LINE_RE.match(raw)
        body = m.group("text").strip().removesuffix("…").strip()
        if not body:
            continue
        who = (m.group("who") or "").lower()
        start = _seconds(m.group("ts"))
        if not who and segments:  # continuation of the previous line
            segments[-1].text += " " + body
            continue
        channel = Channel.MIC if who.startswith(ADVISOR) else Channel.SYSTEM
        t = start if start is not None else (segments[-1].t_end if segments else 0.0)
        segments.append(Segment(f"paste-{len(segments)}", channel, t, t + 1, body, final=True))
    for s in segments:
        if enhancer:
            cleaned = enhancer.enhance(s.text)
            s.raw_text, s.text = (s.text if cleaned != s.text else None), cleaned
    return [s for s in segments if s.text.strip()]
