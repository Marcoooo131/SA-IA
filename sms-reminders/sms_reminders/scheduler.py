"""Reminder engine: planning, eligibility checks, execution, recovery.

Guarantees
- One row per (appointment, plan revision, step): ``sms_job.dedup_key`` is UNIQUE, so a step
  can never be planned — hence sent — twice, even after a restart or a re-import.
- A job is claimed atomically (``UPDATE … WHERE status IN pending``) before any work: two
  workers can never send the same job.
- Every rule is re-checked at send time (confirmation, cancellation, suspension, phone,
  opt-out, service, sender, template, validity window): planning is never trusted blindly.
- The provider call happens only after ``provider_call_started_at`` is committed. A worker that
  dies afterwards leaves the job ``uncertain``: it is shown for verification and NEVER resent
  automatically (a missing SMS is preferred to a duplicate).
- A job is never sent after ``expires_at`` (scheduled time + grace, and never closer to the
  appointment than the configured minimum): no silent late sending after an outage.
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .audit import record
from .db import session_scope
from .models import (
    Appointment,
    AppointmentStatus,
    BlockedNumber,
    Confirmation,
    JobStatus,
    Service,
    ServiceConfig,
    SmsJob,
    Step,
    TemplateSlot,
)
from .phone import check_mobile
from .policy import Policy, load_policy
from .providers import OutboundSms
from .templating import context_for, render, validate
from .timeutil import PARIS, fmt

log = logging.getLogger(__name__)
SYSTEM = "système"


# ------------------------------------------------------------------ planning


def dedup_key(appointment_id: int, revision: int, step: str) -> str:
    return f"{appointment_id}:r{revision}:{step}"


def plan_times(appointment_at: datetime, policy: Policy) -> dict[str, tuple[datetime, datetime]]:
    """Theoretical (scheduled_at, expires_at) of each automatic step, in UTC."""
    limit = appointment_at - timedelta(minutes=policy.min_minutes_before_appointment)
    j2 = appointment_at - timedelta(hours=policy.j2_hours_before)
    j1a = appointment_at - timedelta(hours=policy.j1_hours_before)
    j1b = j1a + timedelta(minutes=policy.j1_second_delay_minutes)
    out = {}
    for step, at in ((Step.J2, j2), (Step.J1_FIRST, j1a), (Step.J1_SECOND, j1b)):
        out[step] = (at, min(at + timedelta(minutes=policy.grace_minutes(step)), limit))
    return out


def planning_blocker(appt: Appointment) -> str | None:
    """Why reminders cannot be planned for this appointment (None = they can)."""
    if appt.status == AppointmentStatus.CANCELLED:
        return "rendez-vous annulé"
    if appt.confirmation == Confirmation.CONFIRMED:
        return "rendez-vous confirmé"
    if appt.suspended:
        return "relances suspendues"
    if appt.resume_pending:
        return "reprise des relances à valider"
    if appt.service not in Service.ALL:
        return "service non renseigné (Movers ou Takeovers obligatoire)"
    return None


def plan_appointment(session: Session, appt: Appointment, policy: Policy, now: datetime, actor: str) -> list[SmsJob]:
    """Create the missing jobs of the current plan revision. Idempotent."""
    blocker = planning_blocker(appt)
    if blocker:
        record(session, actor, "planning_skipped", f"Relances non programmées : {blocker}.", appointment=appt)
        return []
    session.flush()  # appointment id
    existing = {j.dedup_key for j in session.scalars(select(SmsJob).where(SmsJob.appointment_id == appt.id))}
    created = []
    for step, (scheduled_at, expires_at) in plan_times(appt.appointment_at, policy).items():
        key = dedup_key(appt.id, appt.schedule_revision, step)
        if key in existing:
            continue
        job = SmsJob(
            appointment_id=appt.id, revision=appt.schedule_revision, step=step, template_step=step,
            dedup_key=key, scheduled_at=scheduled_at, next_attempt_at=scheduled_at, expires_at=expires_at,
            created_by=actor,
        )
        if scheduled_at < now:
            if policy.late_policy == "send_within_grace" and now <= expires_at:
                job.next_attempt_at = now
                job.status_reason = "Programmé après l'échéance : envoi autorisé dans la fenêtre de validité (règle configurée)."
            else:
                job.status = JobStatus.SKIPPED_LATE
                job.status_reason = "Échéance déjà passée lors de la programmation : aucun envoi rétroactif."
        session.add(job)
        created.append(job)
    session.flush()
    if created:
        planned = [j for j in created if j.status == JobStatus.SCHEDULED]
        skipped = [j for j in created if j.status == JobStatus.SKIPPED_LATE]
        msg = f"{len(planned)} relance(s) programmée(s)"
        if skipped:
            msg += f", {len(skipped)} non envoyée(s) car échéance déjà passée"
        record(session, actor, "planned", msg + ".", appointment=appt,
               details={"revision": appt.schedule_revision, "steps": {j.step: j.status for j in created}})
    return created


def cancel_pending(session: Session, appt: Appointment, reason: str, actor: str) -> int:
    count = 0
    for job in appt.jobs:
        if job.status in JobStatus.PENDING:
            job.status = JobStatus.CANCELLED
            job.status_reason = reason
            count += 1
            record(session, actor, "job_cancelled", f"{Step.LABELS[job.step]} annulé : {reason}.",
                   appointment=appt, job_id=job.id, touch=False)
    return count


# ------------------------------------------------------------------ eligibility


@dataclass
class Decision:
    action: str  # send | cancel | block | expire | postpone
    reason: str = ""
    sender: str | None = None
    to: str | None = None
    body: str | None = None
    segments: int | None = None
    template_version_id: int | None = None
    postpone_to: datetime | None = None


def evaluate(session: Session, job: SmsJob, appt: Appointment, policy: Policy, provider, now: datetime) -> Decision:
    """All checks made immediately before sending. Order matters: 'no longer relevant'
    reasons first, then the validity window, then configuration / data problems."""
    manual = job.step == Step.MANUAL
    if not manual and job.revision != appt.schedule_revision:
        return Decision("cancel", "rendez-vous modifié depuis la programmation")
    if appt.status == AppointmentStatus.CANCELLED:
        return Decision("cancel", "rendez-vous annulé")
    if appt.confirmation == Confirmation.CONFIRMED:
        return Decision("cancel", "rendez-vous confirmé")
    if appt.suspended:
        return Decision("cancel", "relances suspendues")
    if appt.resume_pending and not manual:
        return Decision("cancel", "reprise des relances à valider")
    if now > job.expires_at:
        return Decision("expire", f"non envoyé dans sa fenêtre de validité (jusqu'au {fmt(job.expires_at)})")
    if now >= appt.appointment_at - timedelta(minutes=policy.min_minutes_before_appointment):
        return Decision("expire", "trop proche de l'heure du rendez-vous")

    # Duplicate protection beyond the unique key (e.g. same step of an older plan revision).
    window_start = now - timedelta(hours=policy.duplicate_window_hours)
    for other in appt.jobs:
        if other.id == job.id or other.status not in JobStatus.DELIVERED_TO_PROVIDER or not other.sent_at:
            continue
        if manual and other.sent_at >= now - timedelta(minutes=policy.manual_min_interval_minutes):
            return Decision("cancel", f"un SMS a déjà été envoyé à {fmt(other.sent_at)} (intervalle minimal)")
        if not manual and other.step == job.step and other.sent_at >= window_start:
            return Decision("cancel", f"un SMS identique a déjà été envoyé pour cette étape le {fmt(other.sent_at)}")

    if not policy.sending_enabled:
        return Decision("block", "envois désactivés par un administrateur")
    if appt.service not in Service.ALL:
        return Decision("block", "service non renseigné : aucun numéro d'expédition ne peut être choisi")
    service_cfg = session.get(ServiceConfig, appt.service)
    if service_cfg is None or not service_cfg.enabled:
        return Decision("block", f"envois {Service.LABELS[appt.service]} désactivés")
    if not service_cfg.sender_id:
        return Decision("block", f"numéro d'expédition {Service.LABELS[appt.service]} non configuré")
    phone = check_mobile(appt.phone_raw)
    if not phone.valid:
        return Decision("block", phone.error or "numéro invalide")
    if session.scalar(select(BlockedNumber.id).where(BlockedNumber.phone_e164 == phone.e164)):
        return Decision("cancel", "numéro en liste d'opposition (désinscription ou numéro interdit)")
    if not getattr(provider, "ready", True):
        return Decision("block", "identifiants du fournisseur SMS manquants (Paramètres → Fournisseur SMS)")
    if provider.name == "disabled":
        return Decision("block", "aucun fournisseur SMS configuré")
    if not provider.simulated and not policy.compliance_validated:
        return Decision("block", "validation de conformité non enregistrée par un administrateur")

    slot = session.scalar(
        select(TemplateSlot).where(TemplateSlot.service == appt.service, TemplateSlot.step == job.template_step)
    )
    version = slot.active_version if slot else None
    if version is None:
        return Decision("block", f"Template non configuré ({Service.LABELS[appt.service]} — {Step.LABELS[job.template_step]})")
    errors = validate(version.body, policy.max_segments)
    if errors:
        return Decision("block", "template invalide : " + " ".join(errors))
    rendered = render(version.body, context_for(appt))
    if rendered.missing:
        return Decision("block", "données manquantes pour le template : " + ", ".join(rendered.missing))

    local = now.astimezone(PARIS)
    if policy.in_quiet_hours(local):
        end = local.replace(hour=policy.quiet_end.hour, minute=policy.quiet_end.minute, second=0, microsecond=0)
        if end <= local:
            end += timedelta(days=1)
        if end > job.expires_at:
            return Decision("expire", "plage horaire sans envoi jusqu'après la fin de la fenêtre de validité")
        return Decision("postpone", "plage horaire sans envoi", postpone_to=end)

    return Decision(
        "send", sender=service_cfg.sender_id, to=phone.e164, body=rendered.text,
        segments=rendered.info.segments, template_version_id=version.id,
    )


# ------------------------------------------------------------------ execution


def _status_callback_url(container) -> str | None:
    base = container.settings.public_base_url.rstrip("/")
    return f"{base}/webhooks/sms/{container.provider.name}/status" if base and not container.provider.simulated else None


def _lock_appointment(session: Session, appointment_id: int) -> Appointment:
    stmt = select(Appointment).where(Appointment.id == appointment_id)
    if session.get_bind().dialect.name == "postgresql":
        stmt = stmt.with_for_update()
    return session.scalars(stmt).one()


def execute_job(container, job_id: int, now: datetime | None = None) -> str | None:
    """Evaluate and, if everything is valid, send one job. Returns the final status, or None
    if the job was not claimable (already handled, not due, or claimed by another worker)."""
    now = now or container.now()
    token = secrets.token_hex(16)
    with session_scope() as s:
        claimed = s.execute(
            update(SmsJob)
            .where(SmsJob.id == job_id, SmsJob.status.in_(JobStatus.PENDING), SmsJob.next_attempt_at <= now)
            .values(status=JobStatus.SENDING, claim_token=token, claimed_at=now)
        ).rowcount
    if not claimed:
        return None

    provider = container.provider
    with session_scope() as s:
        job = s.get(SmsJob, job_id)
        appt = _lock_appointment(s, job.appointment_id)
        policy = load_policy(s)
        decision = evaluate(s, job, appt, policy, provider, now)
        label = Step.LABELS[job.step]
        if decision.action != "send":
            already_reported = job.error_code == "blocked" and job.status_reason == decision.reason
            job.claim_token = None
            job.status_reason = decision.reason
            if decision.action == "cancel":
                job.status = JobStatus.CANCELLED
                record(s, SYSTEM, "job_cancelled", f"{label} non envoyé : {decision.reason}.", appointment=appt, job_id=job.id)
            elif decision.action == "expire":
                job.status = JobStatus.EXPIRED
                record(s, SYSTEM, "job_expired", f"{label} expiré : {decision.reason}.", appointment=appt, job_id=job.id)
            elif decision.action == "postpone":
                job.status = JobStatus.SCHEDULED
                job.next_attempt_at = decision.postpone_to
            else:
                job.status = JobStatus.BLOCKED
                job.error_code = "blocked"
                job.next_attempt_at = now + timedelta(minutes=policy.blocked_recheck_minutes)
                if not already_reported:
                    record(s, SYSTEM, "job_blocked", f"{label} bloqué : {decision.reason}.", appointment=appt, job_id=job.id)
            return job.status
        # Point of no return: once committed, a crash leaves the job "uncertain", never resent.
        job.provider_call_started_at = now
        job.attempts += 1
        job.provider = provider.name
        job.sender, job.recipient, job.body = decision.sender, decision.to, decision.body
        job.segments, job.template_version_id = decision.segments, decision.template_version_id
        message = OutboundSms(decision.sender, decision.to, decision.body, job.dedup_key, _status_callback_url(container))

    try:
        result = provider.send(message)
    except Exception as exc:  # unknown state: the request may have reached the provider
        log.exception("provider error for job %s", job_id)
        from .providers import SendResult

        result = SendResult(ok=False, error_code="exception", error_message=type(exc).__name__, uncertain=True)

    with session_scope() as s:
        job = s.get(SmsJob, job_id)
        appt = s.get(Appointment, job.appointment_id)
        if job.claim_token != token:
            log.warning("job %s: claim lost before recording the provider result", job_id)
            return job.status
        policy = load_policy(s)
        label = Step.LABELS[job.step]
        job.claim_token = None
        job.provider_call_started_at = None
        if result.ok:
            job.status = JobStatus.SIMULATED if provider.simulated else JobStatus.SENT
            job.simulated = provider.simulated
            job.sent_at = now
            job.provider_message_id = result.provider_message_id
            job.error_code = job.error_message = job.status_reason = None
            if provider.simulated:
                record(s, SYSTEM, "sms_simulated", f"{label} SIMULÉ — aucun SMS réel envoyé.", appointment=appt, job_id=job.id)
            else:
                record(s, SYSTEM, "sms_sent", f"{label} envoyé au fournisseur ({provider.name}).", appointment=appt, job_id=job.id)
            if job.step == Step.J1_FIRST and policy.j1_second_anchor == "actual_send":
                _reanchor_second(s, appt, policy, now)
            return job.status
        job.error_code = result.error_code
        job.error_message = (result.error_message or "")[:500]
        if result.uncertain:
            job.status = JobStatus.UNCERTAIN
            job.provider_call_started_at = now
            job.status_reason = "réponse du fournisseur inconnue : vérifier avant toute relance"
            record(s, SYSTEM, "sms_uncertain", f"{label} : résultat inconnu ({result.error_code}), aucune nouvelle tentative automatique.",
                   appointment=appt, job_id=job.id)
            return job.status
        if result.opted_out and job.recipient:
            if not s.scalar(select(BlockedNumber.id).where(BlockedNumber.phone_e164 == job.recipient)):
                s.add(BlockedNumber(phone_e164=job.recipient, reason="Opposition signalée par le fournisseur", source="provider", created_by=SYSTEM))
        retry_at = now + timedelta(minutes=policy.retry_delay(job.attempts))
        if result.transient and job.attempts < policy.max_attempts and retry_at <= job.expires_at:
            job.status = JobStatus.RETRY_WAIT
            job.next_attempt_at = retry_at
            job.status_reason = f"erreur temporaire, nouvelle tentative à {fmt(retry_at)}"
            record(s, SYSTEM, "sms_retry", f"{label} : échec temporaire ({result.error_code}), nouvelle tentative prévue à {fmt(retry_at)}.",
                   appointment=appt, job_id=job.id)
        else:
            job.status = JobStatus.FAILED
            why = "échec définitif" if not result.transient else "nombre de tentatives ou fenêtre de validité épuisé"
            job.status_reason = why
            record(s, SYSTEM, "sms_failed", f"{label} en erreur ({result.error_code}) : {why}.", appointment=appt, job_id=job.id)
        return job.status


def _reanchor_second(session: Session, appt: Appointment, policy: Policy, sent_at: datetime) -> None:
    second = appt.job_for(Step.J1_SECOND)
    if second is None or second.status not in JobStatus.PENDING:
        return
    at = sent_at + timedelta(minutes=policy.j1_second_delay_minutes)
    limit = appt.appointment_at - timedelta(minutes=policy.min_minutes_before_appointment)
    second.scheduled_at = second.next_attempt_at = at
    second.expires_at = min(at + timedelta(minutes=policy.grace_minutes_j1_second), limit)


def recover_stale(container, now: datetime | None = None) -> dict[str, int]:
    """After a crash / restart: jobs stuck in 'sending' beyond the lease."""
    now = now or container.now()
    cutoff = now - timedelta(seconds=container.settings.worker_lease_seconds)
    out = {"requeued": 0, "uncertain": 0}
    with session_scope() as s:
        stale = s.scalars(select(SmsJob).where(SmsJob.status == JobStatus.SENDING, SmsJob.claimed_at < cutoff)).all()
        for job in stale:
            appt = s.get(Appointment, job.appointment_id)
            job.claim_token = None
            if job.provider_call_started_at is None:
                # The provider was never called: safe to evaluate again (all rules re-checked).
                job.status = JobStatus.SCHEDULED
                out["requeued"] += 1
            else:
                job.status = JobStatus.UNCERTAIN
                job.status_reason = "envoi interrompu (redémarrage) : vérifier auprès du fournisseur, jamais renvoyé automatiquement"
                record(s, SYSTEM, "sms_uncertain", f"{Step.LABELS[job.step]} : envoi interrompu, à vérifier.", appointment=appt, job_id=job.id)
                out["uncertain"] += 1
    return out


def run_due(container, now: datetime | None = None, limit: int = 500) -> dict[str, int]:
    """One scheduler tick: recover interrupted jobs, then execute every due job."""
    now = now or container.now()
    stats = recover_stale(container, now)
    with session_scope() as s:
        ids = s.scalars(
            select(SmsJob.id)
            .where(SmsJob.status.in_(JobStatus.PENDING), SmsJob.next_attempt_at <= now)
            .order_by(SmsJob.next_attempt_at)
            .limit(limit)
        ).all()
    for job_id in ids:
        status = execute_job(container, job_id, now)
        if status:
            stats[status] = stats.get(status, 0) + 1
    return stats
