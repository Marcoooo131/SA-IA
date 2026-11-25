"""Étape 4 : la nouvelle adresse saisie par l'agent, contrôlée avant toute écriture."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta

from .models import Blocage, NouvelleAdresse


def valider_adresse(rue: str, code_postal: str, ville: str, date_demenagement: str) -> NouvelleAdresse:
    rue, ville, cp = (rue or "").strip(), (ville or "").strip().upper(), re.sub(r"\s", "", code_postal or "")
    erreurs = []
    if len(rue) < 4 or not re.search(r"[A-Za-zÀ-ÿ]", rue):
        erreurs.append("rue (numéro et nom de voie)")
    if not re.fullmatch(r"\d{5}", cp):
        erreurs.append("code postal (5 chiffres)")
    if len(ville) < 2:
        erreurs.append("ville")
    d = None
    try:
        d = datetime.strptime((date_demenagement or "").strip(), "%Y-%m-%d").date()
        if not (date.today() - timedelta(days=60) <= d <= date.today() + timedelta(days=365)):
            erreurs.append("date de déménagement (entre il y a 60 jours et dans un an)")
    except ValueError:
        erreurs.append("date de déménagement")
    if erreurs:
        raise Blocage("À corriger : " + ", ".join(erreurs) + ".", reprise=False)
    return NouvelleAdresse(rue, cp, ville, d)


INFOS = {"duree": "durée de l'intervention", "electricite": "électricité sur place", "reseau": "réseau",
         "travaux": "travaux prévus", "materiel": "matériel à réinstaller"}


DEFAUTS = {"electricite": "oui", "reseau": "GSM / Wifi", "travaux": "Pas de travaux"}


def valider_infos(infos: dict[str, str], materiel_installation: str = "") -> dict[str, str]:
    """Infos de l'intervention, saisies avec la nouvelle adresse : elles remplissent l'email (et le matériel, le WO).
    Valeurs par défaut : électricité oui, réseau GSM / Wifi, pas de travaux, matériel = composants de l'installation.
    La durée peut rester vide : elle est alors reprise du WO."""
    v = {k: (infos.get(k) or "").strip() for k in INFOS}
    for k, d in DEFAUTS.items():
        v[k] = v[k] or d
    v["materiel"] = v["materiel"] or materiel_installation
    if not v["materiel"]:
        raise Blocage("À compléter : matériel à réinstaller (aucun composant trouvé sur l'installation).", reprise=False)
    if v["duree"] and not re.fullmatch(r"\d{1,3}", v["duree"]):
        raise Blocage("Durée de l'intervention : un nombre de minutes (ex. 120).", reprise=False)
    return v
