"""Writing an approved report to the CRM — idempotent and verified.

Rules:
- one Phone Call per recording: idempotency key ``sa-phonecall:<RecordingSid>``;
- a write is CONFIRMED only after reading it back (``verify_write``);
- after an uncertain outcome (timeout), the next attempt verifies before writing again,
  so a retry can never create a duplicate.
"""

from __future__ import annotations

import logging

from sqlalchemy import select

from .container import Container
from .crm import CRMLookup
from .db import session_scope
from .errors import CRMUnavailable, CRMWriteUnverified, PipelineError
from .logging_setup import safe_error_message
from .models import Call, CallStatus, CrmWrite, CrmWriteStatus, ProcessingError, ReportStatus, utcnow
from .pipeline import RetryLater

log = logging.getLogger(__name__)


def idempotency_key(call: Call) -> str:
    return f"sa-phonecall:{call.recording_sid}"


def crm_enabled(c: Container) -> bool:
    return c.settings.crm_connector != "disabled"


def push_to_crm(call_id: str, c: Container) -> CrmWriteStatus | None:
    with session_scope() as s:
        call = s.get(Call, call_id)
        if call is None or call.status not in (CallStatus.APPROVED, CallStatus.CRM_PENDING, CallStatus.READY):
            return None
        report = call.latest_report
        if report is None or report.status not in (ReportStatus.APPROVED, ReportStatus.READY):
            return None
        if report.status == ReportStatus.READY and not c.settings.crm_auto_push_ready:
            return None

        key = idempotency_key(call)
        write = s.scalar(select(CrmWrite).where(CrmWrite.idempotency_key == key))
        if write is None:
            write = CrmWrite(
                call_id=call.id, report_id=report.id, connector=c.crm.name, idempotency_key=key,
                status=CrmWriteStatus.PENDING, attempts=0,
            )
            s.add(write)
        elif write.report_id != report.id:
            write.report_id = report.id  # newer approved version: update the same Phone Call
            if write.status == CrmWriteStatus.CONFIRMED:
                write.status = CrmWriteStatus.PENDING
        call.status = CallStatus.CRM_PENDING
        write.attempts += 1
        s.commit()

        try:
            health = c.crm.health_check()
            if not health.available:
                raise CRMUnavailable(health.reason or "CRM unavailable")
            record = c.crm.find_record(CRMLookup(call_sid=call.call_sid))
            if record is None:
                write.status = CrmWriteStatus.FAILED
                write.last_error = "Dossier CRM introuvable"
                call.status = CallStatus.APPROVED
                call.status_detail = "Dossier CRM introuvable : copie manuelle nécessaire"
                return write.status

            # Any previous write request may have reached the CRM: always check before writing again.
            if write.status != CrmWriteStatus.PENDING:
                receipt = c.crm.verify_write(record, key, report.text)
                if receipt:
                    return _confirm(call, write, receipt.external_ref)

            write.status = CrmWriteStatus.SENT
            s.commit()
            try:
                c.crm.upsert_phone_call(record, report.text, key)
            except CRMUnavailable as exc:
                # The request may or may not have reached the CRM.
                write.status = CrmWriteStatus.UNKNOWN if exc.code == "crm_timeout" else CrmWriteStatus.FAILED
                raise
            receipt = c.crm.verify_write(record, key, report.text)
            if not receipt:
                write.status = CrmWriteStatus.UNKNOWN
                raise CRMWriteUnverified("write not found when reading back")
            return _confirm(call, write, receipt.external_ref)
        except PipelineError as exc:
            write.last_error = safe_error_message(exc)
            s.add(
                ProcessingError(
                    call_id=call.id, stage="crm", attempt=write.attempts, error_code=exc.code,
                    message=safe_error_message(exc), retryable=exc.retryable,
                )
            )
            if exc.retryable and write.attempts < c.settings.job_max_attempts:
                call.status_detail = "Écriture CRM non confirmée, nouvelle tentative prévue"
                s.commit()
                raise RetryLater(exc) from exc
            call.status = CallStatus.APPROVED
            call.status_detail = "Écriture CRM impossible : copie manuelle nécessaire"
            return write.status


def _confirm(call: Call, write: CrmWrite, external_ref: str | None) -> CrmWriteStatus:
    write.status = CrmWriteStatus.CONFIRMED
    write.external_ref = external_ref
    write.verified_at = utcnow()
    write.last_error = None
    call.status = CallStatus.CRM_CONFIRMED
    call.status_detail = None
    log.info("crm write confirmed", extra={"call_id": call.id})
    return write.status
