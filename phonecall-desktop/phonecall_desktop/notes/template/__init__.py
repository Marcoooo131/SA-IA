"""General Phone Call template: loading, filled note model, rendering and automatic check.

The template itself (sections, fields, conditional fields, extraction rules) is configuration:
``phone_call_template.yaml`` (copy next to the .exe, or ``PCD_NOTE_TEMPLATE``). Both note modes
fill the same model: ``rules.py`` (without AI) and ``ai.py`` (Claude).

Every visible field always receives a value, with an explicit status:
- present         information said in the call, or given by an authorised source (the PC);
- absent          exactly « Aucune information notifiée »;
- uncertain       « À confirmer — reason » (heard but not reliable, detected automatically...);
- contradictory   both versions are shown, without choosing one;
- not_applicable  « Non applicable — reason ».
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from ...config import Settings, install_dir

DEFAULT_TEMPLATE = Path(__file__).with_name("phone_call_template.yaml")
STATUSES = ("present", "absent", "uncertain", "contradictory", "not_applicable")
# Labels the advisor reads; the tags are those of `when:` in the template
DIRECTION_TAGS = ("entrant", "sortant")


@dataclass
class FieldSpec:
    id: str
    label: str
    help: str = ""
    multi: bool = False
    when: frozenset[str] | None = None
    rule: dict = field(default_factory=dict)
    bare: bool = False  # no label: free lines under the section title (label = section name, for messages)
    unless: frozenset[str] = frozenset()

    def visible(self, tags: set[str]) -> bool:
        return (self.when is None or bool(self.when & tags)) and not (self.unless & tags)


@dataclass
class Section:
    title: str
    fields: list[FieldSpec]


@dataclass
class Template:
    version: str
    title: str
    absent: str
    uncertain: str
    not_applicable: str
    call_types: dict[str, dict]
    directions: dict[str, str]
    sections: list[Section]
    path: str = ""
    section_case: str = "upper"  # upper | as_is
    blank_lines: bool = True
    list_style: str = "bullets"  # bullets | inline
    example: str = ""

    def all_fields(self) -> list[FieldSpec]:
        return [f for s in self.sections for f in s.fields]

    def field(self, field_id: str) -> FieldSpec:
        return next(f for f in self.all_fields() if f.id == field_id)

    def variant_label(self, variant: str) -> str:
        return str(self.call_types.get(variant, {}).get("label", variant))


def template_path(settings: Settings) -> Path:
    """``PCD_NOTE_TEMPLATE``, then the copy next to the .exe, then the default of the package."""
    if settings.note_template:
        path = Path(settings.note_template)
        if path.is_absolute() or path.is_file():
            return path
        # bare file name (config.env): next to the .exe, otherwise one of the templates of the package
        for base in [d for d in (install_dir(),) if d is not None] + [DEFAULT_TEMPLATE.parent]:
            if (base / path).is_file():
                return base / path
        return path
    if (d := install_dir()) is not None and (d / "phone_call_template.yaml").is_file():
        return d / "phone_call_template.yaml"
    return DEFAULT_TEMPLATE


def load_template(path: Path | None = None) -> Template:
    import yaml

    path = path or DEFAULT_TEMPLATE
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    sections, seen = [], set()
    for s in data.get("sections") or []:
        fields = []
        for f in s.get("fields") or []:
            fid = str(f["id"])
            if not re.fullmatch(r"[a-z0-9_]+", fid) or fid in seen:
                raise ValueError(f"template {path}: invalid or duplicate field id {fid!r}")
            seen.add(fid)
            when, bare = f.get("when"), bool(f.get("bare"))
            label = str(f.get("label") or "") or (str(s["title"]).rstrip(" :") if bare else "")
            if not label:
                raise ValueError(f"template {path}: field {fid!r} has no label")
            fields.append(FieldSpec(fid, label, str(f.get("help") or ""), bool(f.get("multi")) or bare,
                                    frozenset(when) if when else None, dict(f.get("rule") or {}), bare,
                                    frozenset(f.get("unless") or [])))
        sections.append(Section(str(s["title"]), fields))
    if not sections:
        raise ValueError(f"template {path}: no section")
    return Template(
        version=str(data.get("version") or "?"), title=str(data.get("title", "COMPTE RENDU D'APPEL") or ""),
        absent=str(data.get("absent") or "Aucune information notifiée"),
        uncertain=str(data.get("uncertain") or "À confirmer"),
        not_applicable=str(data.get("not_applicable") or "Non applicable"),
        call_types=dict(data.get("call_types") or {}), directions=dict(data.get("directions") or {}),
        sections=sections, path=str(path),
        section_case=str(data.get("section_case") or "upper"), blank_lines=bool(data.get("blank_lines", True)),
        list_style=str(data.get("list_style") or "bullets"), example=str(data.get("example") or "").strip(),
    )


# ---------------------------------------------------------------- filled note


@dataclass
class FieldValue:
    status: str = "absent"
    items: list[str] = field(default_factory=list)
    reason: str = ""
    source: str = ""  # conversation | poste | mots-clés | déduit | claude
    evidence: list[str] = field(default_factory=list)

    @classmethod
    def absent(cls) -> FieldValue:
        return cls("absent")


@dataclass
class CallContext:
    """What the note may use besides the conversation: authorised metadata of the PC."""

    direction: str | None = None  # entrant | sortant, chosen by the advisor
    variant: str | None = None  # movers | frontline | autre, chosen by the advisor
    started_at: float | None = None  # PC clock
    duration_s: int = 0
    agent_name: str = ""  # PCD_AGENT_NAME


@dataclass
class FilledNote:
    template: Template
    direction: str | None
    variant: str
    type_source: str  # "choisi par le conseiller" | "détection automatique"
    values: dict[str, FieldValue]

    @property
    def tags(self) -> set[str]:
        return {t for t in (self.direction, self.variant) if t}

    def visible_fields(self) -> list[tuple[Section, list[FieldSpec]]]:
        return [(s, [f for f in s.fields if f.visible(self.tags)]) for s in self.template.sections]


def section_heading(t: Template, section: Section) -> str:
    return section.title.upper() if t.section_case == "upper" else section.title


def _join(t: Template, items: list[str]) -> str:
    return " ; ".join(items)


def format_value(t: Template, spec: FieldSpec, v: FieldValue) -> list[str]:
    """Lines of one field: « Label : value », or the label and one bullet per item (list_style)."""
    items = [i.strip() for i in v.items if i and i.strip()]
    inline = t.list_style == "inline"
    if v.status == "absent" or (v.status == "present" and not items):
        return [f"{spec.label} : {t.absent}"]
    if v.status == "not_applicable":
        return [f"{spec.label} : {t.not_applicable}" + (f" — {v.reason}" if v.reason else "")]
    if v.status == "contradictory":
        head = f"{spec.label} : Contradiction à vérifier" + (f" — {v.reason}" if v.reason else "")
        return [f"{head} : {' / '.join(items)}"] if inline else [head] + [f"- {i}" for i in items]
    prefix = ""
    if v.status == "uncertain":
        prefix = t.uncertain + (f" — {v.reason}" if v.reason else "")
        if not items:
            return [f"{spec.label} : {prefix}"]
        prefix += " : "
    if len(items) == 1 or inline:
        return [f"{spec.label} : {prefix}{_join(t, items)}"]
    return [f"{spec.label} :" + (f" {prefix.rstrip(' :')}" if prefix else "")] + [f"- {i}" for i in items]


def format_bare(t: Template, v: FieldValue) -> list[str]:
    """Free lines of a field without label (nothing when absent: the section decides)."""
    items = [i.strip() for i in v.items if i and i.strip()]
    if v.status == "absent" or not items and v.status == "present":
        return []
    if v.status == "not_applicable":
        return [t.not_applicable + (f" — {v.reason}" if v.reason else "")]
    if v.status == "contradictory":
        return ["Contradiction à vérifier" + (f" — {v.reason}" if v.reason else "") + " : " + " / ".join(items)]
    if v.status == "uncertain":
        head = t.uncertain + (f" — {v.reason}" if v.reason else "")
        return [f"{head} : {i}" for i in items] if items else [head]
    return items


def render(note: FilledNote) -> str:
    t = note.template
    lines = []
    if t.title:
        kind = " · ".join(x for x in (t.variant_label(note.variant), t.directions.get(note.direction or "", "")) if x)
        lines.append(f"{t.title} — {kind}" if kind else t.title)
    for section, fields in note.visible_fields():
        if not fields:
            continue
        if lines and t.blank_lines:
            lines.append("")
        lines.append(section_heading(t, section))
        body = []
        for spec in fields:
            v = note.values.get(spec.id) or FieldValue.absent()
            body += format_bare(t, v) if spec.bare else format_value(t, spec, v)
        lines += body or [t.absent]  # every section says something
    return "\n".join(lines)


# ---------------------------------------------------------------- automatic check

ABSENT_VARIANTS = {"", "-", "n/a", "na", "aucune", "aucun", "néant", "neant", "non précisé", "non precise", "inconnu",
                   "non renseigné", "non communiqué", "rien", "none", "null", "aucune information"}
PROPOSAL_WORDS = ("je vous propose", "je peux vous proposer", "on pourrait", "nous pourrions", "il est possible",
                  "pourrait", "je vais", "nous allons", "on va", "sera ", "proposé", "propose")
NEXT_STEP_FIELDS = ("rendez_vous", "actions_restantes", "echeance")
FROM_METADATA_ONLY = ("date_heure",)
UNRELIABLE_FROM_CONVERSATION = ("nom", "telephone", "numero_wo")


def _numbers(text: str) -> set[str]:
    """Digit groups, spacing ignored: « 06.12.34.56.78 » and « 06 12 34 56 78 » are the same number."""
    return {re.sub(r"\D", "", m) for m in re.findall(r"\d(?:[\d .-]*\d)?", text)}


def check(note: FilledNote, transcript_text: str, metadata_text: str = "") -> list[dict]:
    """Verification before display. Normalises what can be (absent wording, unreliable statuses)
    and returns the flags shown to the advisor. ``transcript_text``: the whole conversation."""
    t, flags = note.template, []
    source_numbers = _numbers(transcript_text) | _numbers(metadata_text)
    quotes_ok = re.sub(r"\s+", " ", transcript_text)

    missing, normalised = [], 0
    for _section, fields in note.visible_fields():
        for spec in fields:
            v = note.values.get(spec.id)
            if v is None or v.status not in STATUSES:
                note.values[spec.id] = FieldValue.absent()
                missing.append(spec.label)
                continue
            items = [i for i in v.items if i and i.strip()]
            if v.status in ("present", "uncertain", "contradictory") and (
                    not items or all(i.strip().lower().rstrip(".") in ABSENT_VARIANTS for i in items)):
                if v.status == "present" or not v.reason:
                    note.values[spec.id] = FieldValue.absent()
                    normalised += 1
                    continue
            if spec.id in FROM_METADATA_ONLY and v.source != "poste" and v.status != "absent":
                note.values[spec.id] = FieldValue.absent()
                flags.append(_flag("source_non_autorisee", "warning",
                                   f"{spec.label} : seule l'horloge du poste est une source autorisée ; valeur retirée."))
                continue
            if spec.id in UNRELIABLE_FROM_CONVERSATION and v.status == "present" and v.source != "poste":
                v.status, v.reason = "uncertain", v.reason or "entendu dans la conversation, non vérifié"
            # Information present in the conversation (or in the PC metadata)?
            for item in items:
                for q in re.findall(r"« (.+?) »", item):
                    if q.rstrip("…").strip() not in quotes_ok:
                        flags.append(_flag("citation_introuvable", "blocking",
                                           f"{spec.label} : citation absente de la transcription ({q[:60]})."))
                unknown = [n for n in _numbers(item) if n not in source_numbers and len(n) > 1]
                if unknown and v.status == "present":
                    flags.append(_flag("chiffre_non_trouve", "blocking",
                                       f"{spec.label} : {', '.join(sorted(unknown))} ne figure ni dans la conversation "
                                       "ni dans les informations du poste."))
            if spec.id == "actions_effectuees" and v.status == "present":
                proposed = [i for i in items if any(w in i.lower() for w in PROPOSAL_WORDS)
                            and not any(w in i.lower() for w in ("j'ai ", "je viens de", "c'est fait", "c'est noté"))]
                if proposed:
                    flags.append(_flag("action_non_effectuee", "blocking",
                                       "Actions réellement effectuées : un élément ressemble à une proposition ou à une "
                                       "action future — vérifier qu'il a vraiment été fait."))
    if missing:
        flags.append(_flag("champs_manquants", "blocking", "Champs non renseignés (mis à « "
                           + t.absent + " ») : " + ", ".join(missing)))
    if normalised:
        flags.append(_flag("absents_normalises", "info",
                           f"{normalised} champ(s) vide(s) ou imprécis remplacé(s) par « {t.absent} »."))
    visible = {f.id for _s, fs in note.visible_fields() for f in fs}
    steps = [fid for fid in NEXT_STEP_FIELDS if fid in visible]
    if steps and all(note.values.get(fid, FieldValue()).status == "absent" for fid in steps):
        flags.append(_flag("pas_de_suite", "warning", "Aucune prochaine étape identifiée dans la conversation."))
    return flags


def _flag(code: str, severity: str, message: str) -> dict:
    return {"code": code, "severity": severity, "message": message}


def points_to_verify(note: FilledNote) -> list[str]:
    out = []
    for _s, fields in note.visible_fields():
        for spec in fields:
            v = note.values[spec.id]
            if v.status == "contradictory":
                out.append(f"{spec.label} : versions contradictoires ({' / '.join(v.items)})")
            elif v.status == "uncertain":
                out.append(f"{spec.label} : {v.reason or 'à confirmer'}")
    return out
