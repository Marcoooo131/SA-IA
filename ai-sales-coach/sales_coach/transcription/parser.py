"""Lecture des transcriptions texte (TXT, DOCX) et normalisation en `Transcript`.

Formats reconnus (une réplique par ligne, les lignes sans locuteur prolongent la réplique précédente) :

    COMMERCIAL : Bonjour, ...
    [00:01:12] Client : Je déménage ...
    00:45 - Conseiller: ...
    (01:02) Cliente — ...
    SPEAKER_00: ...            -> locuteur inconnu, à attribuer
"""
from __future__ import annotations

import io
import re
from pathlib import Path

from sales_coach.core.models import AGENT, CLIENT, UNKNOWN, Transcript, Utterance

AGENT_LABELS = {
    "commercial", "commerciale", "agent", "conseiller", "conseillère", "conseillere", "vendeur",
    "vendeuse", "téléconseiller", "teleconseiller", "operateur", "opérateur", "opératrice",
    "a", "c1", "sa", "sector alarm", "rep", "sales",
}
CLIENT_LABELS = {"client", "cliente", "abonné", "abonne", "abonnée", "prospect", "interlocuteur", "cl", "b", "customer"}

_TS = r"(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?"
LINE_RE = re.compile(
    rf"^\s*(?:[\[(]?(?P<ts>{_TS})[\])]?\s*[-–—]?\s*)?"
    r"(?P<label>[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9 _'\-]{0,24}?)\s*(?:\((?P<ts2>" + _TS + r")\))?\s*(?P<sep>[:：—–-])\s+(?P<text>.+)$"
)


def parse_timestamp(raw: str | None) -> float | None:
    if not raw:
        return None
    raw = raw.replace(",", ".")
    parts = raw.split(":")
    try:
        nums = [float(p) for p in parts]
    except ValueError:
        return None
    total = 0.0
    for n in nums:
        total = total * 60 + n
    return total


_GENERIC_LABEL = re.compile(r"(?i)(speaker|locuteur|intervenant|spk|personne|voix)[ _-]?\w{1,3}")


_NOT_NAMES = {
    "oui", "non", "alors", "bon", "bref", "voilà", "voila", "donc", "attendez", "ok", "bonjour", "merci",
    "enfin", "remarque", "note", "attention", "exemple", "question", "objet", "résumé", "important",
}


def _is_speaker_label(label: str, sep: str, mapping: dict[str, str] | None) -> bool:
    label = label.strip()
    if normalize_speaker(label, mapping) != UNKNOWN or _GENERIC_LABEL.fullmatch(label):
        return True
    # Prénom isolé suivi de « : » (ex. « Marie : ») — accepté mais à attribuer.
    return (
        sep in ":："
        and len(label.split()) == 1
        and label[:1].isupper()
        and len(label) <= 15
        and label.lower() not in _NOT_NAMES
    )


def normalize_speaker(label: str, mapping: dict[str, str] | None = None) -> str:
    key = label.strip().lower()
    if mapping and label.strip() in mapping:
        return mapping[label.strip()]
    if mapping and key in {k.lower(): v for k, v in mapping.items()}:
        return {k.lower(): v for k, v in mapping.items()}[key]
    if key in AGENT_LABELS or key.startswith(("commercial", "conseill", "agent", "vendeu")):
        return AGENT
    if key in CLIENT_LABELS or key.startswith(("client", "abonn")):
        return CLIENT
    return UNKNOWN


def parse_text(text: str, speaker_mapping: dict[str, str] | None = None) -> Transcript:
    utterances: list[Utterance] = []
    raw_labels: list[str] = []
    warnings: list[str] = []
    for raw_line in text.replace("\r\n", "\n").split("\n"):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        m = LINE_RE.match(line)
        if m and _is_speaker_label(m.group("label"), m.group("sep"), speaker_mapping):
            label = m.group("label").strip()
            speaker = normalize_speaker(label, speaker_mapping)
            ts = parse_timestamp(m.group("ts") or m.group("ts2"))
            utterances.append(Utterance(len(utterances), speaker, m.group("text").strip(), ts))
            raw_labels.append(label)
        elif utterances:
            utterances[-1].text = f"{utterances[-1].text} {line}"
        else:
            utterances.append(Utterance(0, UNKNOWN, line))
            raw_labels.append("?")
    # Fixe l'heure de fin de chaque réplique quand l'horodatage suivant est connu.
    for cur, nxt in zip(utterances, utterances[1:]):
        if cur.start is not None and nxt.start is not None and nxt.start >= cur.start:
            cur.end = nxt.start
    unknown = sorted({lab for lab, u in zip(raw_labels, utterances) if u.speaker == UNKNOWN})
    attribution = "explicite"
    if unknown:
        warnings.append(
            "Locuteurs non reconnus : " + ", ".join(unknown)
            + ". Attribuez-les (COMMERCIAL / CLIENT) avant l'analyse."
        )
        attribution = "à vérifier"
    if not utterances:
        warnings.append("Transcription vide.")
    t = Transcript(utterances, source="texte", speaker_attribution=attribution, warnings=warnings)
    t.audio_metrics["raw_labels"] = raw_labels
    return t


def unknown_labels(transcript: Transcript) -> list[str]:
    labels = transcript.audio_metrics.get("raw_labels") or []
    return sorted({lab for lab, u in zip(labels, transcript.utterances) if u.speaker == UNKNOWN})


def apply_speaker_mapping(transcript: Transcript, mapping: dict[str, str]) -> Transcript:
    labels = transcript.audio_metrics.get("raw_labels") or []
    for lab, u in zip(labels, transcript.utterances):
        if lab in mapping:
            u.speaker = mapping[lab]
    if not any(u.speaker == UNKNOWN for u in transcript.utterances):
        transcript.warnings = [w for w in transcript.warnings if not w.startswith("Locuteurs non reconnus")]
        if transcript.speaker_attribution == "à vérifier":
            transcript.speaker_attribution = "attribuée manuellement"
    return transcript


def read_docx_text(data: bytes) -> str:
    from docx import Document  # python-docx

    doc = Document(io.BytesIO(data))
    lines = [p.text for p in doc.paragraphs]
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            if len(cells) >= 2 and cells[0]:
                lines.append(f"{cells[0]} : {' '.join(cells[1:])}")
    return "\n".join(lines)


def load_transcript_file(filename: str, data: bytes, speaker_mapping: dict[str, str] | None = None) -> Transcript:
    ext = Path(filename).suffix.lower()
    if ext == ".docx":
        t = parse_text(read_docx_text(data), speaker_mapping)
        t.source = "docx"
        return t
    if ext in {".txt", ".md", ".srt", ".vtt", ""}:
        text = _decode(data)
        if ext in {".srt", ".vtt"}:
            text = _strip_subtitles(text)
        return parse_text(text, speaker_mapping)
    raise ValueError(f"Format de transcription non pris en charge : {ext}")


def _decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _strip_subtitles(text: str) -> str:
    out, ts = [], None
    for line in text.splitlines():
        line = line.strip()
        m = re.match(r"^(\d{2}:\d{2}:\d{2})[.,]\d+\s*-->", line)
        if m:
            ts = m.group(1)
            continue
        if not line or line.isdigit() or line.upper() == "WEBVTT":
            continue
        out.append(f"[{ts}] {line}" if ts else line)
        ts = None
    return "\n".join(out)
