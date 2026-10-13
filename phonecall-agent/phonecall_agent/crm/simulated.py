"""SIMULATION — in-memory fake CRM used to test the write/verify/idempotency logic.

It does not represent the real CRM in any way and is refused outside dev/test.
"""

from __future__ import annotations

import itertools

from ..errors import CRMUnavailable
from .base import CRMConnector, CRMHealth, CRMLookup, CRMRecordRef, CRMWriteReceipt


class SimulatedCRMConnector(CRMConnector):
    name = "simulated"
    is_simulation = True

    def __init__(self) -> None:
        self.phone_calls: dict[str, dict] = {}  # idempotency_key -> {"id", "record_id", "text"}
        self._ids = itertools.count(1)
        self.available = True
        self.fail_next_writes = 0
        self.timeout_after_write_next = 0  # write succeeds but the caller sees a timeout
        self.drop_next_writes = 0  # accepted but not persisted (verify must catch it)
        self.write_calls = 0

    def health_check(self) -> CRMHealth:
        return CRMHealth(self.available, "" if self.available else "simulated outage")

    def find_record(self, lookup: CRMLookup) -> CRMRecordRef | None:
        if not self.available:
            raise CRMUnavailable("simulated outage")
        return CRMRecordRef(record_id=f"SIM-{lookup.call_sid[-6:]}", label="Dossier simulé")

    def upsert_phone_call(self, record: CRMRecordRef, text: str, idempotency_key: str) -> CRMWriteReceipt:
        self.write_calls += 1
        if not self.available or self.fail_next_writes > 0:
            self.fail_next_writes = max(0, self.fail_next_writes - 1)
            raise CRMUnavailable("simulated write failure")
        if self.drop_next_writes > 0:
            self.drop_next_writes -= 1
            return CRMWriteReceipt(external_ref=None, idempotency_key=idempotency_key)
        existing = self.phone_calls.get(idempotency_key)
        if existing:
            existing["text"] = text
        else:
            existing = {"id": f"PC-{next(self._ids)}", "record_id": record.record_id, "text": text}
            self.phone_calls[idempotency_key] = existing
        if self.timeout_after_write_next > 0:
            self.timeout_after_write_next -= 1
            raise CRMUnavailable("simulated timeout after write", code="crm_timeout")
        return CRMWriteReceipt(external_ref=existing["id"], idempotency_key=idempotency_key)

    def verify_write(self, record: CRMRecordRef, idempotency_key: str, expected_text: str) -> CRMWriteReceipt | None:
        if not self.available:
            raise CRMUnavailable("simulated outage")
        pc = self.phone_calls.get(idempotency_key)
        if pc and pc["record_id"] == record.record_id and pc["text"] == expected_text:
            return CRMWriteReceipt(external_ref=pc["id"], idempotency_key=idempotency_key)
        return None
