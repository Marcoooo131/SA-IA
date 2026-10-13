"""Handling of a validated Twilio recording-status event (idempotent)."""

from __future__ import annotations

import logging
from enum import Enum

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from .db import session_scope
from .models import Call, CallStatus, WebhookEvent
from .twilio.webhook import RecordingStatusEvent

log = logging.getLogger(__name__)


class IntakeResult(str, Enum):
    QUEUED = "queued"
    DUPLICATE = "duplicate"
    IGNORED = "ignored"
    ABSENT = "absent"


def handle_recording_event(event: RecordingStatusEvent) -> tuple[IntakeResult, str | None]:
    """Record the event and create the call. Returns (result, call_id to enqueue or None)."""
    # 1. Event-level idempotency (Twilio may deliver the same callback more than once).
    try:
        with session_scope() as s:
            s.add(
                WebhookEvent(
                    idempotency_key=event.idempotency_key,
                    recording_sid=event.recording_sid,
                    recording_status=event.recording_status,
                )
            )
    except IntegrityError:
        with session_scope() as s:
            s.execute(
                update(WebhookEvent)
                .where(WebhookEvent.idempotency_key == event.idempotency_key)
                .values(duplicates=WebhookEvent.duplicates + 1)
            )
        log.info("duplicate webhook ignored", extra={"recording_sid": event.recording_sid})
        return IntakeResult.DUPLICATE, None

    if event.recording_status == "in-progress":
        return IntakeResult.IGNORED, None

    status = CallStatus.RECEIVED if event.recording_status == "completed" else CallStatus.RECORDING_ABSENT
    detail = None if status == CallStatus.RECEIVED else f"Twilio : enregistrement {event.recording_status}"

    # 2. Call-level idempotency: one call per RecordingSid (unique constraint).
    try:
        with session_scope() as s:
            call = Call(
                account_sid=event.account_sid,
                call_sid=event.call_sid,
                recording_sid=event.recording_sid,
                recording_duration=event.recording_duration,
                recording_channels=event.recording_channels,
                recording_source=event.recording_source,
                status=status,
                status_detail=detail,
            )
            s.add(call)
            s.flush()
            call_id = call.id
    except IntegrityError:
        with session_scope() as s:
            existing = s.scalar(select(Call).where(Call.recording_sid == event.recording_sid))
            if existing and existing.status == CallStatus.RECORDING_ABSENT and status == CallStatus.RECEIVED:
                existing.status, existing.status_detail = CallStatus.RECEIVED, None
                return IntakeResult.QUEUED, existing.id
        return IntakeResult.DUPLICATE, None

    if status == CallStatus.RECORDING_ABSENT:
        return IntakeResult.ABSENT, None
    return IntakeResult.QUEUED, call_id
