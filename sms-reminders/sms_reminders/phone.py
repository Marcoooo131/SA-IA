"""Mobile phone validation (French numbers by default)."""

from __future__ import annotations

from dataclasses import dataclass

import phonenumbers
from phonenumbers import NumberParseException, PhoneNumberType

MOBILE_TYPES = {PhoneNumberType.MOBILE, PhoneNumberType.FIXED_LINE_OR_MOBILE}


@dataclass(frozen=True)
class PhoneCheck:
    e164: str | None
    valid: bool
    error: str | None = None


def check_mobile(raw: str, region: str = "FR") -> PhoneCheck:
    raw = (raw or "").strip()
    if not raw:
        return PhoneCheck(None, False, "Numéro de téléphone manquant.")
    try:
        number = phonenumbers.parse(raw, region)
    except NumberParseException:
        return PhoneCheck(None, False, "Numéro de téléphone illisible.")
    if not phonenumbers.is_valid_number(number):
        return PhoneCheck(None, False, "Numéro de téléphone invalide.")
    e164 = phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)
    if phonenumbers.number_type(number) not in MOBILE_TYPES:
        return PhoneCheck(e164, False, "Ce numéro n'est pas un numéro mobile : aucun SMS possible.")
    return PhoneCheck(e164, True)


def display(e164: str | None) -> str:
    if not e164:
        return "—"
    try:
        return phonenumbers.format_number(phonenumbers.parse(e164), phonenumbers.PhoneNumberFormat.INTERNATIONAL)
    except NumberParseException:
        return e164


def mask(e164: str | None) -> str:
    """For technical logs only: never log a full number."""
    if not e164:
        return "-"
    return e164[:4] + "*" * max(len(e164) - 6, 0) + e164[-2:]
