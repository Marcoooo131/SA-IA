"""Orchestration : pipeline d'analyse, base de connaissances partagée, garde-fous de confidentialité."""
from __future__ import annotations

from dataclasses import dataclass

from sales_coach.analysis.analyzer import analyze, verify_report
from sales_coach.analysis.llm_analyzer import enrich_with_llm
from sales_coach.analysis.retention import SITUATIONS_BY_KEY, detect_situations
from sales_coach.config import get_settings
from sales_coach.core.models import AnalysisReport, Transcript
from sales_coach.llm.factory import ExternalApiBlocked, LLMError, get_llm
from sales_coach.security.anonymizer import anonymize_transcript

_kb = None


def get_kb():
    """Base de connaissances partagée ; charge les fiches générales au premier lancement."""
    global _kb
    if _kb is None:
        from sales_coach.knowledge.seed import load_seed
        from sales_coach.knowledge.store import KnowledgeBase

        _kb = KnowledgeBase()
        if not _kb.list_documents("general"):
            load_seed(_kb)
        elif _kb.stale_chunks():
            _kb.reindex()
    return _kb


def reset_kb() -> None:
    global _kb
    _kb = None


@dataclass
class PipelineResult:
    report: AnalysisReport
    transcript: Transcript
    anonymized: bool
    anonymization_counts: dict
    llm_used: str
    integrity_problems: list[str]


def run_analysis(transcript: Transcript, *, anonymize: bool = True, use_llm: bool = False, authorize_external: bool = False,
                 known_names: list[str] | None = None, use_kb: bool = True) -> PipelineResult:
    settings = get_settings()
    counts: dict = {}
    if anonymize:
        transcript, counts = anonymize_transcript(transcript, known_names)
    kb = None
    if use_kb:
        try:
            kb = get_kb()
        except Exception:  # base indisponible : l'analyse continue, avec avertissement
            kb = None
    report = analyze(transcript, kb=kb)
    llm_used = ""
    if use_llm:
        try:
            llm = get_llm(settings)
        except ExternalApiBlocked as exc:
            llm = None
            report.warnings.append(str(exc))
        except LLMError as exc:
            llm = None
            report.warnings.append(f"Modèle IA non configuré correctement : {exc}")
        if llm is not None:
            if llm.external and not authorize_external:
                report.warnings.append("Envoi vers un service IA externe non autorisé pour cet appel : analyse « règles » uniquement.")
            elif llm.external and not anonymize:
                report.warnings.append("Envoi externe refusé : l'anonymisation est obligatoire avant tout envoi vers un service externe.")
            else:
                ctx: list[str] = []
                if kb is not None:
                    situations = detect_situations([u.text for u in transcript.client_turns()]) or [SITUATIONS_BY_KEY["demenagement"]]
                    for s in situations[:3]:
                        ctx += kb.context_for(s.kb_query, scope="entreprise", k=2)
                report = enrich_with_llm(report, transcript, llm, ctx)
                llm_used = llm.label
        elif settings.llm_provider in {"", "none"}:
            report.warnings.append("Aucun modèle IA configuré (ASC_LLM_PROVIDER=none) : analyse « règles » uniquement.")
    problems = verify_report(report, transcript)
    if problems:  # garde-fou : on retire tout constat dont la citation ne serait pas vérifiable
        bad = {p.split(" :")[0] for p in problems}
        report.findings = [f for f in report.findings if f"Erreur {f.code}" not in bad]
        report.warnings.append(f"{len(problems)} citation(s) non vérifiable(s) retirée(s) du rapport.")
    return PipelineResult(report, transcript, anonymize, counts, llm_used, problems)
