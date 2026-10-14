"""Expired reminders awaiting a human decision (pop-up « Envoyer maintenant ? »).

An automatic reminder that could not go out in its validity window (application closed,
computer off, outage…) is never sent late on its own. Instead, while the appointment is still
active, unconfirmed and far enough ahead, a user is asked whether to send it now.

- Only the most recent expired step of an appointment is proposed: deciding on it settles the
  older expired steps of the same appointment (``superseded``), so one client = one question.
- No question when a later step of the same plan was already sent: the client has been reminded.
- « Envoyer maintenant » re-arms the job for a short window; the engine then re-checks every rule
  (confirmation, opt-out, template, sender, duplicates…) exactly as for any other SMS.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .audit import record
from .models import Appointment, AppointmentStatus, Confirmation, JobStatus, SmsJob, Step
from .policy import Policy

STEP_ORDER = {Step.J2: 0, Step.J1_FIRST: 1, Step.J1_SECOND: 2}


class LateDecisionError(ValueError):
    pass


@dataclass
class LateCandidate:
    job: SmsJob
    appointment: Appointment
    older: list[SmsJob]  # older expired steps settled by the same decision


def _appointment_open(appt: Appointment, policy: Policy, now: datetime) -> bool:
    return (
        appt.status == AppointmentStatus.ACTIVE
        and appt.confirmation == Confirmation.TO_CONFIRM
        and not appt.suspended
        and not appt.resume_pending
        and appt.service is not None
        and appt.appointment_at - timedelta(minutes=policy.min_minutes_before_appointment) > now
    )


def candidates(session: Session, policy: Policy, now: datetime, limit: int = 50) -> list[LateCandidate]:
    appts = session.scalars(
        select(Appointment)
        .options(selectinload(Appointment.jobs))
        .where(Appointment.id.in_(
            select(SmsJob.appointment_id).where(SmsJob.status == JobStatus.EXPIRED, SmsJob.late_decision.is_(None),
                                                SmsJob.step != Step.MANUAL)
        ))
        .order_by(Appointment.appointment_at)
    ).all()
    out: list[LateCandidate] = []
    for appt in appts:
        if not _appointment_open(appt, policy, now):
            continue
        current = [j for j in appt.jobs if j.revision == appt.schedule_revision and j.step in STEP_ORDER]
        expired = sorted((j for j in current if j.status == JobStatus.EXPIRED and j.late_decision is None),
                         key=lambda j: STEP_ORDER[j.step])
        if not expired:
            continue
        latest = expired[-1]
        later_sent = any(STEP_ORDER[j.step] > STEP_ORDER[latest.step] and j.status in JobStatus.DELIVERED_TO_PROVIDER
                         for j in current)
        if later_sent:
            continue
        out.append(LateCandidate(latest, appt, expired[:-1]))
        if len(out) >= limit:
            break
    return out


def decide(session: Session, job_id: int, *, send: bool, actor: str, policy: Policy, now: datetime) -> SmsJob:
    """Record the decision. When ``send`` is true the caller must then run the job
    (``scheduler.execute_job``) so that it goes out immediately, after all checks."""
    match = next((c for c in candidates(session, policy, now, limit=10_000) if c.job.id == job_id), None)
    if match is None:
        raise LateDecisionError("Ce SMS n'est plus en attente de décision (déjà traité, rendez-vous confirmé, annulé ou trop proche).")
    job, appt = match.job, match.appointment
    label = Step.LABELS[job.step]
    for old in match.older:
        old.late_decision, old.late_decided_by, old.late_decided_at = "superseded", actor, now
    job.late_decided_by, job.late_decided_at = actor, now
    if send:
        job.late_decision = "sent"
        limit = appt.appointment_at - timedelta(minutes=policy.min_minutes_before_appointment)
        job.status = JobStatus.SCHEDULED
        job.next_attempt_at = now
        job.expires_at = min(now + timedelta(minutes=policy.grace_minutes_manual), limit)
        job.status_reason = f"envoi tardif validé par {actor}"
        job.error_code = job.error_message = None
        record(session, actor, "late_send_approved", f"{label} expiré : envoi tardif validé.", appointment=appt, job_id=job.id)
    else:
        job.late_decision = "declined"
        record(session, actor, "late_send_declined", f"{label} expiré : envoi tardif refusé.", appointment=appt, job_id=job.id)
    return job
