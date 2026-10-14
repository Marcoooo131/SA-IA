"""SMS templates: variables, validation, rendering, character and segment counting."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .models import Appointment, Service
from .timeutil import fmt_date_fr, fmt_time_fr

VARIABLES: dict[str, str] = {
    "prenom": "Prénom du client",
    "nom": "Nom du client",
    "numero_client": "Numéro client interne (facultatif, uniquement si le texte le demande)",
    "date_rendez_vous": "Date du rendez-vous (JJ/MM/AAAA)",
    "heure_rendez_vous": "Heure du rendez-vous (ex. 14h30)",
    "service": "Service (Movers / Takeovers)",
}

_VAR = re.compile(r"\{\{\s*([^{}\s]+)\s*\}\}")

# GSM 03.38 basic character set and extension table (extension chars count double).
_GSM_BASIC = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
_GSM_EXT = set("^{}\\[~]|€\f")


@dataclass
class SegmentInfo:
    encoding: str  # "GSM-7" | "UCS-2"
    characters: int  # characters as typed
    units: int  # encoded units (extension characters count 2 in GSM-7)
    segments: int
    non_gsm: list[str] = field(default_factory=list)


def segment_info(text: str) -> SegmentInfo:
    non_gsm = sorted({c for c in text if c not in _GSM_BASIC and c not in _GSM_EXT})
    if not non_gsm:
        units = sum(2 if c in _GSM_EXT else 1 for c in text)
        single, multi, enc = 160, 153, "GSM-7"
    else:
        # UTF-16 code units (emoji count 2)
        units = len(text.encode("utf-16-le")) // 2
        single, multi, enc = 70, 67, "UCS-2"
    if units == 0:
        segments = 0
    elif units <= single:
        segments = 1
    else:
        segments = -(-units // multi)
    return SegmentInfo(enc, len(text), units, segments, non_gsm)


def variables_used(body: str) -> list[str]:
    return list(dict.fromkeys(_VAR.findall(body)))


def validate(body: str, max_segments: int) -> list[str]:
    """Errors that make a template unusable (activation is refused)."""
    errors: list[str] = []
    if not body or not body.strip():
        return ["Le texte est vide."]
    unknown = [v for v in variables_used(body) if v not in VARIABLES]
    if unknown:
        errors.append("Variables inconnues : " + ", ".join("{{" + v + "}}" for v in unknown))
    leftover = _VAR.sub("", body)
    if "{{" in leftover or "}}" in leftover:
        errors.append("Accolades mal fermées : utilisez la forme {{variable}}.")
    # Worst-case rendering to estimate the size of a real message.
    info = segment_info(render_text(body, sample_context(long=True)))
    if info.segments > max_segments:
        errors.append(f"Message trop long : {info.segments} segments estimés (maximum {max_segments}).")
    return errors


def context_for(appt: Appointment) -> dict[str, str]:
    return {
        "prenom": (appt.first_name or "").strip(),
        "nom": (appt.last_name or "").strip(),
        "numero_client": (appt.customer_ref or "").strip(),
        "date_rendez_vous": fmt_date_fr(appt.appointment_date),
        "heure_rendez_vous": fmt_time_fr(appt.appointment_time),
        "service": Service.LABELS.get(appt.service or "", ""),
    }


def sample_context(long: bool = False, service: str = Service.MOVERS) -> dict[str, str]:
    return {
        "prenom": "Marie-Christine" if long else "Marie",
        "nom": "Dupont-Lefebvre" if long else "Dupont",
        "numero_client": "CLI-0000123456" if long else "CLI-00123",
        "date_rendez_vous": "24/12/2026",
        "heure_rendez_vous": "14h30",
        "service": Service.LABELS.get(service, "Movers"),
    }


def render_text(body: str, context: dict[str, str]) -> str:
    return _VAR.sub(lambda m: context.get(m.group(1), m.group(0)), body)


@dataclass
class Rendered:
    text: str
    missing: list[str]
    info: SegmentInfo


def render(body: str, context: dict[str, str]) -> Rendered:
    """Render; ``missing`` lists variables that are unknown or have an empty value."""
    missing = [v for v in variables_used(body) if not context.get(v)]
    text = render_text(body, context)
    return Rendered(text, missing, segment_info(text))
