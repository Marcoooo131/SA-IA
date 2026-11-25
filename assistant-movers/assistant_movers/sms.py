"""Étape 12 : SMS de confirmation, envoyé par l'assistant après validation de l'agent, avec la date et
la tranche horaire relues dans le WO. Contrôle de doublon : si un SMS du case mentionne déjà la date,
l'assistant s'arrête."""

from __future__ import annotations

from .config import Config
from .models import Blocage, Dossier


def texte(cfg: Config, dossier: Dossier) -> str:
    wo = dossier.wo
    return cfg.sms.modele.format(date=f"{wo.debut:%d/%m/%Y}", debut=f"{wo.debut:%Hh%M}", fin=f"{wo.fin:%Hh%M}")


def envoyer(gw, cfg: Config, dossier: Dossier, message: str, forcer: bool = False) -> str:
    if not dossier.wo or not dossier.wo.debut:
        raise Blocage("Pas de rendez-vous réservé : SMS impossible.", reprise=False)
    if not dossier.compte.mobile:
        raise Blocage("Aucun mobile sur le compte.", action="Ajoutez le mobile dans le CRM, puis rechargez le dossier.")
    jour = f"{dossier.wo.debut:%d/%m}"
    if not message.strip():
        raise Blocage("Le texte du SMS est vide.", reprise=False)
    if jour not in message:
        raise Blocage(f"Le SMS ne contient pas la date réservée ({jour}).", reprise=False)
    if cfg.sms.verifier_doublon and not forcer:
        deja = [t for t in gw.sms_du_case(dossier.case_id, dossier.wo.id) if jour in t]
        if deja:
            raise Blocage("Un SMS mentionnant cette date existe déjà sur le case.",
                          action="Vérifiez les activités du case. « Envoyer quand même » seulement si le client ne l'a pas reçu.")
    etat = gw.envoyer_sms(dossier.case_id, dossier.compte.mobile, message.strip())
    dossier.sms_texte, dossier.sms_envoye = message.strip(), True
    return etat
