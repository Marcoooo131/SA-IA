"""Étapes 5 et 6 : créer le case « Movers – Déménagement » (Register Data), renseigner Moving Out,
passer « Completed Move Out Info » à Oui, puis attendre le Work Order Installation créé par le CRM."""

from __future__ import annotations

import time

from .models import Blocage, Dossier


def apercu(dossier: Dossier, titre: str) -> list[tuple[str, str]]:
    a, c = dossier.adresse, dossier.compte
    return [("Titre", titre), ("Compte", f"{c.numero} — {c.nom}"),
            ("Installation", next((i.nom for i in c.installations if i.id == dossier.installation_id), "—")),
            ("Contrat", next((i.nom for i in c.contrats if i.id == dossier.contrat_id), "—")),
            ("Moving Out Or Moving In", "Out"), ("Moving Out interested in Installation", "Yes"),
            ("Nouvelle adresse", a.texte()), ("Moving Out Date", f"{a.date_demenagement:%d/%m/%Y}"),
            ("Completed Move Out Info", "Yes (après création)")]


def creer(gw, dossier: Dossier) -> None:
    dossier.case_id, dossier.case_numero = gw.creer_case(dossier.compte, dossier.installation_id, dossier.contrat_id, dossier.adresse)
    gw.terminer_move_out(dossier.case_id)


def attendre_wo(gw, dossier: Dossier, secondes: int, pause: float = 3.0) -> None:
    fin = time.monotonic() + secondes
    while True:
        wo = gw.wo_du_case(dossier.case_id)
        if wo:
            dossier.wo = wo
            return
        if time.monotonic() >= fin:
            raise Blocage("Le CRM n'a pas créé le Work Order Installation.",
                          action="Dans la fiche du case ouverte dans Edge, vérifiez l'étape Info et cliquez « Finish », puis « Reprendre ».")
        time.sleep(pause)
