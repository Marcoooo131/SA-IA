"""Appointment operations: creation, edits, confirmation, suspension, cancellation, resume,
manual reminders, erasure. Every function records history and keeps the plan consistent."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .audit import record
from .models import (
    Appointment,
    AppointmentStatus,
    Confirmation,
    ConfirmationSource,
    Event,
    JobStatus,
    Service,
    SmsJob,
    Step,
)
from .phone import check_mobile
from .policy import Policy
from .scheduler import cancel_pending, plan_appointment, plan_times
from .timeutil import fmt, local_to_utc


class OperationError(ValueError):
    pass


def business_key(external_ref: str | None, customer_ref: str, service: str | None, d: date, t: time) -> str:
    if external_ref and external_ref.strip():
        return "ext:" + external_ref.strip().upper()
    return f"{customer_ref.strip().upper()}|{service or '?'}|{d.isoformat()}T{t:%H:%M}"


@dataclass
class AppointmentData:
    customer_ref: str
    first_name: str
    last_name: str
    phone: str
    appointment_date: date
    appointment_time: time
    service: str | None
    confirmed: bool = False
    external_ref: str | None = None


def create_appointment(
    session: Session, data: AppointmentData, *, actor: str, policy: Policy, now: datetime,
    origin: str = "manual", batch_id: int | None = None,
) -> Appointment:
    at_utc, _ = local_to_utc(data.appointment_date, data.appointment_time)
    phone = check_mobile(data.phone)
    appt = Appointment(
        business_key=business_key(data.external_ref, data.customer_ref, data.service, data.appointment_date, data.appointment_time),
        external_ref=(data.external_ref or None),
        customer_ref=data.customer_ref.strip(), first_name=data.first_name.strip(), last_name=data.last_name.strip(),
        phone_raw=data.phone.strip(), phone_e164=phone.e164, phone_valid=phone.valid,
        appointment_date=data.appointment_date, appointment_time=data.appointment_time, appointment_at=at_utc,
        service=data.service, import_batch_id=batch_id, import_origin=origin, imported_at=now, created_by=actor,
    )
    if data.confirmed:
        appt.confirmation = Confirmation.CONFIRMED
        appt.confirmed_at = now
        appt.confirmed_by = actor
        appt.confirmation_source = ConfirmationSource.IMPORT
    session.add(appt)
    session.flush()
    record(session, actor, "created", f"Rendez-vous enregistré (origine : {origin}).", appointment=appt,
           details={"batch_id": batch_id})
    if data.confirmed:
        record(session, actor, "confirmed", "Statut « confirmé » repris du fichier importé.", appointment=appt)
    plan_appointment(session, appt, policy, now, actor)
    return appt


# ------------------------------------------------------------------ confirmation


def confirm(session: Session, appt: Appointment, *, actor: str, now: datetime) -> int:
    if appt.confirmation == Confirmation.CONFIRMED:
        return 0
    appt.confirmation = Confirmation.CONFIRMED
    appt.confirmed_at = now
    appt.confirmed_by = actor
    # Internal team confirmation: this is NOT a customer answer.
    appt.confirmation_source = ConfirmationSource.TEAM
    appt.resume_pending = False
    cancelled = cancel_pending(session, appt, "rendez-vous confirmé", actor)
    record(session, actor, "confirmed",
           f"Rendez-vous confirmé par l'équipe ({cancelled} relance(s) programmée(s) annulée(s)).", appointment=appt)
    return cancelled


def unconfirm(session: Session, appt: Appointment, *, actor: str, now: datetime) -> None:
    """No automatic reactivation: reminders resume only after an explicit validation."""
    if appt.confirmation != Confirmation.CONFIRMED:
        return
    appt.confirmation = Confirmation.TO_CONFIRM
    appt.confirmed_at = appt.confirmed_by = appt.confirmation_source = None
    appt.resume_pending = appt.status == AppointmentStatus.ACTIVE
    record(session, actor, "unconfirmed",
           "Confirmation retirée. Aucune relance réactivée automatiquement : reprise à valider.", appointment=appt)


# ------------------------------------------------------------------ suspension / cancellation


def suspend(session: Session, appt: Appointment, *, reason: str, actor: str) -> int:
    reason = reason.strip() or "non précisé"
    appt.suspended = True
    appt.suspension_reason = reason[:255]
    n = cancel_pending(session, appt, f"relances suspendues ({reason})", actor)
    record(session, actor, "suspended", f"Relances suspendues : {reason}.", appointment=appt)
    return n


def cancel_appointment(session: Session, appt: Appointment, *, reason: str, actor: str, now: datetime) -> int:
    reason = reason.strip() or "non précisé"
    appt.status = AppointmentStatus.CANCELLED
    appt.cancellation_reason = reason[:255]
    appt.cancelled_at = now
    appt.cancelled_by = actor
    appt.resume_pending = False
    n = cancel_pending(session, appt, "rendez-vous annulé", actor)
    record(session, actor, "cancelled", f"Rendez-vous annulé : {reason}.", appointment=appt)
    return n


def reactivate(session: Session, appt: Appointment, *, actor: str) -> None:
    if appt.status != AppointmentStatus.CANCELLED:
        return
    appt.status = AppointmentStatus.ACTIVE
    appt.cancellation_reason = appt.cancelled_at = appt.cancelled_by = None
    appt.resume_pending = True
    record(session, actor, "reactivated", "Rendez-vous réactivé. Reprise des relances à valider.", appointment=appt)


# ------------------------------------------------------------------ resume


@dataclass
class ResumeLine:
    step: str
    scheduled_at: datetime
    action: str  # resume | keep | none
    reason: str


def resume_preview(appt: Appointment, policy: Policy, now: datetime) -> list[ResumeLine]:
    lines = []
    for step, (scheduled_at, expires_at) in plan_times(appt.appointment_at, policy).items():
        job = appt.job_for(step)
        if job and job.status in JobStatus.DELIVERED_TO_PROVIDER + (JobStatus.FAILED,):
            lines.append(ResumeLine(step, scheduled_at, "none", "déjà traité : " + job.status))
        elif job and job.status in JobStatus.PENDING:
            lines.append(ResumeLine(step, scheduled_at, "keep", "déjà programmé"))
        elif scheduled_at > now:
            lines.append(ResumeLine(step, scheduled_at, "resume", f"sera programmé pour le {fmt(scheduled_at)}"))
        elif now <= expires_at and policy.late_policy == "send_within_grace":
            lines.append(ResumeLine(step, scheduled_at, "resume", "échéance passée mais dans la fenêtre de validité : envoi immédiat"))
        else:
            lines.append(ResumeLine(step, scheduled_at, "none", "échéance passée : ne sera pas envoyé"))
    return lines


def resume(session: Session, appt: Appointment, *, actor: str, policy: Policy, now: datetime) -> int:
    """Explicit, validated resume: only steps still relevant are (re)programmed."""
    if appt.status != AppointmentStatus.ACTIVE:
        raise OperationError("Le rendez-vous est annulé : réactivez-le d'abord.")
    if appt.confirmation == Confirmation.CONFIRMED:
        raise OperationError("Le rendez-vous est confirmé : aucune relance n'est nécessaire.")
    if appt.service not in Service.ALL:
        raise OperationError("Service non renseigné : les relances ne peuvent pas être programmées.")
    appt.suspended = False
    appt.suspension_reason = None
    appt.resume_pending = False
    times = plan_times(appt.appointment_at, policy)
    resumed = 0
    for line in resume_preview(appt, policy, now):
        if line.action != "resume":
            continue
        scheduled_at, expires_at = times[line.step]
        job = appt.job_for(line.step)
        if job is None:
            continue  # created by plan_appointment below
        job.status = JobStatus.SCHEDULED
        job.scheduled_at, job.expires_at = scheduled_at, expires_at
        job.next_attempt_at = max(scheduled_at, now)
        job.status_reason = f"reprise validée par {actor}"
        job.error_code = job.error_message = None
        resumed += 1
    created = plan_appointment(session, appt, policy, now, actor)
    resumed += sum(1 for j in created if j.status == JobStatus.SCHEDULED)
    record(session, actor, "resumed", f"Reprise des relances validée : {resumed} étape(s) programmée(s).", appointment=appt)
    return resumed


# ------------------------------------------------------------------ edits


EDITABLE = ("customer_ref", "first_name", "last_name", "phone", "appointment_date", "appointment_time", "service", "external_ref")
FIELD_LABELS = {
    "customer_ref": "numéro client", "first_name": "prénom", "last_name": "nom", "phone": "téléphone",
    "appointment_date": "date", "appointment_time": "heure", "service": "service", "external_ref": "identifiant rendez-vous",
}


def update_appointment(session: Session, appt: Appointment, data: AppointmentData, *, actor: str, policy: Policy, now: datetime) -> list[str]:
    current = {
        "customer_ref": appt.customer_ref, "first_name": appt.first_name, "last_name": appt.last_name,
        "phone": appt.phone_raw, "appointment_date": appt.appointment_date, "appointment_time": appt.appointment_time,
        "service": appt.service, "external_ref": appt.external_ref,
    }
    new = {
        "customer_ref": data.customer_ref.strip(), "first_name": data.first_name.strip(), "last_name": data.last_name.strip(),
        "phone": data.phone.strip(), "appointment_date": data.appointment_date, "appointment_time": data.appointment_time,
        "service": data.service, "external_ref": (data.external_ref or "").strip() or None,
    }
    changed = [k for k in EDITABLE if current[k] != new[k]]
    if not changed:
        return []
    at_utc, _ = local_to_utc(new["appointment_date"], new["appointment_time"])
    key = business_key(new["external_ref"], new["customer_ref"], new["service"], new["appointment_date"], new["appointment_time"])
    if key != appt.business_key and session.scalar(select(Appointment.id).where(Appointment.business_key == key, Appointment.id != appt.id)):
        raise OperationError("Un autre rendez-vous identique existe déjà (même identifiant, client, service, date et heure).")
    phone = check_mobile(new["phone"])
    appt.customer_ref, appt.first_name, appt.last_name = new["customer_ref"], new["first_name"], new["last_name"]
    appt.phone_raw, appt.phone_e164, appt.phone_valid = new["phone"], phone.e164, phone.valid
    appt.external_ref, appt.business_key = new["external_ref"], key
    replan = any(k in changed for k in ("appointment_date", "appointment_time", "service"))
    if replan:
        appt.appointment_date, appt.appointment_time, appt.appointment_at = new["appointment_date"], new["appointment_time"], at_utc
        appt.service = new["service"]
        cancel_pending(session, appt, "rendez-vous modifié", actor)
        appt.schedule_revision += 1
    # Only field names are logged: values are personal data visible on the record itself.
    record(session, actor, "updated", "Modification : " + ", ".join(FIELD_LABELS[k] for k in changed) + ".",
           appointment=appt, details={"fields": changed})
    if replan:
        session.flush()
        session.refresh(appt, ["jobs"])
        plan_appointment(session, appt, policy, now, actor)
    return changed


# ------------------------------------------------------------------ manual reminder


def request_manual(session: Session, appt: Appointment, *, template_step: str, actor: str, policy: Policy, now: datetime, nonce: str) -> SmsJob:
    """Create a manual reminder job due now. The engine re-checks every rule before sending."""
    if template_step not in Step.AUTOMATIC:
        raise OperationError("Template inconnu.")
    key = f"{appt.id}:manual:{nonce}"
    existing = session.scalar(select(SmsJob).where(SmsJob.dedup_key == key))
    if existing:
        return existing  # double click / resubmission
    if appt.status != AppointmentStatus.ACTIVE or appt.confirmation == Confirmation.CONFIRMED or appt.suspended:
        raise OperationError("Relance impossible : rendez-vous annulé, confirmé ou relances suspendues.")
    if now >= appt.appointment_at - timedelta(minutes=policy.min_minutes_before_appointment):
        raise OperationError("Relance impossible : rendez-vous passé ou trop proche.")
    job = SmsJob(
        appointment_id=appt.id, revision=appt.schedule_revision, step=Step.MANUAL, template_step=template_step,
        dedup_key=key, scheduled_at=now, next_attempt_at=now,
        expires_at=now + timedelta(minutes=policy.grace_minutes_manual), created_by=actor,
    )
    session.add(job)
    session.flush()
    record(session, actor, "manual_requested", f"Relance manuelle demandée (template {Step.LABELS[template_step]}).",
           appointment=appt, job_id=job.id)
    return job


# ------------------------------------------------------------------ erasure


def delete_appointment(session: Session, appt: Appointment, *, actor: str, reason: str) -> None:
    """Right to erasure / data minimisation: removes the record, its jobs and its history.
    The audit entry keeps only the technical id."""
    appt_id = appt.id
    session.delete(appt)
    session.flush()
    session.add(Event(actor=actor, kind="appointment_deleted", appointment_id=None,
                      message=f"Rendez-vous #{appt_id} et son historique supprimés ({reason[:200] or 'non précisé'}).",
                      details={"appointment_id": appt_id}))
