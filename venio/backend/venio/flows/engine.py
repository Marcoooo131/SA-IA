"""Moteur d'évaluation des parcours : conditions, étape suivante, validation, progression, résumé.

Le serveur recalcule toujours le chemin à partir des réponses : un client ne peut ni sauter
une question obligatoire, ni injecter une réponse à une question qui ne lui a pas été posée.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .schema import (
    END,
    AllCondition,
    AnyCondition,
    Condition,
    FieldCondition,
    FlowDefinition,
    NotCondition,
    Step,
    parse_date,
)

MAX_TEXT = 2000


class AnswerError(ValueError):
    def __init__(self, step_id: str, message: str):
        super().__init__(message)
        self.step_id = step_id


def is_answered(value: Any) -> bool:
    return value is not None and value != "" and value != []


def evaluate(cond: Condition, answers: dict[str, Any]) -> bool:
    if isinstance(cond, AllCondition):
        return all(evaluate(c, answers) for c in cond.all)
    if isinstance(cond, AnyCondition):
        return any(evaluate(c, answers) for c in cond.any)
    if isinstance(cond, NotCondition):
        return not evaluate(cond.not_, answers)
    assert isinstance(cond, FieldCondition)
    value = answers.get(cond.field)
    op, expected = cond.op, cond.value
    if op == "answered":
        return is_answered(value)
    if op == "not_answered":
        return not is_answered(value)
    if not is_answered(value):
        return False  # une question non répondue ne satisfait aucune comparaison
    try:
        if op == "eq":
            return value == expected
        if op == "neq":
            return value != expected
        if op == "in":
            return value in (expected or [])
        if op == "not_in":
            return value not in (expected or [])
        if op == "contains":
            return isinstance(value, list) and expected in value
        if op in ("gt", "gte", "lt", "lte"):
            a, b = float(value), float(expected)
            return {"gt": a > b, "gte": a >= b, "lt": a < b, "lte": a <= b}[op]
    except (TypeError, ValueError):
        return False
    return False


def next_step_id(defn: FlowDefinition, step_id: str, answers: dict[str, Any]) -> str:
    step = defn.step(step_id)
    for route in step.routes:
        if evaluate(route.when, answers):
            return route.goto
    if step.next:
        return step.next
    ids = [s.id for s in defn.steps]
    idx = ids.index(step_id)
    return ids[idx + 1] if idx + 1 < len(ids) else END


@dataclass
class PathState:
    visited: list[str]  # étapes du chemin déjà répondues (ou passées si facultatives)
    current: str | None  # prochaine étape à afficher ; None = qualification terminée
    estimated_total: int  # longueur estimée du parcours avec les réponses actuelles


def walk(defn: FlowDefinition, answers: dict[str, Any]) -> PathState:
    """Parcourt le graphe depuis la première étape en suivant les réponses.

    Une question facultative passée est enregistrée avec la valeur None : elle compte comme vue.
    """
    visited: list[str] = []
    current: str | None = None
    node = defn.steps[0].id
    guard = 0
    while node != END and guard <= len(defn.steps):
        guard += 1
        step = defn.step(node)
        answered = is_answered(answers.get(node))
        if not answered and not (not step.required and node in answers):
            current = node
            break
        visited.append(node)
        node = next_step_id(defn, node, answers)
    # Estimation du reste : on suit le chemin par défaut depuis l'étape courante.
    remaining = 0
    probe = current
    guard = 0
    while probe is not None and probe != END and guard <= len(defn.steps):
        guard += 1
        remaining += 1
        probe = next_step_id(defn, probe, answers)
    return PathState(visited=visited, current=current, estimated_total=len(visited) + remaining)


def validate_answer(step: Step, value: Any) -> Any:
    """Valide et normalise une réponse ; lève AnswerError avec un message affichable."""
    if not is_answered(value):
        if step.required:
            raise AnswerError(step.id, "Cette réponse est nécessaire.")
        return None
    t = step.type
    if t == "single_choice":
        if value not in {o.value for o in step.options}:
            raise AnswerError(step.id, "Choix invalide.")
        return value
    if t == "multi_choice":
        if not isinstance(value, list) or not value:
            raise AnswerError(step.id, "Sélectionnez au moins un choix.")
        allowed = {o.value for o in step.options}
        if any(v not in allowed for v in value):
            raise AnswerError(step.id, "Choix invalide.")
        return sorted(set(value), key=[o.value for o in step.options].index)
    if t == "yes_no":
        if not isinstance(value, bool):
            raise AnswerError(step.id, "Répondez par oui ou non.")
        return value
    if t in ("text", "long_text"):
        if not isinstance(value, str):
            raise AnswerError(step.id, "Texte attendu.")
        value = value.strip()
        limit = 200 if t == "text" else MAX_TEXT
        if len(value) > limit:
            raise AnswerError(step.id, f"{limit} caractères maximum.")
        if not value and step.required:
            raise AnswerError(step.id, "Cette réponse est nécessaire.")
        return value or None
    if t in ("number", "slider"):
        if isinstance(value, bool):
            raise AnswerError(step.id, "Nombre attendu.")
        try:
            num = float(value)
        except (TypeError, ValueError):
            raise AnswerError(step.id, "Nombre attendu.") from None
        if step.min is not None and num < step.min:
            raise AnswerError(step.id, f"Minimum : {step.min:g}.")
        if step.max is not None and num > step.max:
            raise AnswerError(step.id, f"Maximum : {step.max:g}.")
        return int(num) if num.is_integer() else num
    if t == "date":
        try:
            return parse_date(value).isoformat()
        except ValueError:
            raise AnswerError(step.id, "Date invalide.") from None
    if t == "photos":
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise AnswerError(step.id, "Fichiers invalides.")
        if len(value) > step.max_files:
            raise AnswerError(step.id, f"{step.max_files} fichiers maximum.")
        return value
    raise AnswerError(step.id, "Type de question inconnu.")


def resolve_service_key(defn: FlowDefinition, answers: dict[str, Any]) -> str:
    for rule in defn.service_rules:
        if rule.when is None or evaluate(rule.when, answers):
            return rule.service
    return defn.service_rules[-1].service  # inatteignable : la dernière règle est sans condition


def display_value(step: Step, value: Any) -> str:
    if not is_answered(value):
        return "—"
    if step.type == "single_choice":
        return next((o.label for o in step.options if o.value == value), str(value))
    if step.type == "multi_choice":
        labels = {o.value: o.label for o in step.options}
        return ", ".join(labels.get(v, v) for v in value)
    if step.type == "yes_no":
        return "Oui" if value else "Non"
    if step.type == "photos":
        return f"{len(value)} fichier(s)"
    if step.type in ("number", "slider") and step.unit:
        return f"{value:g} {step.unit}" if isinstance(value, float) else f"{value} {step.unit}"
    if step.type == "date":
        d = parse_date(value)
        return d.strftime("%d/%m/%Y")
    return str(value)


def summarize(defn: FlowDefinition, answers: dict[str, Any]) -> list[dict[str, Any]]:
    """Réponses du chemin effectivement suivi, dans l'ordre, avec libellés lisibles."""
    state = walk(defn, answers)
    out = []
    for sid in state.visited:
        step = defn.step(sid)
        out.append(
            {"step": sid, "type": step.type, "question": step.title,
             "value": answers.get(sid), "display": display_value(step, answers.get(sid))}
        )
    return out


def summary_text(items: list[dict[str, Any]]) -> str:
    return " · ".join(f"{i['question'].rstrip(' ?')} : {i['display']}" for i in items if i["display"] != "—")
