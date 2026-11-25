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


# Libellé lu juste avant une zone surlignée → clé de la valeur. Le plus proche de la zone l'emporte.
LIBELLES = [("date", r"jour|date|le\s*$"), ("debut", r"entre\s*$|arriv\w*\s*(du technicien)?\s*:?\s*(entre)?\s*$"),
            ("fin", r"\bet\s*$|\bà\s*$"), ("duree", r"dur[ée]e"), ("electricite", r"[ée]lectricit[ée]"),
            ("reseau", r"r[ée]seau|gsm|wifi"), ("travaux", r"travaux"), ("materiel", r"mat[ée]riel")]


def _texte(h: str) -> str:
    return _html.unescape(re.sub(r"<[^>]+>", " ", h))


def cle_par_libelle(avant: str) -> str:
    """Devine la valeur attendue d'après le texte qui précède la zone (dernière ligne / 80 caractères)."""
    t = re.split(r"[\n\r]|<br|</p|</li", avant)[-1] if avant else ""
    t = _texte(t)[-80:].lower()
    best, pos = "", -1
    for cle, motif in LIBELLES:
        for m in re.finditer(motif, t):
            if m.end() > pos:
                best, pos = cle, m.end()
    return best


def remplir(cfg: Config, html: str, vals: dict[str, str]) -> str:
    out, last = [], 0
    for m in _SURLIGNE.finditer(html):
        brut = _texte(m.group(1)).strip()
        cle = cfg.email.remplacements.get(brut) or cle_par_libelle(html[max(0, m.start() - 400):m.start()])
        out.append(html[last:m.start()])
        out.append(_html.escape(vals[cle]) if cle and vals.get(cle) else m.group(0))   # zone remplie : surlignage retiré
        last = m.end()
    out.append(html[last:])
    return "".join(out)


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
