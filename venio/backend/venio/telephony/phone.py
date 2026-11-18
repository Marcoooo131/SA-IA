"""Numéros de téléphone : normalisation E.164, numéros masqués, mobiles français."""
from __future__ import annotations

import re

# Valeurs envoyées par les fournisseurs et standards quand l'appelant masque son numéro.
MASKED_VALUES = {"", "anonymous", "anonyme", "restricted", "private", "unknown", "unavailable", "masque", "masqué",
                 "+266696687", "266696687", "+7378742833", "+2562533", "+8656696"}
_FR_MOBILE = re.compile(r"^\+33[67]\d{8}$")
_E164 = re.compile(r"^\+[1-9]\d{6,14}$")


def normalize(raw: str | None, default_country: str = "FR") -> str | None:
    """Renvoie le numéro au format E.164 (+33612345678), ou None s'il est masqué ou illisible."""
    if raw is None:
        return None
    value = raw.strip()
    if value.lower() in MASKED_VALUES:
        return None
    digits = re.sub(r"[^\d+]", "", value)
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if not digits.startswith("+"):
        if default_country == "FR" and re.fullmatch(r"0\d{9}", digits):
            digits = "+33" + digits[1:]
        elif default_country == "FR" and re.fullmatch(r"[1-9]\d{8}", digits):
            digits = "+33" + digits
        else:
            return None
    if digits.startswith("+330"):          # +33 0X XX… saisi par erreur
        digits = "+33" + digits[4:]
    if digits.lower() in MASKED_VALUES or not _E164.match(digits):
        return None
    return digits


def is_fr_mobile(e164: str | None) -> bool:
    return bool(e164 and _FR_MOBILE.match(e164))


def country_prefix(e164: str) -> str:
    return "+33" if e164.startswith("+33") else e164[:3]


def mask(e164: str | None) -> str:
    """Affichage partiel dans les listes : 06 •• •• 12 34."""
    if not e164:
        return "Numéro masqué"
    if e164.startswith("+33") and len(e164) == 12:
        n = "0" + e164[3:]
        return f"{n[:2]} •• •• {n[6:8]} {n[8:]}"
    return e164[:4] + " •• •• " + e164[-4:]


def display(e164: str | None) -> str:
    """Affichage complet : 06 12 34 56 78 (France) ou E.164."""
    if not e164:
        return "Numéro masqué"
    if e164.startswith("+33") and len(e164) == 12:
        n = "0" + e164[3:]
        return " ".join(n[i:i + 2] for i in range(0, 10, 2))
    return e164
