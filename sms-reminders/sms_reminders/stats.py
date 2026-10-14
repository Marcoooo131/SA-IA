"""Dashboard indicators. Every figure has an explicit definition shown in the UI."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Appointment, AppointmentStatus, Confirmation, JobStatus, SmsJob


@dataclass
class Indicators:
    period_days: int
    upcoming: int
    upcoming_to_confirm: int
    upcoming_confirmed: int
    sms_scheduled: int
    sms_sent: int
    sms_simulated: int
    sms_errors: int
    sms_expired: int
    rate_denominator: int
    rate_numerator: int

    @property
    def confirmation_rate(self) -> float | None:
        return self.rate_numerator / self.rate_denominator if self.rate_denominator else None


def compute(session: Session, now: datetime, *, service: str | None = None, period_days: int = 30) -> Indicators:
    start = now - timedelta(days=period_days)

    def appts(*conds):
        q = select(func.count(Appointment.id)).where(*conds)
        if service:
            q = q.where(Appointment.service == service)
        return session.scalar(q) or 0

    def jobs(*conds):
        q = select(func.count(SmsJob.id)).join(Appointment).where(*conds)
        if service:
            q = q.where(Appointment.service == service)
        return session.scalar(q) or 0

    active = Appointment.status == AppointmentStatus.ACTIVE
    future = Appointment.appointment_at >= now
    return Indicators(
        period_days=period_days,
        upcoming=appts(active, future),
        upcoming_to_confirm=appts(active, future, Appointment.confirmation == Confirmation.TO_CONFIRM),
        upcoming_confirmed=appts(active, future, Appointment.confirmation == Confirmation.CONFIRMED),
        sms_scheduled=jobs(SmsJob.status.in_((JobStatus.SCHEDULED, JobStatus.RETRY_WAIT))),
        sms_sent=jobs(SmsJob.status == JobStatus.SENT, SmsJob.sent_at >= start),
        sms_simulated=jobs(SmsJob.status == JobStatus.SIMULATED, SmsJob.sent_at >= start),
        sms_errors=jobs(SmsJob.status.in_((JobStatus.FAILED, JobStatus.BLOCKED, JobStatus.UNCERTAIN)), SmsJob.scheduled_at >= start),
        sms_expired=jobs(SmsJob.status == JobStatus.EXPIRED, SmsJob.scheduled_at >= start),
        # Rate: appointments whose date is within the last N days (already past), not cancelled.
        rate_denominator=appts(active, Appointment.appointment_at >= start, Appointment.appointment_at < now),
        rate_numerator=appts(active, Appointment.appointment_at >= start, Appointment.appointment_at < now,
                             Appointment.confirmation == Confirmation.CONFIRMED),
    )
