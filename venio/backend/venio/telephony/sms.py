"""SMS : calcul des segments facturés et modèles de récupération des appels manqués.

Un SMS contient 160 caractères de l'alphabet GSM 03.38 (153 par segment s'il y en a plusieurs).
Un seul caractère hors de cet alphabet (ô, ê, ç, guillemets « », apostrophe courbe…) fait passer
tout le message en UCS-2 : 70 caractères (67 par segment). Voir 05-extension-acquisition.md §A.7.
"""
from __future__ import annotations

GSM7_BASIC = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
GSM7_EXTENDED = set("^{}\\[~]|€\f")   # comptent pour 2 caractères
MAX_SEGMENTS = 3                       # au-delà, le modèle est refusé (coût)

TEMPLATES: dict[str, dict[str, str]] = {
    "professionnel": {"label": "Professionnel", "text": "{entreprise} : nous n'avons pas pu prendre votre appel. Décrivez votre besoin et réservez votre rendez-vous ici : {lien}{stop}"},
    "chaleureux": {"label": "Chaleureux", "text": "Bonjour, ici {entreprise} ! Désolés d'avoir manqué votre appel. Dites-nous tout et choisissez votre créneau : {lien}{stop}"},
    "commercial": {"label": "Commercial", "text": "{entreprise} : votre projet nous intéresse ! Décrivez-le en 2 min et réservez un RDV gratuit : {lien}{stop}"},
    "court": {"label": "Très court", "text": "{entreprise} : appel manqué, réservez ici {lien}{stop}"},
}
DEFAULT_TONE = "professionnel"


def encoding(text: str) -> str:
    return "GSM-7" if all(c in GSM7_BASIC or c in GSM7_EXTENDED for c in text) else "UCS-2"


def segments(text: str) -> dict:
    """Longueur, encodage, nombre de segments facturés et caractères coûteux."""
    enc = encoding(text)
    if enc == "GSM-7":
        length = sum(2 if c in GSM7_EXTENDED else 1 for c in text)
        count = 1 if length <= 160 else -(-length // 153)
        costly: list[str] = []
    else:
        length = len(text.encode("utf-16-le")) // 2
        count = 1 if length <= 70 else -(-length // 67)
        costly = sorted({c for c in text if c not in GSM7_BASIC and c not in GSM7_EXTENDED})
    return {"length": length, "encoding": enc, "segments": count, "costly_chars": costly}


def render(template: str, company: str, link: str, stop_mention: str | None) -> str:
    stop = f" {stop_mention.strip()}" if stop_mention and stop_mention.strip() else ""
    return (template.replace("{entreprise}", company.strip())
            .replace("{lien}", link).replace("{stop}", stop)).strip()
