"""Reminder engine — the mandatory scenarios of the specification (numbered as in §11)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from conftest import PARIS_NOW, all_jobs, jobs_of, make_appt, with_appt

from sms_reminders import appointments as ops
from sms_reminders.db import session_scope
from sms_reminders.models import JobStatus, ServiceConfig, SmsJob, Step, TemplateSlot
from sms_reminders.policy import load_policy, save_policy
from sms_reminders.providers.base import SendResult
from sms_reminders.scheduler import execute_job, recover_stale, run_due

APPT_UTC = datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)  # 17/10/2026 14:00 Paris (CEST)
J2 = APPT_UTC - timedelta(hours=48)
J1A = APPT_UTC - timedelta(hours=24)
J1B = J1A + timedelta(hours=3)


def tick(container, clock, at):
    clock.set(at)
    return run_due(container, at)


# 1
def test_active_unconfirmed_appointment_gets_48h_sms(configured, clock, provider):
    appt = make_appt()
    jobs = jobs_of(appt)
    assert jobs[Step.J2].scheduled_at == J2
    assert tick(configured, clock, J2 - timedelta(minutes=1)) == {"requeued": 0, "uncertain": 0}
    assert provider.calls == []
    tick(configured, clock, J2)
    assert len(provider.calls) == 1
    msg = provider.calls[0]
    assert msg.sender == "+33600000900" and msg.to == "+33600000001"
    assert msg.body.startswith("[j2] Bonjour Marie, rappel : rendez-vous Movers le 17/10/2026 à 14h00")
    job = jobs_of(appt)[Step.J2]
    assert job.status == JobStatus.SENT and job.sent_at == J2 and not job.simulated
    assert job.template_version_id is not None and job.provider_message_id == "MSG1"


# 2 and 3
def test_j1_first_at_24h_and_second_three_hours_later(configured, clock, provider):
    appt = make_appt()
    jobs = jobs_of(appt)
    assert jobs[Step.J1_FIRST].scheduled_at == J1A
    assert jobs[Step.J1_SECOND].scheduled_at == J1B == J1A + timedelta(hours=3)
    tick(configured, clock, J2)
    tick(configured, clock, J1A)
    assert [c.body[:10] for c in provider.calls] == ["[j2] Bonjo", "[j1_first]"]
    tick(configured, clock, J1B - timedelta(seconds=1))
    assert len(provider.calls) == 2
    tick(configured, clock, J1B)
    assert provider.calls[-1].body.startswith("[j1_second]")
    assert {s: j.status for s, j in jobs_of(appt).items()} == {s: JobStatus.SENT for s in Step.AUTOMATIC}


def test_second_sms_anchored_on_actual_send_when_configured(configured, clock, provider):
    with session_scope() as s:
        p = load_policy(s)
        p.j1_second_anchor = "actual_send"
        save_policy(s, p, "test")
    appt = make_appt()
    late = J1A + timedelta(minutes=20)  # worker was down for 20 minutes, still within grace
    tick(configured, clock, late)
    assert jobs_of(appt)[Step.J1_FIRST].status == JobStatus.SENT
    assert jobs_of(appt)[Step.J1_SECOND].scheduled_at == late + timedelta(hours=3)


# 4
def test_confirmed_before_j2_gets_no_reminder(configured, clock, provider):
    appt = make_appt()
    with_appt(appt, lambda s, a, p: ops.confirm(s, a, actor="alice", now=PARIS_NOW))
    for at in (J2, J1A, J1B):
        tick(configured, clock, at)
    assert provider.calls == []
    assert {j.status for j in jobs_of(appt).values()} == {JobStatus.CANCELLED}


def test_confirmed_in_import_never_planned(configured, clock, provider):
    appt = make_appt(confirmed=True)
    assert jobs_of(appt) == {}
    tick(configured, clock, J1B)
    assert provider.calls == []


# 5
def test_confirmed_after_j2_gets_no_j1(configured, clock, provider):
    appt = make_appt()
    tick(configured, clock, J2)
    with_appt(appt, lambda s, a, p: ops.confirm(s, a, actor="alice", now=J2 + timedelta(hours=1)))
    tick(configured, clock, J1A)
    tick(configured, clock, J1B)
    assert len(provider.calls) == 1
    jobs = jobs_of(appt)
    assert jobs[Step.J2].status == JobStatus.SENT
    assert jobs[Step.J1_FIRST].status == jobs[Step.J1_SECOND].status == JobStatus.CANCELLED


# 6
def test_confirmed_between_the_two_j1_sms(configured, clock, provider):
    appt = make_appt()
    tick(configured, clock, J2)
    tick(configured, clock, J1A)
    with_appt(appt, lambda s, a, p: ops.confirm(s, a, actor="alice", now=J1A + timedelta(hours=1)))
    tick(configured, clock, J1B)
    assert len(provider.calls) == 2
    assert jobs_of(appt)[Step.J1_SECOND].status == JobStatus.CANCELLED


def test_confirmation_race_is_rechecked_at_send_time(configured, clock, provider):
    """Even if a job is still 'scheduled' (e.g. confirmation written by another process
    without cancelling jobs), the engine re-checks the appointment before sending."""
    from sms_reminders.models import Appointment, Confirmation

    appt = make_appt()
    with session_scope() as s:
        s.get(Appointment, appt).confirmation = Confirmation.CONFIRMED
    tick(configured, clock, J2)
    assert provider.calls == []
    assert jobs_of(appt)[Step.J2].status == JobStatus.CANCELLED


# 7
def test_cancelled_appointment_gets_no_new_reminder(configured, clock, provider):
    appt = make_appt()
    tick(configured, clock, J2)
    with_appt(appt, lambda s, a, p: ops.cancel_appointment(s, a, reason="client absent", actor="sam", now=J2))
    tick(configured, clock, J1A)
    tick(configured, clock, J1B)
    assert len(provider.calls) == 1
    assert jobs_of(appt)[Step.J1_FIRST].status == JobStatus.CANCELLED


# 8
def test_no_duplicate_after_restart(configured, clock, provider):
    appt = make_appt()
    tick(configured, clock, J2)
    assert len(provider.calls) == 1
    # "Restart": a new container / provider instance, ticks repeated at and after J2.
    for at in (J2, J2 + timedelta(seconds=30), J2 + timedelta(minutes=10)):
        tick(configured, clock, at)
    job_id = jobs_of(appt)[Step.J2].id
    assert execute_job(configured, job_id, J2 + timedelta(minutes=1)) is None
    assert len(provider.calls) == 1


def test_interrupted_during_provider_call_is_never_resent(configured, clock, provider):
    """Crash after the point of no return: the job becomes 'uncertain', not resent."""
    appt = make_appt()
    job_id = jobs_of(appt)[Step.J2].id
    with session_scope() as s:
        job = s.get(SmsJob, job_id)
        job.status, job.claimed_at, job.provider_call_started_at, job.claim_token = JobStatus.SENDING, J2, J2, "dead"
    out = tick(configured, clock, J2 + timedelta(minutes=10))
    assert out["uncertain"] == 1
    assert provider.calls == []
    assert jobs_of(appt)[Step.J2].status == JobStatus.UNCERTAIN
    tick(configured, clock, J2 + timedelta(minutes=20))
    assert provider.calls == []


def test_interrupted_before_provider_call_is_safely_requeued(configured, clock, provider):
    appt = make_appt()
    job_id = jobs_of(appt)[Step.J2].id
    with session_scope() as s:
        job = s.get(SmsJob, job_id)
        job.status, job.claimed_at, job.claim_token = JobStatus.SENDING, J2, "dead"
    out = tick(configured, clock, J2 + timedelta(minutes=6))
    assert out["requeued"] == 1
    assert len(provider.calls) == 1  # re-evaluated, still within its validity window


def test_concurrent_claim_only_one_send(configured, clock, provider):
    appt = make_appt()
    job_id = jobs_of(appt)[Step.J2].id
    clock.set(J2)
    assert execute_job(configured, job_id, J2) == JobStatus.SENT
    assert execute_job(configured, job_id, J2) is None
    assert len(provider.calls) == 1


def test_unique_step_per_plan_revision(configured):
    import pytest
    from sqlalchemy.exc import IntegrityError

    appt = make_appt()
    existing = jobs_of(appt)[Step.J2]
    with pytest.raises(IntegrityError):
        with session_scope() as s:
            s.add(SmsJob(appointment_id=appt, revision=existing.revision, step=Step.J2, template_step=Step.J2,
                         dedup_key=existing.dedup_key, scheduled_at=J2, next_attempt_at=J2, expires_at=J2))


# 9
def test_invalid_phone_blocks_sending(configured, clock, provider):
    appt = make_appt(phone="01 99 00 00 01")  # fixed line: no SMS
    tick(configured, clock, J2)
    job = jobs_of(appt)[Step.J2]
    assert provider.calls == [] and job.status == JobStatus.BLOCKED
    assert "mobile" in job.status_reason


def test_missing_template_blocks_sending(configured, clock, provider):
    with session_scope() as s:
        s.query(TemplateSlot).filter_by(service="movers", step=Step.J2).one().active_version_id = None
    appt = make_appt()
    tick(configured, clock, J2)
    job = jobs_of(appt)[Step.J2]
    assert provider.calls == [] and job.status == JobStatus.BLOCKED
    assert "Template non configuré" in job.status_reason
    # Still blocked at each re-check, then expired: never sent late.
    tick(configured, clock, J2 + timedelta(minutes=30))
    tick(configured, clock, J2 + timedelta(minutes=61))
    assert jobs_of(appt)[Step.J2].status == JobStatus.EXPIRED
    assert provider.calls == []


def test_incomplete_template_data_blocks_sending(configured, clock, provider):
    appt = make_appt(first_name="")  # template uses {{prenom}}
    tick(configured, clock, J2)
    job = jobs_of(appt)[Step.J2]
    assert job.status == JobStatus.BLOCKED and "prenom" in job.status_reason
    assert provider.calls == []


def test_missing_sender_blocks_sending(configured, clock, provider):
    with session_scope() as s:
        s.get(ServiceConfig, "movers").sender_id = None
    appt = make_appt()
    tick(configured, clock, J2)
    assert provider.calls == []
    assert "expédition" in jobs_of(appt)[Step.J2].status_reason


def test_opt_out_number_is_never_texted(configured, clock, provider):
    from sms_reminders.models import BlockedNumber

    with session_scope() as s:
        s.add(BlockedNumber(phone_e164="+33600000001", reason="STOP", source="opt_out", created_by="alice"))
    appt = make_appt()
    tick(configured, clock, J2)
    assert provider.calls == []
    assert jobs_of(appt)[Step.J2].status == JobStatus.CANCELLED


def test_real_sending_requires_compliance_validation(configured, clock, provider):
    with session_scope() as s:
        p = load_policy(s)
        p.compliance_validated = False
        save_policy(s, p, "test")
    appt = make_appt()
    tick(configured, clock, J2)
    assert provider.calls == []
    assert "conformité" in jobs_of(appt)[Step.J2].status_reason


# 10
def test_missing_service_blocks_planning_and_sending(configured, clock, provider):
    appt = make_appt(service=None)
    assert jobs_of(appt) == {}
    tick(configured, clock, J2)
    assert provider.calls == []
    # Defense in depth: a job whose appointment lost its service is blocked at send time.
    from sms_reminders.models import Appointment

    appt2 = make_appt(customer_ref="CLI-2")
    with session_scope() as s:
        s.get(Appointment, appt2).service = None
    tick(configured, clock, J2 + timedelta(minutes=1))
    job = jobs_of(appt2)[Step.J2]
    assert provider.calls == [] and job.status == JobStatus.BLOCKED and "service" in job.status_reason


def test_setting_the_service_later_plans_reminders(configured, clock, provider):
    appt = make_appt(service=None)

    def set_service(s, a, p):
        data = ops.AppointmentData(a.customer_ref, a.first_name, a.last_name, a.phone_raw, a.appointment_date,
                                   a.appointment_time, "takeovers")
        ops.update_appointment(s, a, data, actor="alice", policy=p, now=PARIS_NOW)

    with_appt(appt, set_service)
    assert set(jobs_of(appt)) == set(Step.AUTOMATIC)
    tick(configured, clock, J2)
    assert provider.calls[0].sender == "+33600000901"  # Takeovers sender


# 11
def test_provider_failure_retry_then_success(configured, clock, provider):
    provider.script = [SendResult(ok=False, error_code="503", error_message="unavailable", transient=True)]
    appt = make_appt()
    tick(configured, clock, J2)
    job = jobs_of(appt)[Step.J2]
    assert job.status == JobStatus.RETRY_WAIT and job.next_attempt_at == J2 + timedelta(minutes=2)
    tick(configured, clock, J2 + timedelta(minutes=1))
    assert len(provider.calls) == 1
    tick(configured, clock, J2 + timedelta(minutes=2))
    job = jobs_of(appt)[Step.J2]
    assert job.status == JobStatus.SENT and job.attempts == 2 and len(provider.calls) == 2


def test_provider_failure_exhausted_or_permanent(configured, clock, provider):
    transient = SendResult(ok=False, error_code="503", transient=True)
    provider.script = [transient, transient, transient]
    appt = make_appt()
    for minutes in (0, 2, 12):
        tick(configured, clock, J2 + timedelta(minutes=minutes))
    job = jobs_of(appt)[Step.J2]
    assert job.status == JobStatus.FAILED and job.attempts == 3 and len(provider.calls) == 3
    tick(configured, clock, J2 + timedelta(minutes=50))
    assert len(provider.calls) == 3

    provider.script = [SendResult(ok=False, error_code="21211", error_message="invalid To", transient=False)]
    tick(configured, clock, J1A)
    assert jobs_of(appt)[Step.J1_FIRST].status == JobStatus.FAILED
    assert len(provider.calls) == 4


def test_retry_never_beyond_validity_window(configured, clock, provider):
    provider.script = [SendResult(ok=False, error_code="503", transient=True)]
    appt = make_appt()
    tick(configured, clock, J2 + timedelta(minutes=59))  # retry at +61 min would exceed the 60 min window
    assert jobs_of(appt)[Step.J2].status == JobStatus.FAILED


def test_provider_timeout_is_uncertain_not_retried(configured, clock, provider):
    provider.script = [SendResult(ok=False, error_code="timeout", uncertain=True)]
    appt = make_appt()
    tick(configured, clock, J2)
    tick(configured, clock, J2 + timedelta(minutes=5))
    assert jobs_of(appt)[Step.J2].status == JobStatus.UNCERTAIN
    assert len(provider.calls) == 1


def test_provider_opt_out_adds_number_to_blocked_list(configured, clock, provider):
    from sms_reminders.models import BlockedNumber

    provider.script = [SendResult(ok=False, error_code="21610", opted_out=True)]
    appt = make_appt()
    tick(configured, clock, J2)
    with session_scope() as s:
        assert s.query(BlockedNumber).filter_by(phone_e164="+33600000001").count() == 1
    tick(configured, clock, J1A)
    assert len(provider.calls) == 1
    assert jobs_of(appt)[Step.J1_FIRST].status == JobStatus.CANCELLED


def test_outage_never_sends_late(configured, clock, provider):
    """Worker down from before J2 until after the J2 window: J2 expires, J1 goes normally."""
    appt = make_appt()
    tick(configured, clock, J2 + timedelta(hours=3))
    assert provider.calls == []
    assert jobs_of(appt)[Step.J2].status == JobStatus.EXPIRED
    tick(configured, clock, J1A)
    assert len(provider.calls) == 1


# 13
def test_late_import_no_retroactive_sms(configured, clock, provider):
    now = APPT_UTC - timedelta(hours=30)  # J2 already passed
    clock.set(now)
    appt = make_appt(now=now)
    jobs = jobs_of(appt)
    assert jobs[Step.J2].status == JobStatus.SKIPPED_LATE
    assert jobs[Step.J1_FIRST].status == JobStatus.SCHEDULED
    tick(configured, clock, now)
    assert provider.calls == []
    tick(configured, clock, J1A)
    assert len(provider.calls) == 1 and provider.calls[0].body.startswith("[j1_first]")


def test_late_import_within_grace_only_when_configured(configured, clock, provider):
    with session_scope() as s:
        p = load_policy(s)
        p.late_policy = "send_within_grace"
        save_policy(s, p, "test")
    now = J2 + timedelta(minutes=10)
    clock.set(now)
    appt = make_appt(now=now)
    assert jobs_of(appt)[Step.J2].status == JobStatus.SCHEDULED
    tick(configured, clock, now)
    assert len(provider.calls) == 1
    later = make_appt(customer_ref="CLI-3", now=J2 + timedelta(hours=2))
    assert jobs_of(later)[Step.J2].status == JobStatus.SKIPPED_LATE


# 14
def test_simulated_sms_never_looks_sent(env, clock):
    from sms_reminders.config import get_settings
    from sms_reminders.container import Container
    from sms_reminders.providers.simulation import SimulationProvider
    from sms_reminders.stats import compute

    sim = SimulationProvider()
    c = Container(settings=get_settings(), provider=sim, clock=clock)
    # Configuration identical to `configured`, compliance NOT validated (not needed in simulation).
    with session_scope() as s:
        from sms_reminders.template_admin import activate, save_version

        s.get(ServiceConfig, "movers").sender_id = "SIM"
        policy = load_policy(s)
        for slot in s.query(TemplateSlot).filter_by(service="movers").all():
            activate(s, slot, save_version(s, slot, "Bonjour {{prenom}}", actor="t"), actor="t", policy=policy)
    appt = make_appt()
    clock.set(J2)
    run_due(c, J2)
    job = jobs_of(appt)[Step.J2]
    assert job.status == JobStatus.SIMULATED and job.status != JobStatus.SENT
    assert job.simulated is True and job.provider == "simulation" and job.provider_message_id.startswith("SIM-")
    assert len(sim.outbox) == 1
    with session_scope() as s:
        ind = compute(s, J2 + timedelta(minutes=1))
    assert ind.sms_sent == 0 and ind.sms_simulated == 1


# ------------------------------------------------------------------ unconfirm / resume / edits


def test_unconfirm_does_not_reactivate_automatically(configured, clock, provider):
    appt = make_appt()
    with_appt(appt, lambda s, a, p: ops.confirm(s, a, actor="alice", now=PARIS_NOW))
    with_appt(appt, lambda s, a, p: ops.unconfirm(s, a, actor="alice", now=PARIS_NOW))
    tick(configured, clock, J2)
    assert provider.calls == []
    preview = with_appt(appt, lambda s, a, p: ops.resume_preview(a, p, J2 + timedelta(hours=2)))
    assert [(l.step, l.action) for l in preview] == [(Step.J2, "none"), (Step.J1_FIRST, "resume"), (Step.J1_SECOND, "resume")]
    clock.set(J2 + timedelta(hours=2))
    with_appt(appt, lambda s, a, p: ops.resume(s, a, actor="alice", policy=p, now=J2 + timedelta(hours=2)))
    tick(configured, clock, J1A)
    tick(configured, clock, J1B)
    assert [c.body[:10] for c in provider.calls] == ["[j1_first]", "[j1_second"]
    assert jobs_of(appt)[Step.J2].status == JobStatus.CANCELLED


def test_suspension_then_validated_resume(configured, clock, provider):
    appt = make_appt()
    with_appt(appt, lambda s, a, p: ops.suspend(s, a, reason="litige", actor="alice"))
    tick(configured, clock, J2)
    assert provider.calls == []
    with_appt(appt, lambda s, a, p: ops.resume(s, a, actor="alice", policy=p, now=J2 + timedelta(minutes=5)))
    tick(configured, clock, J1A)
    assert len(provider.calls) == 1


def test_rescheduled_appointment_replans_and_avoids_duplicates(configured, clock, provider):
    appt = make_appt()
    tick(configured, clock, J2)

    def move(s, a, p, hours):
        new = datetime(2026, 10, 17, 14, 0) + timedelta(hours=hours)
        data = ops.AppointmentData(a.customer_ref, a.first_name, a.last_name, a.phone_raw, new.date(), new.time(), a.service)
        ops.update_appointment(s, a, data, actor="alice", policy=p, now=J2 + timedelta(minutes=5))

    with_appt(appt, lambda s, a, p: move(s, a, p, 2))  # moved by two hours
    jobs = all_jobs(appt)
    assert {j.revision for j in jobs} == {1, 2}
    assert all(j.status == JobStatus.CANCELLED for j in jobs if j.revision == 1 and j.step != Step.J2)
    # New J2 (r2) is two hours later: blocked as a duplicate of the J2 already sent 2 h ago.
    tick(configured, clock, J2 + timedelta(hours=2))
    assert len(provider.calls) == 1
    assert jobs_of(appt)[Step.J2].status == JobStatus.CANCELLED
    tick(configured, clock, J1A + timedelta(hours=2))
    assert len(provider.calls) == 2


def test_manual_reminder_rechecks_rules(configured, clock, provider):
    appt = make_appt()
    clock.set(PARIS_NOW)
    job = with_appt(appt, lambda s, a, p: ops.request_manual(s, a, template_step=Step.J1_FIRST, actor="sam", policy=p, now=PARIS_NOW, nonce="n1"))
    again = with_appt(appt, lambda s, a, p: ops.request_manual(s, a, template_step=Step.J1_FIRST, actor="sam", policy=p, now=PARIS_NOW, nonce="n1"))
    assert again.id == job.id  # double submission
    assert execute_job(configured, job.id, PARIS_NOW) == JobStatus.SENT
    second = with_appt(appt, lambda s, a, p: ops.request_manual(s, a, template_step=Step.J2, actor="sam", policy=p, now=PARIS_NOW, nonce="n2"))
    assert execute_job(configured, second.id, PARIS_NOW + timedelta(minutes=5)) == JobStatus.CANCELLED  # minimum interval
    assert len(provider.calls) == 1


# ------------------------------------------------------------------ time zone and boundaries


def test_dst_fall_back_48h_is_absolute_duration(configured):
    """Appointment Tue 27/10/2026 10:00 (CET, UTC+1). Clocks went back on Sun 25/10 at 03:00.
    48 h before = 25/10 10:00 local (UTC+1) = 09:00 UTC; 24 h before = 26/10 10:00 local."""
    appt = make_appt(at_local=datetime(2026, 10, 27, 10, 0))
    jobs = jobs_of(appt)
    assert jobs[Step.J2].scheduled_at == datetime(2026, 10, 25, 9, 0, tzinfo=timezone.utc)
    appt2 = make_appt(at_local=datetime(2026, 10, 26, 10, 0), customer_ref="CLI-9")
    # 48 h before Mon 26/10 10:00 CET (09:00 UTC) = Sat 24/10 09:00 UTC = 11:00 CEST local.
    assert jobs_of(appt2)[Step.J2].scheduled_at == datetime(2026, 10, 24, 9, 0, tzinfo=timezone.utc)
    assert jobs_of(appt2)[Step.J2].scheduled_at.astimezone(__import__("zoneinfo").ZoneInfo("Europe/Paris")).hour == 11


def test_dst_spring_forward_nonexistent_time_rejected():
    import pytest

    from sms_reminders.timeutil import LocalTimeError, local_to_utc

    with pytest.raises(LocalTimeError):
        local_to_utc(datetime(2027, 3, 28).date(), datetime(2027, 3, 28, 2, 30).time())
    utc, warning = local_to_utc(datetime(2026, 10, 25).date(), datetime(2026, 10, 25, 2, 30).time())
    assert warning and utc == datetime(2026, 10, 25, 0, 30, tzinfo=timezone.utc)  # first occurrence (CEST)


def test_exact_boundaries_and_min_lead(configured, clock, provider):
    appt = make_appt()
    tick(configured, clock, J2 - timedelta(microseconds=1))
    assert provider.calls == []
    tick(configured, clock, J2 + timedelta(minutes=60))  # last instant of the window
    assert len(provider.calls) == 1
    # Appointment created 90 minutes before: every step is past or too close.
    now = APPT_UTC - timedelta(minutes=90)
    late = make_appt(customer_ref="CLI-5", now=now)
    assert {j.status for j in jobs_of(late).values()} == {JobStatus.SKIPPED_LATE}
