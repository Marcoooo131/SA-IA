"""Enrichissement de l'analyse par un modèle IA, avec vérification anti-invention.

Le modèle reçoit la transcription numérotée, la grille, le playbook de la situation et les extraits
de la base documentaire. Il propose des constats supplémentaires au format JSON.

Chaque constat est VÉRIFIÉ : la citation doit exister mot pour mot dans la réplique indiquée, et une
erreur ne peut citer qu'une réplique du COMMERCIAL. Tout constat invérifiable est rejeté (et compté).
La note reste calculée par le moteur « règles » : elle est stable et comparable d'un appel à l'autre.
"""
from __future__ import annotations

import re

from sales_coach.analysis.catalog import CRITERIA_LABELS
from sales_coach.core.models import AGENT, AnalysisReport, Evidence, Finding, MissedOpportunity, Transcript
from sales_coach.llm.factory import LLM, LLMError, Message

SYSTEM = """Tu es directeur commercial et formateur expert en fidélisation client (rétention lors d'un déménagement, télésurveillance résidentielle).
Tu es exigeant, précis, pédagogique et constructif.
RÈGLES ABSOLUES :
1. Tu ne cites QUE des phrases présentes mot pour mot dans la transcription, avec le numéro de réplique exact.
2. Tu n'inventes jamais de tarif, d'offre, de condition contractuelle ni de possibilité de transfert. Si une solution dépend des conditions de l'entreprise, écris « à vérifier dans la documentation métier » sauf si un extrait documentaire fourni la mentionne (cite-le alors).
3. Tu ne répètes pas les constats déjà listés.
4. Tes « meilleures formulations » sont naturelles, en français oral, adaptées à la situation du client.
Réponds en JSON uniquement."""

SCHEMA = """{
  "findings": [{"utterance": <numéro de réplique du COMMERCIAL>, "quote": "<extrait exact>", "criterion": "<contact|decouverte|raisons|argumentation|objections|proposition|conclusion>",
                "title": "...", "why_wrong": "...", "should_understand": "...", "should_say": "...", "better_phrasing": "...", "consequence": "...", "severity": 1|2|3}],
  "missed_opportunities": [{"utterance": <numéro de réplique>, "quote": "<extrait exact>", "title": "...", "description": "...", "suggested_question": "..."}],
  "coach_summary": "<3 à 5 phrases de synthèse pédagogique>"
}"""


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("’", "'")).strip().strip("«»\"' ").lower()


def locate_quote(transcript: Transcript, utterance_no: int, quote: str) -> Evidence | None:
    """Retrouve la citation dans la réplique indiquée (ou, à défaut, une réplique voisine) ; None si introuvable."""
    nq = _norm(quote)
    if len(nq) < 4:
        return None
    candidates = [utterance_no - 1, utterance_no, utterance_no - 2]
    for idx in candidates:
        if 0 <= idx < len(transcript.utterances):
            u = transcript.utterances[idx]
            text_norm = _norm(u.text)
            pos = text_norm.find(nq)
            if pos != -1:
                # Retourne l'extrait original (non normalisé) correspondant.
                exact = _exact_slice(u.text, quote)
                return Evidence(u.index, u.speaker, exact or u.text, u.timestamp)
    return None


def _exact_slice(text: str, quote: str) -> str | None:
    q = quote.strip().strip("«»\"' ")
    if q in text:
        return q
    pattern = r"\s+".join(re.escape(w) for w in q.replace("’", "'").split())
    m = re.search(pattern, text.replace("’", "'"), re.I)
    return text[m.start():m.end()] if m else None


def build_prompt(transcript: Transcript, report: AnalysisReport, kb_context: list[str]) -> list[Message]:
    lines = [f"#{u.index + 1} [{u.timestamp}] {u.speaker} : {u.text}" if u.start is not None else f"#{u.index + 1} {u.speaker} : {u.text}"
             for u in transcript.utterances]
    already = "\n".join(f"- {f.code} (réplique #{f.evidence.utterance_index + 1}) : {f.title}" for f in report.findings) or "- aucun"
    grid = "\n".join(f"- {k} : {label}" for k, label in CRITERIA_LABELS.items())
    docs = "\n\n".join(kb_context) if kb_context else "Aucun extrait documentaire d'entreprise disponible."
    user = f"""Situations détectées : {', '.join(report.situations) or 'non déterminées'}

GRILLE :
{grid}

CONSTATS DÉJÀ ÉTABLIS (ne pas répéter) :
{already}

EXTRAITS DOCUMENTAIRES (seule source autorisée pour les offres / procédures) :
{docs}

TRANSCRIPTION NUMÉROTÉE :
{chr(10).join(lines)}

Identifie au maximum 5 erreurs supplémentaires et 4 occasions manquées réellement observables, puis rédige la synthèse.
Format attendu :
{SCHEMA}"""
    return [Message("system", SYSTEM), Message("user", user)]


def enrich_with_llm(report: AnalysisReport, transcript: Transcript, llm: LLM, kb_context: list[str] | None = None) -> AnalysisReport:
    try:
        data = llm.chat_json(build_prompt(transcript, report, kb_context or []))
    except LLMError as exc:
        report.warnings.append(f"Enrichissement IA indisponible ({exc}) : rapport issu du moteur « règles » uniquement.")
        return report

    rejected = 0
    existing = {(f.evidence.utterance_index, f.title.lower()) for f in report.findings}
    for item in (data.get("findings") or [])[:8]:
        try:
            ev = locate_quote(transcript, int(item.get("utterance", 0)), str(item.get("quote", "")))
        except (TypeError, ValueError):
            ev = None
        crit = item.get("criterion")
        if ev is None or ev.speaker != AGENT or crit not in CRITERIA_LABELS:
            rejected += 1
            continue
        key = (ev.utterance_index, str(item.get("title", "")).lower())
        if key in existing:
            continue
        existing.add(key)
        report.findings.append(Finding(
            code="IA_" + crit.upper(),
            criterion=crit,
            title=str(item.get("title", "Constat IA"))[:160],
            evidence=ev,
            why_wrong=str(item.get("why_wrong", "")),
            should_understand=str(item.get("should_understand", "")),
            should_say=str(item.get("should_say", "")),
            better_phrasing=str(item.get("better_phrasing", "")),
            consequence=str(item.get("consequence", "")),
            severity=max(1, min(3, int(item.get("severity", 2) or 2))),
            origin="ia (vérifiée)",
        ))
    for item in (data.get("missed_opportunities") or [])[:6]:
        try:
            ev = locate_quote(transcript, int(item.get("utterance", 0)), str(item.get("quote", "")))
        except (TypeError, ValueError):
            ev = None
        if ev is None:
            rejected += 1
            continue
        report.missed_opportunities.append(MissedOpportunity(
            code="ia:" + str(len(report.missed_opportunities)),
            title=str(item.get("title", "Occasion manquée"))[:160],
            description=str(item.get("description", "")),
            suggested_question=str(item.get("suggested_question", "")),
            evidence=ev,
            origin="ia (vérifiée)",
        ))
    summary = str(data.get("coach_summary", "")).strip()
    if summary:
        report.stats["coach_summary"] = summary
    report.findings.sort(key=lambda f: (f.evidence.utterance_index, -f.severity))
    report.engine = f"règles + IA ({llm.label})"
    if rejected:
        report.warnings.append(f"{rejected} constat(s) proposé(s) par l'IA rejeté(s) car la citation était introuvable dans la transcription.")
    return report
