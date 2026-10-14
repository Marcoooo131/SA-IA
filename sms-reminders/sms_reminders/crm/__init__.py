"""Future CRM integration point.

No CRM API is known yet: nothing here invents routes or identifiers. A connector will have to
implement ``CrmConnector`` once the CRM team provides an official, authorised interface
(API or automated export). Until then, appointments come from CSV / Excel imports.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol


@dataclass(frozen=True)
class CrmAppointment:
    external_ref: str | None
    customer_ref: str
    first_name: str
    last_name: str
    phone: str
    appointment_date: date
    appointment_time: str  # "HH:MM", Europe/Paris
    service: str | None
    confirmed: bool = False


class CrmConnector(Protocol):
    name: str

    def available(self) -> bool: ...

    def fetch_appointments(self, start: date, end: date) -> list[CrmAppointment]: ...

    def push_confirmation(self, external_ref: str, confirmed: bool, actor: str) -> None: ...


class DisabledCrm:
    name = "disabled"

    def available(self) -> bool:
        return False

    def fetch_appointments(self, start: date, end: date) -> list[CrmAppointment]:
        raise RuntimeError("Aucune connexion CRM n'est configurée.")

    def push_confirmation(self, external_ref: str, confirmed: bool, actor: str) -> None:
        raise RuntimeError("Aucune connexion CRM n'est configurée.")
