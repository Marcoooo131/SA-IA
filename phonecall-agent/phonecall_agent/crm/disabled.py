from __future__ import annotations

from ..errors import CRMUnavailable
from .base import CRMConnector, CRMHealth, CRMLookup, CRMRecordRef, CRMWriteReceipt


class DisabledCRMConnector(CRMConnector):
    """Default connector: no authorised CRM integration. Reports are copied manually from the UI."""

    name = "disabled"

    def health_check(self) -> CRMHealth:
        return CRMHealth(False, "Aucune intégration CRM autorisée n'est configurée : copie manuelle.")

    def find_record(self, lookup: CRMLookup) -> CRMRecordRef | None:
        raise CRMUnavailable("CRM integration disabled", code="crm_disabled")

    def upsert_phone_call(self, record: CRMRecordRef, text: str, idempotency_key: str) -> CRMWriteReceipt:
        raise CRMUnavailable("CRM integration disabled", code="crm_disabled")

    def verify_write(self, record: CRMRecordRef, idempotency_key: str, expected_text: str) -> CRMWriteReceipt | None:
        raise CRMUnavailable("CRM integration disabled", code="crm_disabled")
