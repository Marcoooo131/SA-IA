from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone

import pytest

from sms_reminders.providers.base import OutboundSms, SendResult

PASSWORD = "correct horse battery staple"
PHONE = "06 00 00 00 01"


@dataclass
class ScriptedProvider:
    """Records every call; results can be scripted (default: success)."""

    name: str = "scripted"
    simulated: bool = False
    calls: list[OutboundSms] = field(default_factory=list)
    script: list[SendResult] = field(default_factory=list)

    def send(self, message: OutboundSms) -> SendResult:
        self.calls.append(message)
        if self.script:
            return self.script.pop(0)
        return SendResult(ok=True, provider_message_id=f"MSG{len(self.calls)}")

    def parse_status_callback(self, url, params, headers):
        raise PermissionError


class Clock:
    def __init__(self, now: datetime):
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def set(self, now: datetime) -> None:
        self.now = now


@pytest.fixture
def env(tmp_path, monkeypatch):
    from sms_reminders.web.auth import hash_password

    pw = hash_password(PASSWORD, n=2**10)
    values = {
        "SMR_ENVIRONMENT": "test",
        # Set SMR_TEST_DATABASE_URL (postgresql+psycopg://...) to run the suite on PostgreSQL.
        "SMR_DATABASE_URL": os.environ.get("SMR_TEST_DATABASE_URL") or f"sqlite:///{tmp_path}/test.db",
        "SMR_SMS_PROVIDER": "simulation",
        "SMR_SESSION_SECRET": "s" * 40,
        "SMR_COOKIE_SECURE": "false",
        "SMR_UI_USERS": f"alice:advisor:{pw};sam:supervisor:{pw};ada:admin:{pw}",
        "SMR_PUBLIC_BASE_URL": "https://sms.example.test",
    }
    for k, v in values.items():
        monkeypatch.setenv(k, v)
    _reset()
    from sms_reminders.db import Base, get_engine, init_db

    if os.environ.get("SMR_TEST_DATABASE_URL"):
        from sms_reminders import models  # noqa: F401

        Base.metadata.drop_all(get_engine())
    init_db()
    yield values
    _reset()


def _reset():
    from sms_reminders import container as container_mod
    from sms_reminders.config import get_settings
    from sms_reminders.db import reset_caches

    get_settings.cache_clear()
    reset_caches()
    container_mod.set_container(None)


PARIS_NOW = datetime(2026, 10, 14, 8, 0, tzinfo=timezone.utc)  # 10:00 in Paris


@pytest.fixture
def clock():
    return Clock(PARIS_NOW)


@pytest.fixture
def provider():
    return ScriptedProvider()


@pytest.fixture
def container(env, clock, provider):
    from sms_reminders.config import get_settings
    from sms_reminders.container import Container, set_container

    c = Container(settings=get_settings(), provider=provider, clock=clock)
    set_container(c)
    return c


TEMPLATE = "Bonjour {{prenom}}, rappel : rendez-vous {{service}} le {{date_rendez_vous}} à {{heure_rendez_vous}}."


@pytest.fixture
def configured(container):
    """Senders, six active templates and the compliance validation recorded."""
    from sms_reminders.db import session_scope
    from sms_reminders.models import ServiceConfig, TemplateSlot
    from sms_reminders.policy import load_policy, save_policy
    from sms_reminders.template_admin import activate, save_version

    with session_scope() as s:
        for sv, sender in (("movers", "+33600000900"), ("takeovers", "+33600000901")):
            s.get(ServiceConfig, sv).sender_id = sender
        policy = load_policy(s)
        for slot in s.query(TemplateSlot).all():
            v = save_version(s, slot, f"[{slot.step}] " + TEMPLATE, actor="test")
            activate(s, slot, v, actor="test", policy=policy)
        policy.compliance_validated = True
        save_policy(s, policy, "test")
    return container


def make_appt(*, at_local: datetime | None = None, service: str | None = "movers", phone: str = PHONE,
              confirmed: bool = False, customer_ref: str = "CLI-1", now: datetime | None = None, first_name: str = "Marie"):
    """Create an appointment (default: 3 days after PARIS_NOW, 14:00 Paris)."""
    from sms_reminders.appointments import AppointmentData, create_appointment
    from sms_reminders.db import session_scope
    from sms_reminders.policy import load_policy

    at_local = at_local or datetime(2026, 10, 17, 14, 0)
    data = AppointmentData(customer_ref, first_name, "Dupont", phone, at_local.date(), at_local.time(), service, confirmed)
    with session_scope() as s:
        appt = create_appointment(s, data, actor="test", policy=load_policy(s), now=now or PARIS_NOW)
        return appt.id


def jobs_of(appt_id: int) -> dict[str, object]:
    from sqlalchemy import select

    from sms_reminders.db import session_scope
    from sms_reminders.models import Appointment, SmsJob

    with session_scope() as s:
        rev = s.get(Appointment, appt_id).schedule_revision
        rows = s.scalars(select(SmsJob).where(SmsJob.appointment_id == appt_id)).all()
        return {j.step: j for j in rows if j.revision == rev or j.step == "manual"}


def all_jobs(appt_id: int):
    from sqlalchemy import select

    from sms_reminders.db import session_scope
    from sms_reminders.models import SmsJob

    with session_scope() as s:
        return s.scalars(select(SmsJob).where(SmsJob.appointment_id == appt_id).order_by(SmsJob.id)).all()


def with_appt(appt_id: int, fn):
    from sms_reminders.db import session_scope
    from sms_reminders.models import Appointment
    from sms_reminders.policy import load_policy

    with session_scope() as s:
        appt = s.get(Appointment, appt_id)
        return fn(s, appt, load_policy(s))
