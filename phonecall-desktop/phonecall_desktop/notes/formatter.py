"""« Mettre en forme la transcription »: Phone Call written by a script, without AI.

On top of the note without AI (``template/rules.py``), which classifies the sentences of the call:
- situation rules (``template/phone_call_facts.yaml``, editable) recognise what happened and write
  clean sentences (« Le client souhaite transmettre le contact du repreneur… ») instead of quotes;
- the contact of a third party (repreneur), the address concerned and the phone number dictated
  are extracted;
- the sentences still copied from the call are put in the third person, without « quotes »;
- uncertain values are written « value (à confirmer) ».
Nothing is invented: every sentence comes from a rule that matched the conversation, and the note
goes through the same automatic check as the other modes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from pathlib import Path

from ..config import Settings, install_dir
from ..transcript.assembler import Segment
from .client import NoteResult
from .local_summary import (MIN_WORDS, NO_CONTENT_TEXT, Sentence, metadata_text, norm, split_sentences,
                            transcript_text)
from .template import FieldValue, FilledNote, Template, check, points_to_verify, render

DEFAULT_FACTS = Path(__file__).with_name("template") / "phone_call_facts.yaml"
VERSION = "script-1"

PHONE = re.compile(r"(?<![\d+])(?:\+33[ .-]?|0)[1-9](?:[ .-]?\d{2}){4}(?!\d)")
CIVILITY = re.compile(r"\b(?:Monsieur|Madame|M\.|Mme)\s+([A-ZÀ-Ý][\w'-]+)")
FIRST_NAME = re.compile(r"\b([A-ZÀ-Ý][\w'-]+),? (?:c'est )?son prénom|\bson prénom,? (?:c'est )?([A-ZÀ-Ý][\w'-]+)", re.IGNORECASE)
ADDRESS = re.compile(
    r"\b(\d{1,4}(?:\s?(?:bis|ter))?)\s*,?\s*(?:\1\s*,?\s*)?"
    r"((?:rue|avenue|boulevard|allée|chemin|place|impasse|route|quai|[A-ZÀ-Ý][\w'-]+)"
    r"(?:\s+(?:de la|de l'|des|du|de|la|le|les|[A-ZÀ-Ý][\w'-]+))*)")
NOT_A_NAME = {"Sector", "Alarm", "Bonjour", "Merci", "Oui", "Non", "Et", "Alors", "Donc", "Ok", "OK"}

# first person → third person (sentences of the interlocutor / of the advisor copied into the note)
THIRD_PERSON = [
    (r"\bj'aimerais\b", "{who} souhaite"), (r"\bje voudrais\b", "{who} souhaite"), (r"\bje souhaite\b", "{who} souhaite"),
    (r"\bje veux\b", "{who} veut"), (r"\bje suis\b", "{who} est"), (r"\bj'ai\b", "{who} a"), (r"\bje vais\b", "{who} va"),
    (r"\bje peux\b", "{who} peut"), (r"\bje dois\b", "{who} doit"), (r"\bje ne\b", "{who} ne"), (r"\bje n'", "{who} n'"),
    (r"\bje\b", "{who}"), (r"\bj'", "{who} "), (r"\bmon\b", "son"), (r"\bma\b", "sa"), (r"\bmes\b", "ses"),
    (r"\bmoi\b", "lui"), (r"\bme\b", "se"), (r"\bm'", "s'"),
]
LEADING_FILLERS = re.compile(r"^(?:(?:oui|non|donc|alors|ok|d'accord|bon|bah|ben|voila|eh bien|et)\b[\s,]*)+", re.IGNORECASE)


@dataclass
class Fact:
    id: str
    patterns: list[re.Pattern]
    speaker: str = "any"
    requires: list[str] = field(default_factory=list)
    unless: list[str] = field(default_factory=list)
    set: dict[str, str] = field(default_factory=dict)
    info: str = ""
    variant: str | None = None
    context: str | None = None


def facts_path(settings: Settings | None = None) -> Path:
    if (d := install_dir()) is not None and (d / "phone_call_facts.yaml").is_file():
        return d / "phone_call_facts.yaml"
    return DEFAULT_FACTS


def load_facts(path: Path | None = None) -> list[Fact]:
    import yaml

    data = yaml.safe_load(Path(path or DEFAULT_FACTS).read_text(encoding="utf-8")) or {}
    out = []
    for f in data.get("facts") or []:
        patterns = [re.compile(norm(p)) for p in f.get("any") or []]
        out.append(Fact(str(f["id"]), patterns, str(f.get("speaker") or "any"), list(f.get("requires") or []),
                        list(f.get("unless") or []), dict(f.get("set") or {}), str(f.get("info") or ""),
                        f.get("variant"), f.get("context")))
    return out


def match_facts(facts: list[Fact], sentences: list[Sentence]) -> dict[str, tuple[Fact, Sentence, re.Match]]:
    found: dict[str, tuple[Fact, Sentence, re.Match]] = {}
    for fact in facts:
        for s in sentences:
            if fact.speaker != "any" and s.speaker != fact.speaker:
                continue
            m = next((m for p in fact.patterns if (m := p.search(s.n))), None)
            if m:
                found[fact.id] = (fact, s, m)
                break
    # dependencies, in the order of the file (a rule may depend on one written before it)
    kept: dict[str, tuple[Fact, Sentence, re.Match]] = {}
    for fid, item in found.items():
        fact = item[0]
        if all(r in kept for r in fact.requires) and not any(u in found for u in fact.unless):
            kept[fid] = item
    return kept


def third_person(text: str, who: str = "le client") -> str:
    text = LEADING_FILLERS.sub("", text.replace("«", "").replace("»", "").strip())
    for pattern, repl in THIRD_PERSON:
        text = re.sub(pattern, repl.format(who=who), text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip(" ,")
    return text[:1].upper() + text[1:] if text else text


def _clean_item(item: str) -> str:
    """« Je vais prendre le contact » quoted by the rules → Le conseiller va prendre le contact."""
    who = "le conseiller" if "(conseiller)" in item or item.startswith("Explication donnée") else "le client"
    if "«" not in item:
        return item
    head, _, rest = item.partition("«")
    quoted = third_person(rest.rsplit("»", 1)[0], who)
    head = head.strip()
    return f"{head} {quoted}".strip() if head else quoted


def _contact(sentences: list[Sentence]) -> tuple[str, str, str]:
    """Name and phone number dictated by the interlocutor for a third party (last complete ones)."""
    remote = [s for s in sentences if s.speaker == "remote"]
    last = first = phone = ""
    for s in remote:
        last = next((m.group(1) for m in CIVILITY.finditer(s.text) if m.group(1) not in NOT_A_NAME), last)
        if (m := FIRST_NAME.search(s.text)) and (name := m.group(1) or m.group(2)) not in NOT_A_NAME:
            first = name[:1].upper() + name[1:]
        for m in PHONE.finditer(s.text):
            digits = re.sub(r"\D", "", m.group(0))
            digits = "0" + digits[2:] if digits.startswith("33") else digits
            phone = " ".join(digits[i:i + 2] for i in range(0, 10, 2))
    return first, last, phone


def _address(sentences: list[Sentence]) -> str:
    for s in sentences:
        if s.speaker == "remote" and (m := ADDRESS.search(s.text)):
            words = [w for w in m.group(2).split() if w not in NOT_A_NAME]
            if words:
                return f"{m.group(1)} {' '.join(words)}"
    return ""


def _present(*items: str) -> FieldValue:
    return FieldValue("present", [i for i in items if i], source="script")


def _prettify(note: FilledNote) -> None:
    """Copilot-like values: « valeur (à confirmer) » instead of « À confirmer — raison : valeur »."""
    for fid, v in note.values.items():
        if v.status == "uncertain" and v.items and v.source != "poste" and fid not in ("type_appel",):
            v.items = [re.sub(r"\s*\(« .*? »\)$", "", i) + " (à confirmer)" for i in v.items]
            v.status, v.reason = "present", ""


def format_phone_call(segments: list[Segment], ctx, template: Template, categories, facts: list[Fact]) -> NoteResult:
    from .template.rules import fill

    sentences = split_sentences(segments)
    if sum(s.words for s in sentences) < MIN_WORDS:
        return NoteResult(text=NO_CONTENT_TEXT, no_usable_content=True, model="script",
                          prompt_version=f"{VERSION}/{template.version}",
                          flags=[{"code": "conversation_insuffisante", "severity": "warning",
                                  "message": "Trop peu de paroles reconnues pour remplir le compte rendu."}])
    found = match_facts(facts, sentences)
    if not ctx.variant:
        variant = next((f.variant for f, _s, _m in found.values() if f.variant), None)
        ctx = replace(ctx, variant=variant) if variant else ctx
    note = fill(template, sentences, categories, ctx)

    # 1. sentences copied by the rules: third person, no quotes
    for v in note.values.values():
        if v.source != "poste":
            v.items = [_clean_item(i) for i in v.items]
    # 2. situations recognised: clean values
    infos = []
    for fact, _s, m in found.values():
        for fid, value in fact.set.items():
            note.values[fid] = _present(value)
        if fact.info:
            infos.append(re.sub(r"\{(\d)\}", lambda g, m=m: m.group(int(g.group(1))) or "", fact.info))
    # 3. contact of a third party (repreneur): it is not the interlocutor's name / number
    if any(f.context == "contact_tiers" for f, _s, _m in found.values()):
        first, last, phone = _contact(sentences)
        if last or phone:
            name = " ".join(x for x in (first, last) if x) + (" (prénom non entendu)" if last and not first else "")
            note.values["tiers"] = _present(" — ".join(x for x in (name, phone) if x))
            for fid, key in (("nom", last), ("telephone", phone)):
                v = note.values.get(fid)
                if key and v and key in " ".join(v.items):
                    note.values[fid] = FieldValue.absent()
    if address := _address(sentences):
        infos.append(f"Adresse concernée : {address} (orthographe à vérifier).")
    if infos:
        note.values["complements_echanges"] = _present(*infos)
    flags = [{"code": "mise_en_forme_script", "severity": "warning",
              "message": "Phone Call mise en forme par script (sans IA) : relisez et complétez avant de la coller "
                         "dans le CRM."}]
    flags += check(note, transcript_text(segments), metadata_text(ctx))
    _prettify(note)
    return NoteResult(text=render(note), category=note.variant, flags=flags, points_to_verify=points_to_verify(note),
                      prompt_version=f"{VERSION}/{template.version}", model="script", cost_usd=0.0)


def format_transcript_text(text: str, template: Template, facts: list[Fact], categories=(), variant: str | None = None,
                           enhancer=None, agent_name: str = "", with_duration: bool = True) -> dict | None:
    """Pasted or copied transcript (« [mm:ss] Conseiller : … ») → Phone Call. None if there is no text.

    Shared by the button of the desktop app and by the web « Améliorateur Phone Call »."""
    from ..transcript.parse import parse_transcript_text
    from .template import CallContext

    segments = parse_transcript_text(text[:200_000], enhancer)
    if not segments:
        return None
    duration = int(max(s.t_end for s in segments)) if with_duration else 0
    ctx = CallContext(variant=variant or None, duration_s=duration, agent_name=agent_name)
    note = format_phone_call(segments, ctx, template, list(categories), facts)
    return {"text": note.text, "flags": note.flags, "points_to_verify": note.points_to_verify, "engine": "script",
            "cost_usd": note.cost_usd, "segments": len(segments)}
