"""Étapes 1 à 3 : retrouver le compte par son numéro client et lire ce qu'il faut pour la suite."""

from __future__ import annotations

import re

from .models import Blocage, Compte


def valider_numero(numero: str) -> str:
    n = re.sub(r"\s", "", numero or "")
    if not re.fullmatch(r"\d{5,12}", n):
        raise Blocage("Numéro client invalide : uniquement des chiffres (5 à 12).", reprise=False)
    return n


def charger_compte(gw, numero: str) -> Compte:
    return gw.chercher_compte(valider_numero(numero))


def avertissements(compte: Compte) -> list[str]:
    """Ce que le CRM signalerait par un bandeau : l'assistant s'arrête et l'agent décide."""
    a = []
    if compte.cases_movers_ouverts:
        a.append("Case Movers déjà ouvert : " + ", ".join(r.nom for r in compte.cases_movers_ouverts))
    if compte.wo_ouverts:
        a.append("Work Order déjà ouvert : " + ", ".join(r.nom for r in compte.wo_ouverts))
    if not compte.mobile:
        a.append("Aucun mobile en 06/07 trouvé sur la fiche : vous pourrez saisir le numéro à l'étape SMS.")
    if not compte.email:
        a.append("Aucun email sur le compte : l'email de confirmation ne pourra pas partir.")
    return a
