"""Moteur de coaching individuel : profil, 3 difficultés principales, programme personnalisé (GROW).

Le profil est calculé uniquement à partir des analyses enregistrées : aucune donnée n'est inventée.
Quand l'historique est insuffisant, l'outil le dit (« données insuffisantes ») au lieu d'extrapoler.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from sales_coach.analysis.catalog import CRITERIA, CRITERIA_LABELS, CRITERIA_MAX, ERRORS

PERSONA_FOR_ERROR = {
    "ACCEPTATION_RAPIDE": ["presse", "refus_total"],
    "QUESTION_FERMEE_INUTILE": ["indecis", "deja_equipe"],
    "QUESTION_ORIENTEE_NEGATIVE": ["indecis", "plus_payer"],
    "DECOUVERTE_ABSENTE": ["indecis", "presse"],
    "PAS_DE_REFORMULATION": ["mecontent", "indecis"],
    "RAISON_NON_EXPLOREE": ["indecis", "deja_equipe"],
    "OBJECTION_IGNOREE": ["refus_total", "plus_payer"],
    "OBJECTION_SANS_EXPLORATION": ["plus_payer", "deja_equipe"],
    "PRESSION": ["agressif", "mecontent"],
    "ARGUMENT_GENERIQUE": ["deja_equipe", "indecis"],
    "MONOLOGUE": ["presse"],
    "PROPOSITION_PREMATUREE": ["indecis"],
    "PAS_DE_PROPOSITION": ["deja_equipe", "plus_payer"],
    "CONCLUSION_SANS_ENGAGEMENT": ["indecis"],
    "OUVERTURE_IMPERSONNELLE": ["mecontent"],
    "VOCABULAIRE_NEGATIF": ["mecontent"],
}
STRENGTH_TEXT = {
    "contact": "Bonne prise de contact et mise en confiance",
    "decouverte": "Découverte du besoin solide (questions ouvertes, reformulation)",
    "raisons": "Bonne exploration du projet de déménagement",
    "argumentation": "Argumentation reliée aux besoins du client",
    "objections": "Traitement des objections maîtrisé",
    "proposition": "Propose des solutions de rétention adaptées",
    "conclusion": "Conclusions claires avec engagement du client",
}


@dataclass
class Difficulty:
    code: str
    title: str
    criterion: str
    frequency: float  # part des appels concernés
    calls_with_error: int
    total_calls: int
    weight: float
    explanation: str


@dataclass
class ProgramStep:
    difficulty: str
    goal: str
    reality: str
    options: list[str]
    will: str
    measure: str
    personas: list[str]
    level: int


@dataclass
class AgentProfile:
    agent_id: int
    agent_name: str
    n_calls: int
    avg_score: float | None
    last_score: float | None
    best_score: float | None
    progression: float | None  # points gagnés (moyenne 3 derniers - moyenne 3 premiers)
    trend_per_call: float | None
    level: str
    criteria_pct: dict[str, float | None]
    strengths: list[str]
    difficulties: list[Difficulty]
    recurring_errors: list[tuple[str, int]]
    objectives: list[str]
    program: list[ProgramStep]
    training_sessions: int = 0
    training_avg: float | None = None
    recommended_difficulty: int = 1
    notes: list[str] = field(default_factory=list)


def _level(avg: float | None) -> str:
    if avg is None:
        return "Non évalué"
    for th, label in [(90, "Expert"), (75, "Avancé"), (60, "Confirmé"), (40, "En développement"), (0, "Débutant")]:
        if avg >= th:
            return label
    return "Débutant"


def build_profile(agent_id: int, agent_name: str, analyses: list[dict], trainings: list[dict] | None = None, manager_objectives: str = "") -> AgentProfile:
    trainings = trainings or []
    rows = sorted([a for a in analyses if not a.get("is_training")], key=lambda r: r["call_date"])
    n = len(rows)
    notes: list[str] = []
    scores = [r["total_score"] for r in rows]
    avg = round(float(np.mean(scores)), 1) if scores else None
    progression = trend = None
    if n >= 4:
        k = min(3, n // 2)
        progression = round(float(np.mean(scores[-k:]) - np.mean(scores[:k])), 1)
        trend = round(float(np.polyfit(np.arange(n), scores, 1)[0]), 2)
    else:
        notes.append(f"Progression non calculée : {n} appel(s) analysé(s), 4 minimum nécessaires.")

    crit_pct: dict[str, float | None] = {}
    for key, _, mx in CRITERIA:
        vals = [r[key] for r in rows if r.get(key) is not None]
        crit_pct[key] = round(100 * float(np.mean(vals)) / mx, 1) if vals else None

    strengths = [STRENGTH_TEXT[k] for k, v in sorted(crit_pct.items(), key=lambda kv: -(kv[1] or 0)) if v is not None and v >= 70][:3]
    if not strengths and n:
        best = max((k for k in crit_pct if crit_pct[k] is not None), key=lambda k: crit_pct[k], default=None)
        if best:
            strengths = [f"Point le plus solide à ce stade : {CRITERIA_LABELS[best].lower()} ({crit_pct[best]:.0f} %)"]

    # Difficultés : fréquence de l'erreur × gravité, renforcée si le critère associé est faible
    counts: dict[str, int] = {}
    occurrences: dict[str, int] = {}
    for r in rows:
        codes = r["error_codes"]
        for c in set(codes):
            counts[c] = counts.get(c, 0) + 1
        for c in codes:
            occurrences[c] = occurrences.get(c, 0) + 1
    diffs: list[Difficulty] = []
    for code, cnt in counts.items():
        if code not in ERRORS:
            continue
        e = ERRORS[code]
        freq = cnt / n
        crit_weak = 1 - (crit_pct.get(e.criterion) or 0) / 100
        weight = freq * e.severity * (0.5 + crit_weak)
        diffs.append(Difficulty(
            code=code, title=e.title, criterion=CRITERIA_LABELS[e.criterion], frequency=round(freq, 2), calls_with_error=cnt, total_calls=n,
            weight=round(weight, 3),
            explanation=f"Observée dans {cnt} appel(s) sur {n}. {e.why_wrong}",
        ))
    diffs.sort(key=lambda d: -d.weight)
    # Diversité : une difficulté par critère d'abord (les plus lourdes), puis complément.
    top: list[Difficulty] = []
    seen_crit: set[str] = set()
    for d in diffs:
        if d.criterion not in seen_crit and len(top) < 3:
            top.append(d)
            seen_crit.add(d.criterion)
    for d in diffs:
        if len(top) >= 3:
            break
        if d not in top:
            top.append(d)
    top.sort(key=lambda d: -d.weight)

    recurring = sorted([(ERRORS[c].title, cnt) for c, cnt in counts.items() if c in ERRORS and (cnt >= 2 or (n and cnt / n >= 0.4))], key=lambda x: -x[1])

    level_num = 1 if (avg or 0) < 50 else (2 if (avg or 0) < 75 else 3)
    program = [_program_step(d, level_num, crit_pct) for d in top]
    objectives = [o.strip() for o in manager_objectives.splitlines() if o.strip()]
    objectives += [step.goal for step in program]
    if avg is not None and avg < 75:
        objectives.append(f"Atteindre une note moyenne de {min(100, int(avg // 5 * 5 + 10))}/100 sur les 10 prochains appels (actuelle : {avg}).")

    t_scores = [t["score"] for t in trainings if t.get("score") is not None]
    recommended = 1
    if t_scores:
        last = t_scores[-3:]
        last_diff = max((t["difficulty"] for t in trainings[-3:]), default=1)
        recommended = min(5, last_diff + 1) if np.mean(last) >= 70 else max(1, last_diff - (1 if np.mean(last) < 40 else 0))

    return AgentProfile(
        agent_id=agent_id, agent_name=agent_name, n_calls=n, avg_score=avg, last_score=scores[-1] if scores else None,
        best_score=max(scores) if scores else None, progression=progression, trend_per_call=trend, level=_level(avg),
        criteria_pct=crit_pct, strengths=strengths, difficulties=top, recurring_errors=recurring, objectives=objectives,
        program=program, training_sessions=len(trainings), training_avg=round(float(np.mean(t_scores)), 1) if t_scores else None,
        recommended_difficulty=recommended, notes=notes,
    )


def _program_step(d: Difficulty, level: int, crit_pct: dict) -> ProgramStep:
    e = ERRORS[d.code]
    exercises = [x for x in e.exercises if x.level <= level] or e.exercises[:1]
    exercises = sorted(exercises, key=lambda x: -x.level)[:2]
    pct = crit_pct.get(e.criterion)
    goal = {
        "ACCEPTATION_RAPIDE": "Ne plus jamais lancer une résiliation sans au moins 3 questions ouvertes (0 occurrence sur les 10 prochains appels).",
        "QUESTION_FERMEE_INUTILE": "Atteindre au moins 3 questions ouvertes pour 1 fermée en découverte.",
        "QUESTION_ORIENTEE_NEGATIVE": "Supprimer toute question orientée négativement (0 occurrence).",
        "DECOUVERTE_ABSENTE": "Poser au moins 3 questions ouvertes de découverte dans chaque appel.",
        "PAS_DE_REFORMULATION": "Reformuler au moins une fois la situation du client dans chaque appel.",
        "RAISON_NON_EXPLOREE": "Identifier systématiquement : raison, destination, date et statut du nouveau logement.",
        "OBJECTION_IGNOREE": "Accueillir chaque objection (empathie ou reformulation) avant d'y répondre.",
        "OBJECTION_SANS_EXPLORATION": "Poser une question d'exploration avant chaque réponse à une objection.",
        "PRESSION": "Zéro formulation d'obligation ou de reproche (« vous devez », « calmez-vous », « c'est la procédure »).",
        "ARGUMENT_GENERIQUE": "Relier chaque argument à un besoin exprimé par le client (« Vous m'avez dit que… »).",
        "MONOLOGUE": "Limiter chaque argument à 3 phrases suivies d'une question.",
        "PROPOSITION_PREMATUREE": "Ne proposer qu'après une reformulation validée par le client.",
        "PAS_DE_PROPOSITION": "Présenter au moins une solution de continuité documentée dans chaque appel de résiliation pour déménagement.",
        "CONCLUSION_SANS_ENGAGEMENT": "Conclure chaque appel par récapitulatif + prochaine étape datée + validation.",
        "OUVERTURE_IMPERSONNELLE": "Ouvrir chaque appel par salutation, présentation et objectif.",
        "VOCABULAIRE_NEGATIF": "Remplacer les tics négatifs (« pas de souci », « malheureusement ») par des formulations positives.",
    }.get(d.code, e.action)
    reality = f"{d.explanation} Critère « {d.criterion} » : {pct:.0f} % des points en moyenne." if pct is not None else d.explanation
    return ProgramStep(
        difficulty=d.title, goal=goal, reality=reality,
        options=[f"[Niveau {x.level}] {x.title} — {x.instructions}" for x in exercises],
        will=e.action,
        measure=f"Indicateur : fréquence de « {d.title} » sur les prochains appels analysés (actuellement {int(d.frequency * 100)} % des appels).",
        personas=PERSONA_FOR_ERROR.get(d.code, ["indecis"]), level=level,
    )
