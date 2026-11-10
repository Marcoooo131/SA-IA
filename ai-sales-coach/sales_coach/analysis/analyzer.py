"""Moteur d'analyse commerciale « règles » : détecte, note et explique — toujours avec un extrait réel.

Principe anti-invention : chaque constat (Finding) cite le texte EXACT d'une réplique de la
transcription (vérifiable par `verify_report`). Aucune phrase n'est attribuée au commercial si elle
n'est pas dans la transcription. Les « meilleures formulations » sont explicitement des
recommandations du coach.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol

from sales_coach.analysis import catalog
from sales_coach.analysis.catalog import CRITERIA, CRITERIA_LABELS, ERRORS
from sales_coach.analysis.nlp import (
    AGENT_BEHAVIOURS,
    CLIENT_CUES,
    OBJECTIONS,
    Question,
    behaviour,
    detect_categories,
    extract_questions,
    filler_count,
    fold,
    has_any,
    lexical_overlap,
    repeated_phrases,
    sentences,
    shared_terms,
    talk_ratio,
    words,
)
from sales_coach.analysis.retention import SITUATIONS_BY_KEY, Situation, detect_situations, evaluate_checklist
from sales_coach.core.models import (
    AGENT,
    CLIENT,
    AnalysisReport,
    CriterionScore,
    Evidence,
    Finding,
    IdealExchange,
    MissedOpportunity,
    SourceRef,
    Transcript,
    Utterance,
)


class KnowledgeSearcher(Protocol):
    def search(self, query: str, scope: str | None = None, k: int = 3) -> list: ...


LEVELS = [(90, "Expert"), (75, "Avancé"), (60, "Confirmé"), (40, "En développement"), (0, "Débutant")]
QUALITY = [(85, "Excellent appel"), (70, "Bon appel, perfectible"), (55, "Appel moyen"), (40, "Appel insuffisant"), (0, "Appel à retravailler en priorité")]

OPENNESS = [r"\bpourquoi pas\b", r"\bca m'interesse\b", r"\bje veux bien\b", r"\bah bon\b", r"\bje ne savais pas\b", r"\bc'est possible\b",
            r"\bcomment (ca|cela) (marche|se passe|fonctionne)\b", r"\binteressant\b", r"\bd'accord,? (je|on) (garde|continue|prend|valide)\b",
            r"\bvous pouvez (m'envoyer|me rappeler|verifier)\b", r"\bje vais y reflechir\b", r"\bpourquoi pas\b", r"\bca me va\b", r"\bc'est une bonne idee\b",
            r"\bok pour\b", r"\bon (peut|pourrait) faire comme (ca|cela)\b", r"\bje garde\b", r"\bon garde\b"]

CUE_QUESTIONS = {
    "securite": "Vous parlez de {x} : qu'est-ce qui vous inquiète le plus à ce sujet ?",
    "famille": "Vous évoquez {x} : qu'est-ce qui compte le plus pour vous concernant leur sécurité ?",
    "absence": "Vous mentionnez {x} : comment se passe la surveillance de votre logement pendant ces périodes ?",
    "temporaire": "Vous dites « {x} » : comment voyez-vous la situation dans quelques mois ?",
    "satisfaction": "Vous dites être satisfait : qu'est-ce que vous appréciez le plus dans votre protection actuelle ?",
    "valeur": "Vous parlez de {x} : comment souhaitez-vous les protéger dans le nouveau logement ?",
    "maison": "Parlez-moi de cette configuration ({x}) : quels sont les points d'accès qui vous préoccupent ?",
}

CRITERION_ACTIONS = {
    "contact": "Soigner l'ouverture : présentation, remerciement, objectif de l'appel.",
    "decouverte": "Mener une vraie découverte : 3 questions ouvertes minimum et une reformulation avant toute proposition.",
    "raisons": "Explorer systématiquement le projet : où, quand, quel logement, propriétaire ou locataire, besoins de sécurité.",
    "argumentation": "Relier chaque argument à un besoin exprimé par le client, en reprenant ses mots.",
    "objections": "Traiter chaque objection : accueillir, explorer par une question, reformuler, puis répondre.",
    "proposition": "Présenter au moins une solution de continuité adaptée et documentée avant de conclure.",
    "conclusion": "Conclure par un récapitulatif, une prochaine étape datée et une validation de l'accord du client.",
}


@dataclass
class _Ctx:
    t: Transcript
    agent: list[Utterance]
    client: list[Utterance]
    questions: list[Question]
    situations: list[Situation]
    keys: list[str]


def _ev(u: Utterance, patterns: list[str] | None = None, prefer_question: bool = False) -> Evidence:
    """Extrait EXACT : la phrase qui a déclenché la détection (ou la réplique entière si courte)."""
    quote = u.text
    sents = sentences(u.text)
    if patterns:
        for s in sents:
            if has_any(s, patterns):
                quote = s
                break
    elif prefer_question:
        for s in sents:
            if s.endswith("?"):
                quote = s
                break
    if quote == u.text and len(words(u.text)) > 45 and sents:
        quote = sents[0]
    return Evidence(u.index, u.speaker, quote, u.timestamp)


def _prev(t: Transcript, idx: int, speaker: str) -> Utterance | None:
    for u in reversed(t.utterances[:idx]):
        if u.speaker == speaker:
            return u
    return None


def _next(t: Transcript, idx: int, speaker: str) -> Utterance | None:
    for u in t.utterances[idx + 1:]:
        if u.speaker == speaker:
            return u
    return None


def _make_finding(code: str, evidence: Evidence, keys: list[str], better: str | None = None, extra_why: str = "") -> Finding:
    e = ERRORS[code]
    return Finding(
        code=code,
        criterion=e.criterion,
        title=e.title,
        evidence=evidence,
        why_wrong=e.why_wrong + (f" {extra_why}" if extra_why else ""),
        should_understand=e.should_understand,
        should_say=e.action,
        better_phrasing=better or e.phrasing(keys),
        consequence=e.consequence,
        severity=e.severity,
    )


def _first_index(items, pred) -> int | None:
    for x in items:
        if pred(x):
            return x.index
    return None


# --------------------------------------------------------------------------- détecteurs


def _detect(ctx: _Ctx) -> tuple[list[Finding], dict]:
    t, keys = ctx.t, ctx.keys
    findings: list[Finding] = []
    info: dict = {}
    discovery_q = [q for q in ctx.questions if q.kind in {"ouverte", "information", "reformulation"}]
    open_q = [q for q in ctx.questions if q.kind == "ouverte"]
    closed_q = [q for q in ctx.questions if q.kind == "fermée"]
    leading = [q for q in ctx.questions if q.kind == "fermée orientée négativement"]

    first_proposal = _first_index(ctx.agent, lambda u: behaviour(u.text, "proposal"))
    first_accept = _first_index(ctx.agent, lambda u: behaviour(u.text, "acceptance"))
    info.update(first_proposal=first_proposal, first_accept=first_accept)

    # Acceptation rapide de la résiliation
    if first_accept is not None:
        before = [q for q in discovery_q if q.utterance_index < first_accept]
        proposal_before = first_proposal is not None and first_proposal < first_accept
        if len(before) < 2 and not proposal_before:
            u = t.utterances[first_accept]
            findings.append(_make_finding(
                "ACCEPTATION_RAPIDE", _ev(u, AGENT_BEHAVIOURS["acceptance"]), keys,
                extra_why=f"Seulement {len(before)} question(s) de découverte posée(s) avant d'engager la résiliation.",
            ))
            info["rapid_acceptance"] = True

    # Questions orientées négativement
    for q in leading[:3]:
        u = t.utterances[q.utterance_index]
        findings.append(_make_finding("QUESTION_ORIENTEE_NEGATIVE", Evidence(u.index, AGENT, q.text, u.timestamp), keys))

    # Questions fermées inutiles (en découverte, quand les ouvertes manquent)
    total_disc = len(open_q) + len(closed_q)
    if closed_q and total_disc and len(open_q) / total_disc < 0.5:
        limit = first_proposal if first_proposal is not None else (first_accept if first_accept is not None else 10**9)
        flagged = [q for q in closed_q if q.utterance_index <= limit and len(words(q.text)) > 2][:3]
        for q in flagged:
            u = t.utterances[q.utterance_index]
            findings.append(_make_finding("QUESTION_FERMEE_INUTILE", Evidence(u.index, AGENT, q.text, u.timestamp), keys,
                                          better=_open_version(q.text, keys)))

    # Pivot : première réplique du commercial après l'annonce du client
    announce = next((u for u in ctx.client if detect_categories(u.text, OBJECTIONS) or has_any(u.text, SITUATIONS_BY_KEY["demenagement"].client_patterns)), None)
    pivot = _next(t, announce.index, AGENT) if announce else None
    info["announce"] = announce.index if announce else None

    if not open_q and pivot is not None:
        findings.append(_make_finding("DECOUVERTE_ABSENTE", _ev(pivot), keys))

    # Raison du déménagement non explorée
    if "demenagement" in keys and pivot is not None:
        joined = " ".join(u.text for u in ctx.agent)
        if not has_any(joined, AGENT_BEHAVIOURS["move_reason"]):
            findings.append(_make_finding("RAISON_NON_EXPLOREE", _ev(pivot), keys))

    # Reformulation absente après une explication longue
    has_reformulation = any(q.kind == "reformulation" for q in ctx.questions) or any(behaviour(u.text, "reformulation") for u in ctx.agent)
    if not has_reformulation:
        long_client = sorted([u for u in ctx.client if len(words(u.text)) >= 18], key=lambda u: -len(words(u.text)))
        if long_client:
            lc = long_client[0]
            reply = _next(t, lc.index, AGENT)
            if reply is not None:
                findings.append(_make_finding("PAS_DE_REFORMULATION", _ev(reply), keys, better=_reformulation_for(lc)))

    # Objections : accueil, exploration, pression
    objection_quality: list[float] = []
    handled_ids = set()
    for cu in ctx.client:
        cats = detect_categories(cu.text, OBJECTIONS)
        if not cats:
            continue
        reply = _next(t, cu.index, AGENT)
        if reply is None:
            continue
        r = reply.text
        q_in_reply = [q for q in ctx.questions if q.utterance_index == reply.index]
        empathy = behaviour(r, "empathy") or behaviour(r, "reformulation") or lexical_overlap(r, cu.text) >= 0.3
        explored = any(q.kind in {"ouverte", "information", "reformulation"} for q in q_in_reply)
        argued = behaviour(r, "value") or behaviour(r, "proposal")
        pressure = behaviour(r, "pressure")
        accepted = behaviour(r, "acceptance")
        quality = 0.0 if pressure else (0.3 * empathy + 0.4 * explored + 0.2 * argued + 0.1)
        if accepted and not explored:
            quality = min(quality, 0.15)
        objection_quality.append(quality)
        if reply.index in handled_ids:
            continue
        cat_label = ", ".join(OBJECTIONS[c]["label"] for c in cats)
        obj_keys = _keys_for_objection(cats, keys)
        if pressure:
            findings.append(_make_finding("PRESSION", _ev(reply, AGENT_BEHAVIOURS["pressure"]), obj_keys))
            handled_ids.add(reply.index)
        elif accepted:
            continue  # déjà couvert par ACCEPTATION_RAPIDE si applicable
        elif not empathy and not explored:
            findings.append(_make_finding("OBJECTION_IGNOREE", _ev(reply), obj_keys, extra_why=f"Objection du client : {cat_label}."))
            handled_ids.add(reply.index)
        elif argued and not explored:
            findings.append(_make_finding("OBJECTION_SANS_EXPLORATION", _ev(reply), obj_keys, extra_why=f"Objection du client : {cat_label}."))
            handled_ids.add(reply.index)
    info["objection_quality"] = objection_quality

    # Pression hors objection
    for u in ctx.agent:
        if u.index not in handled_ids and behaviour(u.text, "pressure"):
            findings.append(_make_finding("PRESSION", _ev(u, AGENT_BEHAVIOURS["pressure"]), keys))
            handled_ids.add(u.index)
            break

    # Argumentation générique
    value_turns = [u for u in ctx.agent if _is_value_turn(u)]
    personalized = [u for u in value_turns if _personalized(t, u)]
    info["value_turns"] = len(value_turns)
    info["personalized_turns"] = len(personalized)
    if value_turns and not personalized:
        findings.append(_make_finding("ARGUMENT_GENERIQUE", _ev(value_turns[0], AGENT_BEHAVIOURS["value"]), keys))

    # Monologue
    monologues = [u for u in ctx.agent if len(words(u.text)) >= 70 and "?" not in u.text]
    info["monologues"] = len(monologues)
    for u in monologues[:1]:
        findings.append(_make_finding("MONOLOGUE", _ev(u), keys))

    # Proposition prématurée / absente
    first_disc = min((q.utterance_index for q in discovery_q), default=None)
    if first_proposal is not None and (first_disc is None or first_proposal < first_disc):
        client_before = [u for u in ctx.client if u.index < first_proposal]
        if len(client_before) <= 1:
            findings.append(_make_finding("PROPOSITION_PREMATUREE", _ev(t.utterances[first_proposal], AGENT_BEHAVIOURS["proposal"]), keys))
    if first_proposal is None and ctx.agent:
        anchor = t.utterances[first_accept] if first_accept is not None else ctx.agent[-1]
        sources_hint = " ".join(f"Piste à vérifier : {p}." for s in ctx.situations for p in s.pistes[:1])
        f = _make_finding("PAS_DE_PROPOSITION", _ev(anchor), keys, extra_why=sources_hint)
        if "definitif" in keys or "etranger" in keys:
            f.severity = 2
        findings.append(f)

    # Conclusion
    tail = ctx.agent[-4:]
    recap = any(behaviour(u.text, "closing_recap") for u in tail)
    nxt = any(behaviour(u.text, "next_step") for u in tail)
    info.update(recap=recap, next_step=nxt)
    if ctx.agent and not recap and not nxt:
        findings.append(_make_finding("CONCLUSION_SANS_ENGAGEMENT", _ev(ctx.agent[-1]), keys))

    # Ouverture
    head = ctx.agent[:2]
    if head and not (any(behaviour(u.text, "greeting") for u in head) and any(behaviour(u.text, "presentation") for u in head)):
        findings.append(_make_finding("OUVERTURE_IMPERSONNELLE", _ev(head[0]), keys))

    # Vocabulaire négatif
    neg = [u for u in ctx.agent if behaviour(u.text, "negative_words")]
    if len(neg) >= 2:
        findings.append(_make_finding("VOCABULAIRE_NEGATIF", _ev(neg[0], AGENT_BEHAVIOURS["negative_words"]), keys))

    return findings, info


def _keys_for_objection(cats: list[str], keys: list[str]) -> list[str]:
    mapping = {"budget": "budget", "deja_equipe": "deja_equipe", "plus_besoin": "plus_alarme", "insatisfaction": "insatisfaction", "definitif": "definitif"}
    return [mapping[c] for c in cats if c in mapping] + keys


def _personalized(t: Transcript, u: Utterance) -> bool:
    if has_any(u.text, [r"\bvous m'avez dit\b", r"\bvous me disiez\b", r"\bcomme vous (l'avez dit|le disiez|me l'avez dit)\b", r"\bvous avez mentionne\b", r"\bvous parliez de\b", r"\bpuisque vous\b"]):
        return True
    prior_client = " ".join(c.text for c in t.utterances[: u.index] if c.speaker == CLIENT)
    return shared_terms(u.text, prior_client) >= 2 if prior_client else False


def _is_value_turn(u: Utterance) -> bool:
    """Réplique qui VALORISE le service (affirmation), pas une simple question sur la sécurité."""
    return any(behaviour(s, "value") and not s.strip().endswith("?") for s in sentences(u.text))


def _open_version(question: str, keys: list[str]) -> str:
    f = fold(question)
    if has_any(f, [r"maison|appartement|logement"]):
        return "Parlez-moi de votre nouveau logement : comment se présente-t-il ?"
    if has_any(f, [r"satisfait|content"]):
        return "Comment s'est passée votre expérience avec votre protection jusqu'ici ?"
    if has_any(f, [r"alarme|equipe|systeme"]):
        return "Qu'est-ce que vous savez de l'équipement déjà présent dans le nouveau logement ?"
    if has_any(f, [r"budget|cher|prix|payer"]):
        return "Qu'est-ce qui pèse le plus dans votre budget en ce moment ?"
    if has_any(f, [r"securite|cambriol|quartier"]):
        return "Comment voyez-vous la sécurité dans votre nouveau quartier ?"
    if has_any(f, [r"bientot|date|quand|demenag"]):
        return "Comment s'organise votre déménagement, et à quelle échéance ?"
    return ERRORS["QUESTION_FERMEE_INUTILE"].phrasing(keys)


def _reformulation_for(client_u: Utterance) -> str:
    sents = sentences(client_u.text)
    best = max(sents, key=lambda s: len(words(s))) if sents else client_u.text
    w = best.split()
    excerpt = " ".join(w[:22]) + ("…" if len(w) > 22 else "")
    return f"Si je comprends bien, vous me dites : « {excerpt} ». C'est bien ça ? Qu'est-ce qui compte le plus pour vous dans ce contexte ?"


# --------------------------------------------------------------------------- notation


def _score(ctx: _Ctx, findings: list[Finding], info: dict) -> list[CriterionScore]:
    t = ctx.t
    agent = ctx.agent
    by_crit: dict[str, list[Finding]] = {}
    for f in findings:
        by_crit.setdefault(f.criterion, []).append(f)
    open_q = [q for q in ctx.questions if q.kind == "ouverte"]
    info_q = [q for q in ctx.questions if q.kind == "information"]
    closed_q = [q for q in ctx.questions if q.kind == "fermée"]
    leading = [q for q in ctx.questions if q.kind == "fermée orientée négativement"]
    reformulations = [q for q in ctx.questions if q.kind == "reformulation"] or [u for u in agent if behaviour(u.text, "reformulation")]
    scores: dict[str, CriterionScore] = {k: CriterionScore(k, label, m, 0.0) for k, label, m in CRITERIA}

    # 1. Contact
    c = scores["contact"]
    head = agent[:2]
    if any(behaviour(u.text, "greeting") for u in head):
        c.score += 3; c.positives.append("Salutation en ouverture.")
        c.evidence.append(_ev(next(u for u in head if behaviour(u.text, "greeting")), AGENT_BEHAVIOURS["greeting"]))
    if any(behaviour(u.text, "presentation") for u in head):
        c.score += 2; c.positives.append("Présentation (nom / service).")
    if any(behaviour(u.text, "personal_check") or behaviour(u.text, "empathy") for u in agent[:3]):
        c.score += 2; c.positives.append("Marque d'attention ou d'empathie dès le début.")
    if any(behaviour(u.text, "agenda") for u in agent[:4]):
        c.score += 1; c.positives.append("Objectif de l'échange annoncé.")
    if not any(behaviour(u.text, "pressure") or behaviour(u.text, "negative_words") for u in agent[:3]):
        c.score += 2; c.positives.append("Ton sans formulation négative en ouverture.")

    # 2. Découverte
    d = scores["decouverte"]
    d.score += min(len(open_q), 4) * 2
    if open_q:
        d.positives.append(f"{len(open_q)} question(s) ouverte(s) posée(s).")
        d.evidence.append(Evidence(open_q[0].utterance_index, AGENT, open_q[0].text, t.utterances[open_q[0].utterance_index].timestamp))
    asked = len(open_q) + len(info_q) + len(closed_q) + len(leading)
    if asked:
        d.score += 5 * (len(open_q) + 0.5 * len(info_q)) / asked
    if reformulations:
        d.score += 4; d.positives.append("Reformulation utilisée (écoute active).")
    pivot_end = min([i for i in (info.get("first_proposal"), info.get("first_accept")) if i is not None], default=None)
    if open_q and (pivot_end is None or open_q[0].utterance_index < pivot_end):
        d.score += 3; d.positives.append("Découverte menée avant de proposer ou de conclure.")
    d.score = max(0.0, d.score - 3 * len(leading))

    # 3. Raisons du déménagement
    r = scores["raisons"]
    move = SITUATIONS_BY_KEY["demenagement"]
    if "demenagement" in ctx.keys or any(k in ctx.keys for k in ("proprietaire", "locataire", "autre_region", "etranger", "deja_equipe", "repreneur")):
        rows = evaluate_checklist(move, [u.text for u in agent], [u.text for u in ctx.client])
        chk = {x["item"]: x["covered"] for x in rows}
        known = {x["item"]: x["known_from_client"] for x in rows}
        weights = {"Raison du déménagement": 5, "Destination / nouveau logement": 3, "Date du déménagement": 2, "Statut (propriétaire / locataire)": 2}
        for item, w in weights.items():
            if chk.get(item):
                r.score += w; r.positives.append(f"{item} : exploré(e).")
            elif known.get(item):
                r.score += w / 2; r.positives.append(f"{item} : donné(e) spontanément par le client (non questionné).")
        specific = [s for s in ctx.situations if s.key != "demenagement"]
        if specific:
            items = [x for s in specific for x in evaluate_checklist(s, [u.text for u in agent])]
            r.score += 3 * (sum(x["covered"] for x in items) / len(items))
        elif chk.get("Besoins de sécurité dans le nouveau logement"):
            r.score += 3
    else:
        r.evaluated = False
        r.errors.append("Aucun déménagement détecté dans les propos du client : critère non évaluable.")

    # 4. Argumentation
    a = scores["argumentation"]
    vt = info.get("value_turns", 0)
    a.score += min(vt, 3) * 2
    if vt:
        a.positives.append(f"Valorisation du service dans {vt} réplique(s).")
    if info.get("personalized_turns"):
        a.score += 5; a.positives.append("Argument relié aux propos du client.")
    value_with_q = [u for u in agent if _is_value_turn(u) and "?" in u.text]
    if value_with_q:
        a.score += 2; a.positives.append("Vérification de l'adhésion après l'argument.")
    if not info.get("monologues") and vt:
        a.score += 2
    if not vt and not any(behaviour(u.text, "proposal") for u in agent):
        a.errors.append("Le service n'a jamais été valorisé.")

    # 5. Objections
    o = scores["objections"]
    oq = info.get("objection_quality", [])
    if oq:
        o.score = 20 * sum(oq) / len(oq)
        if info.get("rapid_acceptance"):
            o.score = min(o.score, 4)
        good = sum(1 for x in oq if x >= 0.7)
        if good:
            o.positives.append(f"{good} objection(s) sur {len(oq)} traitée(s) avec accueil et exploration.")
    else:
        o.evaluated = False
        o.errors.append("Aucune objection explicite détectée : critère non évaluable sur cet appel.")

    # 6. Proposition
    p = scores["proposition"]
    fp = info.get("first_proposal")
    if fp is not None:
        p.score += 4; p.positives.append("Une solution de rétention a été proposée.")
        p.evidence.append(_ev(t.utterances[fp], AGENT_BEHAVIOURS["proposal"]))
        if open_q and open_q[0].utterance_index < fp:
            p.score += 2; p.positives.append("Proposition faite après la découverte.")
        adapted = {
            "demenagement": [r"\btransfer", r"\bnouvelle adresse\b", r"\breinstall", r"\bsuivre\b"],
            "autre_region": [r"\btransfer", r"\bnouvelle adresse\b", r"\bcouverture\b", r"\bcontinuite\b"],
            "repreneur": [r"\brepreneur\b", r"\breprise\b", r"\bnouveaux occupants\b"],
            "insatisfaction": [r"\btechnicien\b", r"\bresoudre\b", r"\bcorriger\b", r"\bdiagnostic\b"],
            "budget": [r"\badapt", r"\bformule\b", r"\boption\b", r"\bpossibilites\b"],
            "deja_equipe": [r"\bcompar", r"\breprise\b", r"\btelesurveill"],
            "proprietaire": [r"\bnouvelle (maison|adresse)\b", r"\binstall"],
        }
        agent_after = " ".join(u.text for u in agent if u.index >= fp)
        if any(has_any(agent_after, adapted[k]) for k in ctx.keys if k in adapted):
            p.score += 2; p.positives.append("Solution adaptée à la situation du client.")
        if any("?" in u.text for u in agent if fp <= u.index <= fp + 2):
            p.score += 2; p.positives.append("Avis du client sollicité sur la proposition.")
    elif "definitif" in ctx.keys and any(has_any(u.text, [r"\bsi (un jour|a l'avenir|vous changez)\b", r"\bn'hesitez pas\b"]) for u in agent):
        p.score += 3; p.positives.append("Porte laissée ouverte face à une décision ferme.")

    # 7. Conclusion
    cc = scores["conclusion"]
    tail = agent[-4:]
    if info.get("recap"):
        cc.score += 3; cc.positives.append("Récapitulatif en fin d'appel.")
    if info.get("next_step"):
        cc.score += 3; cc.positives.append("Prochaine étape annoncée.")
    if any(behaviour(u.text, "commitment_check") for u in tail):
        cc.score += 2; cc.positives.append("Accord du client vérifié.")
    if any(behaviour(u.text, "polite_close") for u in tail):
        cc.score += 2; cc.positives.append("Clôture courtoise.")

    # Erreurs, preuves, conséquences et corrections par critère
    for key, sc in scores.items():
        sc.score = round(min(sc.score, sc.max_points), 1)
        for f in by_crit.get(key, []):
            sc.errors.append(f"{f.title} ({f.evidence.label()})")
            if len(sc.evidence) < 4:
                sc.evidence.append(f.evidence)
        worst = sorted(by_crit.get(key, []), key=lambda f: -f.severity)
        if worst:
            sc.consequences = worst[0].consequence
            sc.correction = worst[0].should_say
        elif sc.evaluated and sc.ratio < 0.7:
            sc.correction = CRITERION_ACTIONS[key]
            sc.consequences = "Critère partiellement maîtrisé : des points attendus n'ont pas été observés dans l'appel."
        if sc.evaluated and sc.ratio < 0.5 and not sc.errors:
            sc.errors.append("Éléments attendus non observés dans la conversation.")
    return [scores[k] for k, _, _ in CRITERIA]


# --------------------------------------------------------------------------- opportunités, idéal, plan


def _missed(ctx: _Ctx) -> tuple[list[MissedOpportunity], list[dict]]:
    t = ctx.t
    agent_texts = [u.text for u in ctx.agent]
    out: list[MissedOpportunity] = []
    checklist_rows: list[dict] = []
    for s in ctx.situations:
        anchor = next((u for u in ctx.client if has_any(u.text, s.client_patterns)), None)
        rows = evaluate_checklist(s, agent_texts, [u.text for u in ctx.client])
        checklist_rows.extend({**row, "situation_key": s.key} for row in rows)
        for item, row in zip(s.checklist, rows):
            if not row["covered"] and not row["known_from_client"]:
                out.append(MissedOpportunity(
                    code=f"{s.key}:{item.id}",
                    title=f"{s.label} — {item.label} non exploré(e)",
                    description=s.reasoning,
                    suggested_question=item.question,
                    evidence=_ev(anchor, s.client_patterns) if anchor else None,
                ))
    for cu in ctx.client:
        for cue in detect_categories(cu.text, CLIENT_CUES):
            reply = _next(t, cu.index, AGENT)
            if reply is None:
                continue
            followed = lexical_overlap(reply.text, cu.text) >= 0.15 or has_any(reply.text, CLIENT_CUES[cue]["patterns"])
            if followed:
                continue
            ev = _ev(cu, CLIENT_CUES[cue]["patterns"])
            x = next((m.group(0) for p in CLIENT_CUES[cue]["patterns"] if (m := re.search(p, fold(ev.quote)))), "ce point")
            out.append(MissedOpportunity(
                code=f"signal:{cue}",
                title=f"Signal client non exploité : {CLIENT_CUES[cue]['label']}",
                description="Le client a donné une information exploitable que le commercial n'a pas reprise dans sa réponse.",
                suggested_question=CUE_QUESTIONS[cue].format(x=x),
                evidence=ev,
            ))
    # Dédoublonnage et priorisation : signaux client d'abord, puis checklist
    seen, uniq = set(), []
    for m in sorted(out, key=lambda m: (not m.code.startswith("signal:"), m.code)):
        if m.code not in seen:
            seen.add(m.code)
            uniq.append(m)
    return uniq[:10], checklist_rows


def _ideal(ctx: _Ctx, findings: list[Finding]) -> list[IdealExchange]:
    out, used = [], set()
    for f in sorted(findings, key=lambda f: (-f.severity, f.evidence.utterance_index)):
        if f.evidence.utterance_index in used:
            continue
        used.add(f.evidence.utterance_index)
        prev = _prev(ctx.t, f.evidence.utterance_index, CLIENT)
        out.append(IdealExchange(
            client_line=_ev(prev) if prev else None,
            agent_line=f.evidence,
            coach_comment=f"{f.title}. {f.why_wrong}",
            better_response=f.better_phrasing,
        ))
        if len(out) >= 6:
            break
    return sorted(out, key=lambda x: x.agent_line.utterance_index)


def _plan(findings: list[Finding], criteria: list[CriterionScore]) -> list[str]:
    weight: dict[str, int] = {}
    for f in findings:
        weight[f.code] = weight.get(f.code, 0) + f.severity
    plan = []
    for code, _ in sorted(weight.items(), key=lambda kv: -kv[1]):
        action = ERRORS[code].action
        if action not in plan:
            plan.append(action)
        if len(plan) == 3:
            return plan
    for c in sorted([c for c in criteria if c.evaluated], key=lambda c: c.ratio):
        act = CRITERION_ACTIONS[c.key]
        if act not in plan:
            plan.append(act)
        if len(plan) == 3:
            break
    return plan


def _retention_potential(ctx: _Ctx) -> tuple[str, str]:
    client_text = " ".join(u.text for u in ctx.client)
    score, reasons = 50, []
    opens = sum(1 for p in OPENNESS if has_any(client_text, [p]))
    if opens:
        score += min(opens, 3) * 12
        reasons.append(f"{opens} signal(aux) d'ouverture du client")
    if "definitif" in ctx.keys:
        score -= 25; reasons.append("décision présentée comme définitive")
    if "etranger" in ctx.keys:
        score -= 20; reasons.append("départ à l'étranger")
    if has_any(client_text, [r"\bje ne reviendrai (plus )?jamais\b", r"\bplus jamais\b", r"\bjamais chez vous\b", r"\bje vais (porter plainte|faire une reclamation)\b"]):
        score -= 25; reasons.append("rupture relationnelle exprimée")
    if "insatisfaction" in ctx.keys:
        score -= 10; reasons.append("insatisfaction exprimée")
    for k in ("autre_region", "proprietaire", "repreneur", "demenagement"):
        if k in ctx.keys and "etranger" not in ctx.keys:
            score += 8; reasons.append("déménagement en France : continuité envisageable")
            break
    if "deja_equipe" in ctx.keys:
        score -= 5; reasons.append("logement déjà équipé")
    label = "Élevé" if score >= 65 else ("Moyen" if score >= 40 else "Faible")
    return label, (", ".join(reasons) or "peu de signaux exploitables")


def _stages(ctx: _Ctx) -> list[dict]:
    tags = []
    current = "Ouverture"
    for u in ctx.t.utterances:
        if u.speaker == AGENT:
            if behaviour(u.text, "acceptance") or (u.index >= len(ctx.t.utterances) - 3 and (behaviour(u.text, "polite_close") or behaviour(u.text, "closing_recap") or behaviour(u.text, "next_step"))):
                current = "Conclusion"
            elif behaviour(u.text, "proposal"):
                current = "Proposition"
            elif any(q.utterance_index == u.index and q.kind in {"ouverte", "information", "reformulation", "fermée"} for q in ctx.questions) and current in {"Ouverture", "Découverte", "Objections"}:
                current = "Découverte" if current != "Objections" or "?" in u.text else current
            elif behaviour(u.text, "value"):
                current = "Argumentation"
        else:
            cats = [c for c in detect_categories(u.text, OBJECTIONS) if c != "resiliation"]
            if cats and current not in {"Ouverture"}:
                current = "Objections"
        tags.append(current)
    segments = []
    for u, tag in zip(ctx.t.utterances, tags):
        if segments and segments[-1]["stage"] == tag:
            segments[-1]["end"] = u.index
            segments[-1]["end_ts"] = u.timestamp
        else:
            segments.append({"stage": tag, "start": u.index, "end": u.index, "start_ts": u.timestamp, "end_ts": u.timestamp})
    return segments


def _company_sources(ctx: _Ctx, kb: KnowledgeSearcher | None) -> tuple[list[SourceRef], list[str]]:
    if kb is None:
        return [], ["Base documentaire non consultée : les pistes de solution restent à vérifier dans la documentation métier."]
    refs: list[SourceRef] = []
    seen = set()
    for s in ctx.situations or [SITUATIONS_BY_KEY["demenagement"]]:
        try:
            hits = kb.search(s.kb_query, scope="entreprise", k=2)
        except Exception as exc:  # la base peut être vide ou indisponible
            return [], [f"Base documentaire indisponible : {exc}"]
        for h in hits:
            key = (h.title, h.chunk_index)
            if key in seen or h.score < getattr(kb, "min_score", 0.15):
                continue
            seen.add(key)
            refs.append(SourceRef(title=h.title, source=h.source, url=h.url, scope="entreprise", excerpt=h.text[:400]))
    warnings = []
    if not refs:
        warnings.append("Aucun document « entreprise » pertinent trouvé : aucune offre, aucun tarif ni aucune condition ne doit être promis sans vérification.")
    return refs, warnings


# --------------------------------------------------------------------------- point d'entrée


def analyze(transcript: Transcript, kb: KnowledgeSearcher | None = None) -> AnalysisReport:
    agent = transcript.agent_turns()
    client = transcript.client_turns()
    if not agent or not client:
        raise ValueError("La transcription doit contenir au moins une réplique COMMERCIAL et une réplique CLIENT (attribuez les locuteurs).")
    questions = [q for u in agent for q in extract_questions(u.index, u.text)]
    situations = detect_situations([u.text for u in client])
    ctx = _Ctx(transcript, agent, client, questions, situations, [s.key for s in situations])

    findings, info = _detect(ctx)
    criteria = _score(ctx, findings, info)
    evaluated = [c for c in criteria if c.evaluated]
    total = round(100 * sum(c.score for c in evaluated) / sum(c.max_points for c in evaluated), 1) if evaluated else 0.0
    level = next(label for th, label in LEVELS if total >= th)
    quality = next(label for th, label in QUALITY if total >= th)
    potential, why = _retention_potential(ctx)
    missed, checklist_rows = _missed(ctx)
    sources, src_warn = _company_sources(ctx, kb)

    kinds = {}
    for q in questions:
        kinds[q.kind] = kinds.get(q.kind, 0) + 1
    objections_found: dict[str, int] = {}
    for u in client:
        for c in detect_categories(u.text, OBJECTIONS):
            objections_found[OBJECTIONS[c]["label"]] = objections_found.get(OBJECTIONS[c]["label"], 0) + 1
    stats = {
        "utterances": len(transcript.utterances),
        "agent_turns": len(agent),
        "client_turns": len(client),
        "agent_words": sum(len(words(u.text)) for u in agent),
        "client_words": sum(len(words(u.text)) for u in client),
        "talk_ratio_agent": round(talk_ratio([u.text for u in agent], [u.text for u in client]), 2),
        "questions": kinds,
        "questions_detail": [{"index": q.utterance_index, "text": q.text, "kind": q.kind} for q in questions],
        "objections": objections_found,
        "fillers": filler_count([u.text for u in agent]),
        "repetitions": repeated_phrases([u.text for u in agent]),
        "retention_potential_reasons": why,
        "audio": {k: v for k, v in transcript.audio_metrics.items() if k != "raw_labels"},
    }
    if not evaluated or len(evaluated) < len(criteria):
        ne = [c.label for c in criteria if not c.evaluated]
        warn_ne = [f"Critère(s) non évaluable(s) sur cet appel : {', '.join(ne)}. La note est ramenée sur 100 à partir des critères observables."] if ne else []
    else:
        warn_ne = []
    warnings = list(transcript.warnings) + warn_ne + src_warn
    if transcript.speaker_attribution not in {"explicite", "attribuée manuellement"}:
        warnings.append(f"Attribution des locuteurs : {transcript.speaker_attribution}. Vérifiez-la : une erreur d'attribution fausse l'analyse.")
    warnings.append("Potentiel de rétention : estimation qualitative fondée sur les propos du client, et non un résultat commercial.")

    return AnalysisReport(
        total_score=total,
        level=level,
        retention_potential=potential,
        quality_label=quality,
        situations=[s.label for s in situations],
        criteria=criteria,
        findings=sorted(findings, key=lambda f: (f.evidence.utterance_index, -f.severity)),
        missed_opportunities=missed,
        ideal_conversation=_ideal(ctx, findings),
        improvement_plan=_plan(findings, criteria),
        stats=stats,
        stages=_stages(ctx),
        retention_checklist=checklist_rows,
        company_sources=sources,
        engine="règles",
        warnings=warnings,
    )


def verify_report(report: AnalysisReport, transcript: Transcript) -> list[str]:
    """Contrôle anti-invention : toute citation doit exister mot pour mot dans la réplique citée."""
    problems = []

    def check(ev: Evidence | None, where: str):
        if ev is None:
            return
        if not (0 <= ev.utterance_index < len(transcript.utterances)):
            problems.append(f"{where} : réplique #{ev.utterance_index + 1} inexistante")
            return
        u = transcript.utterances[ev.utterance_index]
        if ev.quote not in u.text:
            problems.append(f"{where} : citation introuvable dans la réplique #{ev.utterance_index + 1}")
        if ev.speaker != u.speaker:
            problems.append(f"{where} : locuteur incorrect pour la réplique #{ev.utterance_index + 1}")

    for f in report.findings:
        check(f.evidence, f"Erreur {f.code}")
    for m in report.missed_opportunities:
        check(m.evidence, f"Opportunité {m.code}")
    for x in report.ideal_conversation:
        check(x.agent_line, "Conversation idéale")
        check(x.client_line, "Conversation idéale (client)")
    for c in report.criteria:
        for e in c.evidence:
            check(e, f"Critère {c.key}")
    return problems


__all__ = ["analyze", "verify_report", "catalog"]
