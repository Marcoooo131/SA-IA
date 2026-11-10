"""Modèles de données partagés par tous les modules."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

AGENT = "COMMERCIAL"
CLIENT = "CLIENT"
UNKNOWN = "INCONNU"


def fmt_ts(seconds: float | None) -> str:
    if seconds is None:
        return ""
    seconds = max(0, int(round(seconds)))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


@dataclass
class Utterance:
    index: int
    speaker: str  # COMMERCIAL | CLIENT | INCONNU
    text: str
    start: float | None = None
    end: float | None = None

    @property
    def timestamp(self) -> str:
        return fmt_ts(self.start)

    def ref(self) -> str:
        """Référence lisible : n° de réplique + horodatage si disponible."""
        ts = f" @ {self.timestamp}" if self.start is not None else ""
        return f"réplique #{self.index + 1}{ts}"


@dataclass
class Transcript:
    utterances: list[Utterance]
    source: str = "texte"  # texte | docx | audio
    language: str = "fr"
    speaker_attribution: str = "explicite"  # explicite | heuristique
    audio_metrics: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    @property
    def has_timestamps(self) -> bool:
        return any(u.start is not None for u in self.utterances)

    def agent_turns(self) -> list[Utterance]:
        return [u for u in self.utterances if u.speaker == AGENT]

    def client_turns(self) -> list[Utterance]:
        return [u for u in self.utterances if u.speaker == CLIENT]

    def to_text(self) -> str:
        lines = []
        for u in self.utterances:
            ts = f"[{u.timestamp}] " if u.start is not None else ""
            lines.append(f"{ts}{u.speaker} : {u.text}")
        return "\n".join(lines)

    def to_dict(self) -> dict[str, Any]:
        return {
            "utterances": [asdict(u) for u in self.utterances],
            "source": self.source,
            "language": self.language,
            "speaker_attribution": self.speaker_attribution,
            "audio_metrics": self.audio_metrics,
            "warnings": self.warnings,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Transcript":
        return cls(
            utterances=[Utterance(**u) for u in data.get("utterances", [])],
            source=data.get("source", "texte"),
            language=data.get("language", "fr"),
            speaker_attribution=data.get("speaker_attribution", "explicite"),
            audio_metrics=data.get("audio_metrics", {}),
            warnings=data.get("warnings", []),
        )


@dataclass
class Evidence:
    """Un extrait réel de la conversation, jamais reformulé."""

    utterance_index: int
    speaker: str
    quote: str
    timestamp: str = ""

    def label(self) -> str:
        ts = f" [{self.timestamp}]" if self.timestamp else ""
        return f"#{self.utterance_index + 1}{ts} {self.speaker} : « {self.quote} »"


@dataclass
class Finding:
    """Une erreur commerciale justifiée par un extrait réel."""

    code: str
    criterion: str
    title: str
    evidence: Evidence
    why_wrong: str
    should_understand: str
    should_say: str
    better_phrasing: str
    consequence: str = ""
    severity: int = 2  # 1 mineure, 2 notable, 3 majeure
    origin: str = "règles"  # règles | ia (vérifiée)


@dataclass
class MissedOpportunity:
    code: str
    title: str
    description: str
    suggested_question: str
    evidence: Evidence | None = None
    origin: str = "règles"


@dataclass
class CriterionScore:
    key: str
    label: str
    max_points: int
    score: float
    positives: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    evidence: list[Evidence] = field(default_factory=list)
    consequences: str = ""
    correction: str = ""
    evaluated: bool = True  # False si le critère n'est pas observable dans l'appel

    @property
    def ratio(self) -> float:
        return self.score / self.max_points if self.max_points else 0.0


@dataclass
class IdealExchange:
    client_line: Evidence | None
    agent_line: Evidence
    coach_comment: str
    better_response: str


@dataclass
class SourceRef:
    title: str
    source: str
    url: str = ""
    scope: str = ""  # general | entreprise | ia
    excerpt: str = ""


@dataclass
class AnalysisReport:
    total_score: float
    level: str
    retention_potential: str
    quality_label: str
    situations: list[str]
    criteria: list[CriterionScore]
    findings: list[Finding]
    missed_opportunities: list[MissedOpportunity]
    ideal_conversation: list[IdealExchange]
    improvement_plan: list[str]
    stats: dict[str, Any]
    stages: list[dict[str, Any]]
    retention_checklist: list[dict[str, Any]]
    company_sources: list[SourceRef]
    engine: str  # "règles" | "règles + IA (<modèle>)"
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "AnalysisReport":
        def ev(x):
            return Evidence(**x) if x else None

        return cls(
            total_score=d["total_score"],
            level=d["level"],
            retention_potential=d["retention_potential"],
            quality_label=d["quality_label"],
            situations=d.get("situations", []),
            criteria=[
                CriterionScore(**{**c, "evidence": [Evidence(**e) for e in c.get("evidence", [])]})
                for c in d.get("criteria", [])
            ],
            findings=[Finding(**{**f, "evidence": Evidence(**f["evidence"])}) for f in d.get("findings", [])],
            missed_opportunities=[
                MissedOpportunity(**{**m, "evidence": ev(m.get("evidence"))})
                for m in d.get("missed_opportunities", [])
            ],
            ideal_conversation=[
                IdealExchange(
                    client_line=ev(x.get("client_line")),
                    agent_line=Evidence(**x["agent_line"]),
                    coach_comment=x["coach_comment"],
                    better_response=x["better_response"],
                )
                for x in d.get("ideal_conversation", [])
            ],
            improvement_plan=d.get("improvement_plan", []),
            stats=d.get("stats", {}),
            stages=d.get("stages", []),
            retention_checklist=d.get("retention_checklist", []),
            company_sources=[SourceRef(**s) for s in d.get("company_sources", [])],
            engine=d.get("engine", "règles"),
            warnings=d.get("warnings", []),
        )
