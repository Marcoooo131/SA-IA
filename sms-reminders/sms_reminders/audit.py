"""History / audit trail. Messages are French, for the UI; details must stay free of
unnecessary personal data (no phone numbers, no message bodies)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from .models import Appointment, Event, utcnow


def record(
    session: Session,
    actor: str,
    kind: str,
    message: str,
    *,
    appointment: Appointment | None = None,
    appointment_id: int | None = None,
    job_id: int | None = None,
    details: dict | None = None,
    touch: bool = True,
) -> Event:
    now = utcnow()
    appt_id = appointment.id if appointment is not None else appointment_id
    ev = Event(at=now, actor=actor, kind=kind, appointment_id=appt_id, job_id=job_id, message=message[:500], details=details)
    session.add(ev)
    if appointment is not None and touch:
        appointment.last_action = message[:255]
        appointment.last_action_at = now
    return ev
