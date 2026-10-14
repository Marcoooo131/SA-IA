from __future__ import annotations

import logging
from datetime import timedelta

import pytest
from conftest import PARIS_NOW, make_appt

from sms_reminders.config import Settings
from sms_reminders.db import session_scope
from sms_reminders.logging_setup import RedactingFilter
from sms_reminders.models import Appointment, Event, SmsJob
from sms_reminders.policy import Policy
from sms_reminders.retention import purge_expired


def test_retention_purge(container):
    appt = make_appt()
    purge_expired(PARIS_NOW + timedelta(days=100))
    with session_scope() as s:
        assert s.get(Appointment, appt) is not None
    out = purge_expired(PARIS_NOW + timedelta(days=200))
    assert out["appointments"] == 1
    with session_scope() as s:
        assert s.get(Appointment, appt) is None
        assert s.query(SmsJob).count() == 0
        assert s.query(Event).filter(Event.appointment_id.is_not(None)).count() == 0
        assert s.query(Event).filter_by(kind="retention_purge").count() == 1


def test_log_redaction():
    rec = logging.LogRecord("x", logging.INFO, "", 0, "sending to %s and 06 12 34 56 78", ("+33612345678",), None)
    RedactingFilter().filter(rec)
    assert "+336" not in rec.getMessage() and "06 12" not in rec.getMessage()
    rec = logging.LogRecord("x", logging.INFO, "", 0, "job %s at 2026-10-14 10:00", (42,), None)
    RedactingFilter().filter(rec)
    assert rec.getMessage() == "job 42 at 2026-10-14 10:00"


def test_production_safety_checks():
    with pytest.raises(RuntimeError):
        Settings(environment="production", database_url="sqlite:///x.db").assert_safe_for_environment()
    with pytest.raises(RuntimeError):
        Settings(environment="production", database_url="postgresql://x", session_secret="s" * 40,
                 sms_provider="twilio").assert_safe_for_environment()
    Settings(environment="production", database_url="postgresql://x", session_secret="s" * 40).assert_safe_for_environment()


def test_policy_coherence():
    with pytest.raises(ValueError):
        Policy(j2_hours_before=24, j1_hours_before=24)
    with pytest.raises(ValueError):
        Policy(grace_minutes_j1_first=200)
    assert Policy().retry_delay(1) == 2 and Policy().retry_delay(9) == 30
