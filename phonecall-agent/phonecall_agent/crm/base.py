"""Interchangeable CRM connector interface.

No real connector exists: the internal CRM's API, identifiers, data model and authentication
are UNKNOWN (see AUDIT.md). A real connector may only be written from the CRM's official
documentation, with written authorisation, and must pass the contract tests in
``tests/test_crm.py`` against a non-production environment before being enabled.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass(frozen=True)
class CRMHealth:
    available: bool
    reason: str = ""


@dataclass(frozen=True)
class CRMLookup:
    """What we know about a call to find the related CRM record.

    The real lookup key (contract number? caller number? Twilio CallSid stored by the CRM?)
    is an open question; only authorised fields will be added here.
    """

    call_sid: str
    extra: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class CRMRecordRef:
    record_id: str
    label: str = ""


@dataclass(frozen=True)
class CRMWriteReceipt:
    external_ref: str | None  # id of the Phone Call in the CRM, if returned
    idempotency_key: str


class CRMConnector(ABC):
    name = "abstract"
    is_simulation = False

    @abstractmethod
    def health_check(self) -> CRMHealth: ...

    @abstractmethod
    def find_record(self, lookup: CRMLookup) -> CRMRecordRef | None: ...

    @abstractmethod
    def upsert_phone_call(self, record: CRMRecordRef, text: str, idempotency_key: str) -> CRMWriteReceipt:
        """Create the Phone Call, or update the one already carrying ``idempotency_key``.

        Must never create a second Phone Call for the same key. Raise CRMUnavailable on
        transient errors; a timeout must be treated as an *unknown* outcome by the caller.
        """

    @abstractmethod
    def verify_write(self, record: CRMRecordRef, idempotency_key: str, expected_text: str) -> CRMWriteReceipt | None:
        """Read back from the CRM. Return the receipt only if the Phone Call exists with the expected text."""
