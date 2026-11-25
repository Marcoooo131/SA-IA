"""Étape 14 : compte rendu final, à copier dans les notes ou à garder sous les yeux."""

from __future__ import annotations

from .models import Dossier


def compte_rendu(d: Dossier) -> str:
    c, wo = d.compte, d.wo
    lignes = [
        f"Client : {c.numero} — {c.nom}" if c else "Client : —",
        f"Nouvelle adresse : {d.adresse.texte()} (déménagement le {d.adresse.date_demenagement:%d/%m/%Y})" if d.adresse else "",
        f"Case : {d.case_numero or '—'}",
        f"Work Order : {wo.numero} — {wo.statut}" if wo else "Work Order : —",
        f"Rendez-vous : {wo.debut:%d/%m/%Y} entre {wo.debut:%Hh%M} et {wo.fin:%Hh%M}" if wo and wo.debut else "Rendez-vous : non réservé",
        f"Produits ajoutés : {', '.join(wo.produits)}" if wo and wo.produits else "",
        f"Durée d'intervention : {d.infos.get('duree')} min" if d.infos.get("duree") else "",
        f"SMS : {'envoyé' if d.sms_envoye else 'non envoyé'}",
        f"Email de confirmation : {'envoyé' if d.email_envoye else 'non envoyé'}",
    ]
    if d.avertissements_acceptes:
        lignes.append("Avertissements acceptés : " + " | ".join(d.avertissements_acceptes))
    return "\n".join(l for l in lignes if l)
