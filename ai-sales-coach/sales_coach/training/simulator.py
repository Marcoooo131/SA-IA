"""Simulateur de client pour l'entraînement commercial.

Deux moteurs :
- « scénario » (par défaut, hors ligne) : client à état caché (ouverture, irritation, faits révélés)
  qui réagit au comportement détecté dans chaque message du commercial (question ouverte / fermée,
  empathie, reformulation, pression, proposition, acceptation de la résiliation…). Déterministe à
  graine fixe, donc rejouable.
- « IA » (si un modèle est configuré) : le modèle joue le client à partir de la même fiche cachée.

Pendant l'exercice, le client ne donne JAMAIS de conseil : le débriefing n'arrive qu'à la fin.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field

from sales_coach.analysis.nlp import behaviour, extract_questions, has_any, lexical_overlap, words
from sales_coach.core.models import AGENT, CLIENT, Transcript, Utterance
from sales_coach.training.personas import PERSONAS, TOPIC_PATTERNS, Persona

DIFFICULTY_LABELS = {1: "Découverte", 2: "Facile", 3: "Intermédiaire", 4: "Difficile", 5: "Expert"}


@dataclass
class SimState:
    persona_key: str
    difficulty: int
    seed: int
    openness: float
    irritation: float
    revealed: list[str] = field(default_factory=list)
    turns: list[dict] = field(default_factory=list)  # {"speaker", "text"}
    proposal_made: bool = False
    proposal_accepted: bool = False
    finished: bool = False
    outcome: str = ""
    engine: str = "scénario"
    closed_streak: int = 0
    objections_used: int = 0

    def to_dict(self) -> dict:
        return self.__dict__.copy()

    @classmethod
    def from_dict(cls, d: dict) -> "SimState":
        return cls(**d)


def start(persona_key: str, difficulty: int = 1, seed: int | None = None, engine: str = "scénario") -> SimState:
    p = PERSONAS[persona_key]
    difficulty = max(1, min(5, int(difficulty)))
    seed = seed if seed is not None else random.randint(0, 10**6)
    st = SimState(
        persona_key=persona_key, difficulty=difficulty, seed=seed,
        openness=max(0.5, p.initial_openness - 0.6 * (difficulty - 1)),
        irritation=min(9.0, p.initial_irritation + 0.5 * (difficulty - 1)),
        engine=engine,
    )
    st.turns.append({"speaker": CLIENT, "text": random.Random(seed).choice(p.openings)})
    return st


def _rng(st: SimState) -> random.Random:
    return random.Random(st.seed + len(st.turns))


def _topics(text: str) -> list[str]:
    return [t for t, pats in TOPIC_PATTERNS.items() if has_any(text, pats)]


def _max_turns(st: SimState) -> int:
    return 10 + 2 * st.difficulty


def _required_facts(p: Persona, st: SimState) -> list[str]:
    n = 1 if st.difficulty <= 2 else (2 if st.difficulty <= 4 else len(p.key_facts))
    return p.key_facts[:max(1, min(n, len(p.key_facts)))]


def reply(st: SimState, agent_text: str) -> SimState:
    """Ajoute la réplique du commercial et calcule la réponse du client (moteur scénario)."""
    if st.finished:
        return st
    p = PERSONAS[st.persona_key]
    rng = _rng(st)
    st.turns.append({"speaker": AGENT, "text": agent_text.strip()})
    agent_turns = [t for t in st.turns if t["speaker"] == AGENT]
    last_client = next((t["text"] for t in reversed(st.turns[:-1]) if t["speaker"] == CLIENT), "")
    sens = p.sensitivity * (0.8 + 0.1 * st.difficulty)

    questions = extract_questions(0, agent_text)
    kinds = {q.kind for q in questions}
    open_q = kinds & {"ouverte", "information", "reformulation"}
    empathy = behaviour(agent_text, "empathy") or behaviour(agent_text, "reformulation")
    pressure = behaviour(agent_text, "pressure")
    accept = behaviour(agent_text, "acceptance")
    proposal = behaviour(agent_text, "proposal")
    value = behaviour(agent_text, "value")
    closing = behaviour(agent_text, "closing_recap") or behaviour(agent_text, "next_step")
    personalized = lexical_overlap(agent_text, " ".join(t["text"] for t in st.turns if t["speaker"] == CLIENT)) >= 0.12
    long_msg = len(words(agent_text)) >= 70
    parts: list[str] = []

    # Réactions émotionnelles
    if pressure:
        st.irritation += 2.5 * sens
        st.openness -= 1.5 * sens
        parts.append(rng.choice(p.irritation_lines))
    elif empathy:
        st.irritation = max(0.0, st.irritation - 1.5)
        st.openness += 0.8
        if rng.random() < 0.7:
            parts.append(rng.choice(p.empathy_reactions))
    if long_msg:
        st.irritation += 1.0 * sens
        if p.key in {"presse", "agressif"}:
            parts.append(rng.choice(p.irritation_lines))
    if "fermée orientée négativement" in kinds:
        st.openness -= 1.0 * sens

    # Acceptation de la résiliation par le commercial
    if accept and not proposal:
        parts.append(p.accept_cancel_line)
        return _finish(st, parts, "résilié")

    # Colère maximale
    if st.irritation >= 10:
        parts.append(p.end_lines["irritated"])
        return _finish(st, parts, "résilié (client irrité)")

    # Proposition
    if proposal:
        st.proposal_made = True
        required = _required_facts(p, st)
        discovered = all(f in st.revealed for f in required)
        if discovered and st.openness >= 3.0 + 0.3 * st.difficulty and st.irritation < 7:
            st.proposal_accepted = True
            st.openness += 1.5
            parts.append(p.proposal_accept)
        elif discovered:
            parts.append(p.proposal_soft)
            st.openness += 0.3
        else:
            st.openness -= 0.7 * sens
            parts.append(p.objections[st.objections_used % len(p.objections)])
            st.objections_used += 1
        return _close_turn(st, parts, p, agent_turns)

    # Conclusion du commercial après une proposition acceptée
    if closing and st.proposal_accepted:
        parts.append("Oui, ça me convient. Merci pour votre aide, au revoir.")
        return _finish(st, parts, "conservé" if p.retainable else "sortie de qualité")
    if closing and not st.proposal_made and st.revealed:
        parts.append(p.end_lines["timeout"])
        return _finish(st, parts, "non conclu")

    # Questions
    topics = _topics(agent_text)
    if open_q:
        st.closed_streak = 0
        st.openness += 0.4
        target = next((t for t in topics if t in p.facts and t not in st.revealed), None)
        if target is None and not topics:
            target = next((t for t in p.fact_order if t not in st.revealed), None)
        if target is None:
            target = next((t for t in topics if t in p.facts), None)
        if target is not None:
            if target not in st.revealed:
                st.revealed.append(target)
            detailed = st.openness >= 2.5 or empathy
            parts.append(p.facts[target][0] if detailed else p.facts[target][1])
        else:
            parts.append("Je ne vois pas trop quoi vous dire de plus.")
    elif questions:  # questions fermées
        st.closed_streak += 1
        target = next((t for t in topics if t in p.facts), None)
        if "fermée orientée négativement" in kinds or has_any(agent_text, [r"\bresili", r"\barreter\b", r"\bannuler\b"]):
            ans = "Oui, c'est ce que je veux." if st.persona_key != "indecis" else "Euh… oui, je crois."
        else:
            ans = rng.choice(p.closed_answers)
        if target is not None:
            ans = p.facts[target][1]
            if target not in st.revealed and st.difficulty <= 2:
                st.revealed.append(target)
        parts.append(ans)
        if st.closed_streak >= 3:
            st.irritation += 0.8 * sens
            parts.append(rng.choice(p.irritation_lines))
    elif value:
        if personalized:
            st.openness += 1.0
            parts.append("Oui… c'est vrai, vu comme ça.")
        else:
            st.openness -= 0.3 * sens
            parts.append(p.objections[st.objections_used % len(p.objections)])
            st.objections_used += 1
    elif not parts:
        # Affirmation neutre : le client relance sa demande
        parts.append(rng.choice(["Donc, pour la résiliation ?", "D'accord… et donc ?", "Et concrètement ?"]) if last_client else "Oui ?")
    return _close_turn(st, parts, p, agent_turns)


def _close_turn(st: SimState, parts: list[str], p: Persona, agent_turns: list[dict]) -> SimState:
    if len(agent_turns) >= _max_turns(st) and not st.finished:
        parts.append(p.end_lines["timeout"])
        return _finish(st, parts, "non conclu (durée)")
    st.openness = max(0.0, min(10.0, st.openness))
    st.irritation = max(0.0, min(10.0, st.irritation))
    st.turns.append({"speaker": CLIENT, "text": " ".join(dict.fromkeys(parts))})
    return st


def _finish(st: SimState, parts: list[str], outcome: str) -> SimState:
    st.turns.append({"speaker": CLIENT, "text": " ".join(dict.fromkeys(parts))})
    st.finished = True
    st.outcome = outcome
    return st


def end_by_agent(st: SimState) -> SimState:
    if not st.finished:
        st.finished = True
        st.outcome = "conservé" if st.proposal_accepted and PERSONAS[st.persona_key].retainable else (
            "sortie de qualité" if st.proposal_accepted else "non conclu")
    return st


def to_transcript(st: SimState) -> Transcript:
    utts = [Utterance(i, t["speaker"], t["text"]) for i, t in enumerate(st.turns)]
    return Transcript(utts, source="entrainement", speaker_attribution="explicite")


def next_difficulty(score: float, current: int) -> int:
    if score >= 75:
        return min(5, current + 1)
    if score < 40:
        return max(1, current - 1)
    return current


def evaluate_reply(client_line: str, agent_reply: str) -> tuple[int, list[str]]:
    """Évaluation rapide d'une réponse rejouée (« Rejouer les passages ratés »)."""
    score, comments = 0, []
    qs = extract_questions(0, agent_reply)
    kinds = {q.kind for q in qs}
    if behaviour(agent_reply, "acceptance"):
        return 5, ["Vous acceptez encore la résiliation sans explorer : c'est le réflexe à corriger en priorité."]
    if behaviour(agent_reply, "pressure"):
        return 10, ["Formulation sous pression : remplacez l'obligation par l'accompagnement."]
    if behaviour(agent_reply, "empathy") or behaviour(agent_reply, "reformulation") or lexical_overlap(agent_reply, client_line) >= 0.25:
        score += 35; comments.append("✅ Vous accueillez ce que dit le client.")
    else:
        comments.append("➖ Commencez par accueillir (empathie ou reformulation avec les mots du client).")
    if kinds & {"ouverte", "reformulation"}:
        score += 45; comments.append("✅ Question ouverte : le client va développer.")
    elif "information" in kinds:
        score += 25; comments.append("➖ Question d'information utile ; une question ouverte apporterait davantage.")
    elif "fermée orientée négativement" in kinds:
        comments.append("❌ Question orientée négativement : elle pousse au refus.")
    elif qs:
        score += 10; comments.append("➖ Question fermée : préférez « Comment… ? / Qu'est-ce que… ? ».")
    else:
        comments.append("➖ Terminez par une question pour garder le client actif.")
    if len(words(agent_reply)) <= 45:
        score += 20
    else:
        comments.append("➖ Réponse longue : visez 2 à 3 phrases.")
    return min(100, score), comments


# --------------------------------------------------------------------------- moteur IA

LLM_CLIENT_SYSTEM = """Tu joues un CLIENT au téléphone avec un conseiller d'une entreprise de télésurveillance résidentielle. Tu veux résilier à cause d'un déménagement.
Tu restes STRICTEMENT dans ton rôle de client : tu ne donnes jamais de conseil, d'évaluation ni de correction au conseiller.
Profil : {label}. {description}
Faits cachés (ne les révèle que si le conseiller pose une question pertinente, de préférence ouverte ; réponds brièvement aux questions fermées) :
{facts}
Comportement : niveau de difficulté {difficulty}/5. Plus c'est difficile, plus tu résistes. Si le conseiller fait preuve d'empathie et reformule, tu t'ouvres. S'il met la pression, tu t'agaces.
Tu acceptes une proposition seulement si le conseiller a découvert : {key_facts}. {retainable}
Tu n'inventes jamais de prix. Réponds en français oral, 1 à 3 phrases.
Réponds en JSON : {{"reply": "...", "end": true|false, "outcome": "conservé|résilié|non conclu|sortie de qualité|"}}"""


def reply_llm(st: SimState, agent_text: str, llm) -> SimState:
    from sales_coach.llm.factory import LLMError, Message

    p = PERSONAS[st.persona_key]
    st.turns.append({"speaker": AGENT, "text": agent_text.strip()})
    facts = "\n".join(f"- {k} : {v[0]}" for k, v in p.facts.items())
    system = LLM_CLIENT_SYSTEM.format(
        label=p.label, description=p.description, facts=facts, difficulty=st.difficulty, key_facts=", ".join(p.key_facts),
        retainable="" if p.retainable else "Tu ne restes pas client (départ définitif) mais tu peux accepter d'aider les repreneurs.",
    )
    msgs = [Message("system", system), Message("user", "(Le conseiller décroche le téléphone.)")] + [
        Message("assistant" if t["speaker"] == CLIENT else "user", t["text"]) for t in st.turns
    ]
    try:
        data = llm.chat_json(msgs, temperature=0.7, max_tokens=400)
        text = str(data.get("reply", "")).strip() or "…"
    except LLMError as exc:
        st.turns.pop()
        raise RuntimeError(f"Modèle IA indisponible : {exc}") from exc
    st.turns.append({"speaker": CLIENT, "text": text})
    if behaviour(agent_text, "proposal"):
        st.proposal_made = True
    if data.get("end"):
        st.finished = True
        st.outcome = str(data.get("outcome") or "non conclu")
        st.proposal_accepted = st.outcome in {"conservé", "sortie de qualité"}
    elif len([t for t in st.turns if t["speaker"] == AGENT]) >= _max_turns(st):
        st.finished, st.outcome = True, "non conclu (durée)"
    return st
