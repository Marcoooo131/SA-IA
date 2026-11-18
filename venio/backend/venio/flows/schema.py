"""Définition d'un parcours de qualification (stockée en JSON dans flow_version.definition).

Un parcours est une suite d'étapes (une question par écran). Chaque étape peut rediriger
vers une autre selon les réponses déjà données (`routes`). Les règles de prestation
(`service_rules`) choisissent la prestation réservée en fonction des réponses.
La fin du parcours (adresse, créneau, coordonnées, récapitulatif) est gérée par la plateforme.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

END = "@end"
ID_PATTERN = r"^[a-z][a-z0-9_]{0,39}$"

StepType = Literal[
    "single_choice",  # cartes / boutons, une réponse
    "multi_choice",  # plusieurs réponses
    "yes_no",
    "text",
    "long_text",
    "number",
    "slider",
    "date",
    "photos",  # fichiers déposés (ids)
]
CHOICE_TYPES = {"single_choice", "multi_choice"}

Op = Literal["eq", "neq", "in", "not_in", "contains", "gt", "gte", "lt", "lte", "answered", "not_answered"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class FieldCondition(_Strict):
    field: str = Field(pattern=ID_PATTERN)
    op: Op
    value: Any = None


class AllCondition(_Strict):
    all: list["Condition"] = Field(min_length=1)


class AnyCondition(_Strict):
    any: list["Condition"] = Field(min_length=1)


class NotCondition(_Strict):
    not_: "Condition" = Field(alias="not")
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


Condition = Union[FieldCondition, AllCondition, AnyCondition, NotCondition]
AllCondition.model_rebuild()
AnyCondition.model_rebuild()
NotCondition.model_rebuild()


class Option(_Strict):
    value: str = Field(pattern=r"^[a-z0-9_]{1,40}$")
    label: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=160)
    # Nom d'icône au trait (ex. "bath", catalogue : web/src/lib/icons.tsx). Les emojis des anciennes versions
    # restent acceptés et sont convertis à l'affichage.
    icon: str | None = Field(default=None, max_length=32)


class Route(_Strict):
    when: Condition
    goto: str


class Step(_Strict):
    id: str = Field(pattern=ID_PATTERN)
    type: StepType
    title: str = Field(min_length=1, max_length=160)
    help: str | None = Field(default=None, max_length=300)
    required: bool = True
    options: list[Option] = Field(default_factory=list)
    min: float | None = None
    max: float | None = None
    step: float | None = None
    unit: str | None = Field(default=None, max_length=12)
    placeholder: str | None = Field(default=None, max_length=80)
    max_files: int = Field(default=5, ge=1, le=10)
    routes: list[Route] = Field(default_factory=list)
    next: str | None = None

    @model_validator(mode="after")
    def _check(self) -> "Step":
        if self.type in CHOICE_TYPES:
            if len(self.options) < 2:
                raise ValueError(f"étape {self.id} : au moins 2 choix")
            values = [o.value for o in self.options]
            if len(set(values)) != len(values):
                raise ValueError(f"étape {self.id} : valeurs de choix en double")
        elif self.options:
            raise ValueError(f"étape {self.id} : les choix ne s'appliquent qu'aux questions à choix")
        if self.type == "slider" and (self.min is None or self.max is None):
            raise ValueError(f"étape {self.id} : un curseur exige min et max")
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError(f"étape {self.id} : min > max")
        return self


class ServiceRule(_Strict):
    when: Condition | None = None
    service: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")


class FlowDefinition(_Strict):
    version: Literal[1] = 1
    intro: str | None = Field(default=None, max_length=300)
    steps: list[Step] = Field(min_length=1, max_length=40)
    service_rules: list[ServiceRule] = Field(min_length=1)

    @field_validator("steps")
    @classmethod
    def _unique_ids(cls, steps: list[Step]) -> list[Step]:
        ids = [s.id for s in steps]
        if len(set(ids)) != len(ids):
            raise ValueError("identifiants d'étape en double")
        return steps

    @model_validator(mode="after")
    def _check_graph(self) -> "FlowDefinition":
        ids = {s.id for s in self.steps}
        for s in self.steps:
            for target in [r.goto for r in s.routes] + ([s.next] if s.next else []):
                if target != END and target not in ids:
                    raise ValueError(f"étape {s.id} : destination inconnue « {target} »")
            for r in s.routes:
                _check_fields(r.when, ids)
        for rule in self.service_rules:
            if rule.when is not None:
                _check_fields(rule.when, ids)
        if self.service_rules[-1].when is not None:
            raise ValueError("la dernière règle de prestation doit être sans condition (prestation par défaut)")
        _check_acyclic(self)
        return self

    def step(self, step_id: str) -> Step:
        for s in self.steps:
            if s.id == step_id:
                return s
        raise KeyError(step_id)

    def service_keys(self) -> set[str]:
        return {r.service for r in self.service_rules}


def _check_fields(cond: Condition, ids: set[str]) -> None:
    if isinstance(cond, FieldCondition):
        if cond.field not in ids:
            raise ValueError(f"condition sur une étape inconnue « {cond.field} »")
    elif isinstance(cond, AllCondition):
        for c in cond.all:
            _check_fields(c, ids)
    elif isinstance(cond, AnyCondition):
        for c in cond.any:
            _check_fields(c, ids)
    else:
        _check_fields(cond.not_, ids)


def _check_acyclic(defn: FlowDefinition) -> None:
    """Un parcours ne doit jamais boucler : on refuse tout cycle dans le graphe des étapes."""
    order = [s.id for s in defn.steps]
    edges: dict[str, set[str]] = {}
    for i, s in enumerate(defn.steps):
        fallthrough = s.next or (order[i + 1] if i + 1 < len(order) else END)
        edges[s.id] = {r.goto for r in s.routes} | {fallthrough}
    state: dict[str, int] = {}

    def visit(node: str) -> None:
        if node == END:
            return
        if state.get(node) == 1:
            raise ValueError(f"le parcours boucle sur l'étape « {node} »")
        if state.get(node) == 2:
            return
        state[node] = 1
        for nxt in edges[node]:
            visit(nxt)
        state[node] = 2

    for sid in order:
        visit(sid)


def parse_date(value: Any) -> date:
    return date.fromisoformat(str(value))
