"""Data retention: appointments (with their SMS and history) are deleted a configurable number
of days after the appointment date; raw import files are purged after a few hours."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select

from .db import session_scope
from .importer import purge_stale_batches
from .models import Appointment, Event, utcnow
from .policy import load_policy


def purge_expired(now=None) -> dict[str, int]:
    now = now or utcnow()
    with session_scope() as s:
        policy = load_policy(s)
        cutoff = now - timedelta(days=policy.retention_days)
        old = s.scalars(select(Appointment).where(Appointment.appointment_at < cutoff)).all()
        for appt in old:
            s.delete(appt)
        batches = purge_stale_batches(s, policy.import_retention_hours)
        s.flush()
        if old or batches:
            s.add(Event(actor="système", kind="retention_purge",
                        message=f"Purge de conservation : {len(old)} rendez-vous supprimés, {batches} fichiers d'import purgés.",
                        details={"appointments": len(old), "import_batches": batches, "retention_days": policy.retention_days}))
    return {"appointments": len(old), "import_batches": batches}
