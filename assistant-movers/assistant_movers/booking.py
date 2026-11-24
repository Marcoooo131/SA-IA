"""Étapes 9 à 11 : période de recherche, créneaux, réservation, contrôle du statut.

Méthode « assiste » (par défaut sur le vrai CRM) : l'assistant prépare la période, ouvre la fiche du WO
dans Edge ; l'agent clique « Get appointments » et choisit le créneau avec le client ; l'assistant relit
le WO pour récupérer la date et la tranche réservées. Méthode « action » : l'assistant récupère les
créneaux et réserve lui-même, une fois l'action CRM relevée (`decouvrir --observer-booking`)."""

from __future__ import annotations

from datetime import date, timedelta

from .models import Blocage, CrmError, Dossier


def periode(jours: int, depuis: date | None = None) -> tuple[date, date]:
    d = depuis or date.today()
    return d, d + timedelta(days=jours)


def preparer(gw, cfg, dossier: Dossier) -> None:
    # la réinstallation se fait à la nouvelle adresse : pas avant le jour du déménagement
    debut, fin = periode(cfg.booking.jours_recherche, max(date.today(), dossier.adresse.date_demenagement))
    gw.fenetre_booking(dossier.wo, debut, fin)


def charger_creneaux(gw, dossier: Dossier) -> None:
    try:
        dossier.creneaux = gw.creneaux(dossier.wo)
    except CrmError as e:
        dossier.creneaux = []
        raise Blocage(f"Pas de créneau : {e}", action="Élargissez la période, sinon envoyez la demande No Cap ci-dessous sur Teams.") from e
    if not dossier.creneaux:
        raise Blocage("Aucun créneau proposé par le CRM.", action="Envoyez la demande No Cap ci-dessous sur Teams.")


def reserver(gw, dossier: Dossier, creneau_id: str) -> None:
    c = next((c for c in dossier.creneaux if c.id == creneau_id), None)
    if not c:
        raise Blocage("Créneau inconnu : rechargez les créneaux.", reprise=False)
    gw.reserver(dossier.wo, c)
    verifier(gw, dossier)


def verifier(gw, dossier: Dossier) -> None:
    wo = gw.lire_wo(dossier.wo.id)
    if not (wo.debut and wo.fin):
        raise Blocage("Le WO n'est pas encore réservé dans le CRM.",
                      action="Dans la fiche du WO : « Get appointments », choisissez le créneau, validez, puis « Vérifier la réservation ».")
    dossier.wo = wo


def message_no_cap(dossier: Dossier, dispos: str) -> str:
    c = dossier.compte
    cp = dossier.adresse.code_postal if dossier.adresse else ""
    return f"{dossier.wo.numero if dossier.wo else 'FR-?'} - {c.nom if c else ''} - {cp} - dispos : {dispos or '…'}"
