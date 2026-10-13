"""Structured output expected from the model.

Every statement is tied to transcript segment ids (``evidence``) so that the validator and the
reviewer can find the passage that justifies it. Facts are separated by origin:
customer statements / advisor information / actions actually done / actions still to do.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

UNDETERMINED = "indetermine"
SECTIONS = ("call_reason", "customer_statements", "advisor_information", "actions_done",
            "solutions_proposed", "outcome", "actions_todo")


class Item(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(description="Reformulation factuelle et concise, en français.")
    evidence: list[str] = Field(description="Identifiants des segments qui justifient l'élément, ex. ['S3','S4'].")
    to_verify: bool = Field(description="true si l'information est incertaine et doit être vérifiée.")


class ActionItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str
    evidence: list[str]
    to_verify: bool
    owner: Literal["advisor", "customer", "company", "unknown"]


class StructuredReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    no_usable_content: bool = Field(description="true si l'appel ne contient aucun échange exploitable.")
    category: str = Field(description="Clé de catégorie configurée, ou 'indetermine' si non étayée.")
    category_evidence: list[str]
    call_reason: list[Item] = Field(description="Motif de l'appel, tel qu'exprimé (vide s'il n'est pas clair).")
    customer_statements: list[Item] = Field(description="Demande, situation et besoin exprimés par le client.")
    advisor_information: list[Item] = Field(description="Informations communiquées par le conseiller.")
    actions_done: list[ActionItem] = Field(description="Actions réellement effectuées pendant l'appel.")
    solutions_proposed: list[Item] = Field(description="Solutions ou offres proposées, acceptées ou non.")
    outcome: list[Item] = Field(description="Décision du client ou résultat de l'appel, seulement s'il est exprimé.")
    actions_todo: list[ActionItem] = Field(description="Actions restant à effectuer, y compris celles évoquées sans être faites.")
    points_to_verify: list[str] = Field(description="Informations critiques incertaines ou manquantes.")
    phone_call_text: str = Field(description="Texte final du Phone Call, prêt à coller dans le CRM.")

    def all_items(self) -> list[tuple[str, Item | ActionItem]]:
        out: list[tuple[str, Item | ActionItem]] = []
        for section in SECTIONS:
            out.extend((section, item) for item in getattr(self, section))
        return out


def _strictify(node):
    """Structured outputs require additionalProperties=false and every property listed as required."""
    if isinstance(node, dict):
        if node.get("type") == "object" and "properties" in node:
            node["additionalProperties"] = False
            node["required"] = list(node["properties"].keys())
        node.pop("title", None)
        node.pop("default", None)
        for v in node.values():
            _strictify(v)
    elif isinstance(node, list):
        for v in node:
            _strictify(v)
    return node


def report_json_schema() -> dict:
    return _strictify(StructuredReport.model_json_schema())
