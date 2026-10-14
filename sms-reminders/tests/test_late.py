"""Expired reminders: pop-up candidates and decisions."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from conftest import PARIS_NOW, jobs_of, make_appt, with_appt

from sms_reminders import appointments as ops
from sms_reminders import late
from sms_reminders.db import session_scope
from sms_reminders.models import JobStatus, Step
from sms_reminders.policy import load_policy
from sms_reminders.scheduler import execute_job, run_due

APPT_UTC = datetime(2026, 10, 17, 12, 0, tzinfo=timezone.utc)
J2 = APPT_UTC - timedelta(hours=48)
J1A = APPT_UTC - timedelta(hours=24)


def cands(now):
    with session_scope() as s:
        return [(c.job.step, c.appointment.id, [o.step for o in c.older]) for c in late.candidates(s, load_policy(s), now)]


def decide(job_id, send, now):
    with session_scope() as s:
        return late.decide(s, job_id, send=send, actor="sam", policy=load_policy(s), now=now)


def test_expired_unconfirmed_is_proposed_and_sent_on_request(configured, clock, provider):
    appt = make_appt()
    now = J2 + timedelta(hours=3)  # application was closed during the J2 window
    clock.set(now)
    run_due(configured, now)
    assert jobs_of(appt)[Step.J2].status == JobStatus.EXPIRED and provider.calls == []
    assert cands(now) == [(Step.J2, appt, [])]
    job = decide(jobs_of(appt)[Step.J2].id, True, now)
    assert execute_job(configured, job.id, now) == JobStatus.SENT
    j = jobs_of(appt)[Step.J2]
    assert len(provider.calls) == 1 and j.late_decision == "sent" and j.late_decided_by == "sam" and j.sent_at == now
    assert cands(now) == []
    run_due(configured, J1A)  # the J-1 cycle goes on normally
    assert len(provider.calls) == 2


def test_declined_is_never_sent_and_not_asked_again(configured, clock, provider):
    appt = make_appt()
    now = J2 + timedelta(hours=3)
    run_due(configured, now)
    decide(jobs_of(appt)[Step.J2].id, False, now)
    run_due(configured, now + timedelta(minutes=5))
    assert provider.calls == [] and cands(now) == []
    assert jobs_of(appt)[Step.J2].late_decision == "declined"


def test_confirmed_cancelled_or_suspended_are_not_proposed(configured, clock):
    a1, a2, a3 = make_appt(), make_appt(customer_ref="C2"), make_appt(customer_ref="C3")
    now = J2 + timedelta(hours=3)
    run_due(configured, now)
    assert len(cands(now)) == 3
    with_appt(a1, lambda s, a, p: ops.confirm(s, a, actor="alice", now=now))
    with_appt(a2, lambda s, a, p: ops.cancel_appointment(s, a, reason="x", actor="sam", now=now))
    with_appt(a3, lambda s, a, p: ops.suspend(s, a, reason="x", actor="alice"))
    assert cands(now) == []
    with pytest.raises(late.LateDecisionError):
        decide(jobs_of(a1)[Step.J2].id, True, now)


def test_one_question_per_client_latest_step(configured, clock, provider):
    appt = make_appt()
    now = J1A + timedelta(hours=2)  # closed for two days: J2 and 1st J-1 expired
    run_due(configured, now)
    assert cands(now) == [(Step.J1_FIRST, appt, [Step.J2])]
    decide(jobs_of(appt)[Step.J1_FIRST].id, False, now)
    jobs = jobs_of(appt)
    assert jobs[Step.J2].late_decision == "superseded" and cands(now) == []


def test_no_question_when_a_later_step_was_sent(configured, clock, provider):
    appt = make_appt()
    run_due(configured, J1A)  # J2 expired (never ran at J2), J1 first sent at its time
    assert jobs_of(appt)[Step.J2].status == JobStatus.EXPIRED
    assert jobs_of(appt)[Step.J1_FIRST].status == JobStatus.SENT
    assert cands(J1A) == []


def test_not_proposed_too_close_to_the_appointment(configured, clock):
    make_appt()
    run_due(configured, J2 + timedelta(hours=3))
    assert cands(APPT_UTC - timedelta(minutes=30)) == []


def test_late_send_still_checks_every_rule(configured, clock, provider):
    from sms_reminders.models import BlockedNumber

    appt = make_appt()
    now = J2 + timedelta(hours=3)
    run_due(configured, now)
    job = decide(jobs_of(appt)[Step.J2].id, True, now)
    with session_scope() as s:
        s.add(BlockedNumber(phone_e164="+33600000001", reason="STOP", source="opt_out", created_by="x"))
    assert execute_job(configured, job.id, now) == JobStatus.CANCELLED
    assert provider.calls == []


def test_schema_upgrade_adds_new_columns(env):
    """A database created by a previous version (without the late_* columns) is upgraded."""
    from sqlalchemy import inspect, text

    from sms_reminders.db import get_engine, init_db

    with get_engine().begin() as conn:
        conn.execute(text("ALTER TABLE sms_job DROP COLUMN late_decided_at"))
    assert "late_decided_at" not in {c["name"] for c in inspect(get_engine()).get_columns("sms_job")}
    init_db()
    assert "late_decided_at" in {c["name"] for c in inspect(get_engine()).get_columns("sms_job")}
