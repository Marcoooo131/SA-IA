"""Étape 13 : email « Récapitulatif concernant votre déménagement » depuis le modèle du CRM, file
Movers en expéditeur, champs surlignés remplacés. L'assistant refuse d'envoyer s'il reste un champ
surligné non rempli."""

from __future__ import annotations

import html as _html
import re

from .config import Config
from .models import Blocage, Dossier

_SURLIGNE = re.compile(r"<span[^>]*background(?:-color)?\s*:\s*(?:yellow|#ff0|#ffff00|rgb\(255,\s*255,\s*0\))[^>]*>(.*?)</span>",
                       re.I | re.S)


def zones_surlignees(html: str) -> list[str]:
    return [re.sub(r"<[^>]+>", "", m).strip() for m in _SURLIGNE.findall(html)]


def valeurs(dossier: Dossier, saisies: dict[str, str]) -> dict[str, str]:
    wo = dossier.wo
    v = {"date": f"{wo.debut:%d/%m/%Y}", "debut": f"{wo.debut:%Hh%M}", "fin": f"{wo.fin:%Hh%M}"}
    v.update({k: (s or "").strip() for k, s in saisies.items()})
    return v


def remplir(cfg: Config, html: str, vals: dict[str, str]) -> str:
    def remplace(m):
        brut = re.sub(r"<[^>]+>", "", m.group(1)).strip()
        cle = cfg.email.remplacements.get(brut)
        if cle and vals.get(cle):
            return _html.escape(vals[cle])          # surlignage retiré : la zone est remplie
        return m.group(0)
    return _SURLIGNE.sub(remplace, html)


def preparer(gw, cfg: Config, dossier: Dossier, saisies: dict[str, str]) -> None:
    sujet, modele = gw.preparer_email(dossier.case_id)
    dossier.email_sujet = sujet
    dossier.email_html = remplir(cfg, modele, valeurs(dossier, saisies))


def envoyer(gw, dossier: Dossier) -> str:
    restes = zones_surlignees(dossier.email_html)
    if restes:
        raise Blocage("Champs encore surlignés dans l'email : " + ", ".join(restes),
                      action="Complétez les champs du formulaire puis « Préparer l'email ».", reprise=False)
    etat = gw.envoyer_email(dossier.case_id, dossier.compte, dossier.email_sujet, dossier.email_html)
    dossier.email_envoye = True
    return etat
