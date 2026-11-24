"""Emails de compte (mot de passe oublié, vérification de l'adresse), hors entreprise.

Ils passent par le même fournisseur que les notifications (log, smtp ou brevo) mais ne sont pas liés à une
entreprise : ils ne sont donc pas stockés dans la table notification (protégée par entreprise). Avec le
fournisseur « log », rien n'est envoyé : le message est écrit dans le journal et gardé en mémoire (outbox),
ce qui sert au développement et aux tests.
"""
from __future__ import annotations

import asyncio
import logging
from collections import deque

from ..config import get_settings
from . import notifications

log = logging.getLogger("venio.account_mail")
outbox: deque[dict[str, str]] = deque(maxlen=50)

SIGNATURE = "\n\n— L'équipe Venio\nCet email est envoyé automatiquement, merci de ne pas y répondre."


def reset_message(full_name: str, link: str) -> tuple[str, str]:
    return ("Réinitialisation de votre mot de passe Venio",
            f"Bonjour {full_name},\n\nVous avez demandé à réinitialiser votre mot de passe. Ce lien est valable 30 minutes "
            f"et ne fonctionne qu'une fois :\n\n{link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email : "
            f"votre mot de passe actuel reste valable.{SIGNATURE}")


def verify_message(full_name: str, link: str) -> tuple[str, str]:
    return ("Confirmez votre adresse email",
            f"Bonjour {full_name},\n\nPour confirmer l'adresse email de votre compte Venio, ouvrez ce lien (valable 48 heures) :"
            f"\n\n{link}\n\nCette confirmation nous permet de vous joindre en cas de besoin et de sécuriser votre compte.{SIGNATURE}")


def password_changed_message(full_name: str) -> tuple[str, str]:
    return ("Votre mot de passe a été modifié",
            f"Bonjour {full_name},\n\nLe mot de passe de votre compte Venio vient d'être modifié. Par sécurité, vos sessions "
            f"ouvertes sur d'autres appareils ont été fermées. Si vous n'êtes pas à l'origine de ce changement, répondez à votre contact Venio ou réinitialisez "
            f"immédiatement votre mot de passe.{SIGNATURE}")


async def send(to: str, subject: str, body: str) -> None:
    """Envoi best effort : une erreur du fournisseur est journalisée, jamais renvoyée à l'utilisateur."""
    provider = get_settings().email_provider
    try:
        if provider == "smtp":
            await asyncio.to_thread(notifications._send_smtp, to, subject, body)
        elif provider == "brevo":
            await asyncio.to_thread(notifications._send_brevo, to, subject, body)
        else:
            outbox.append({"to": to, "subject": subject, "body": body})
            log.info("[email de compte non envoyé — fournisseur log] à %s : %s", to, subject)
            if get_settings().environment in ("development", "test"):   # jamais en production : le lien donne accès au compte
                log.info("Contenu (développement uniquement) :\n%s", body)
    except Exception:
        log.exception("Échec de l'envoi de l'email de compte « %s »", subject)
