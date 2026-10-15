"""Phone gateway (SMS Gate, local server mode) against a mocked phone: no network."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from sms_reminders.config import Settings
from sms_reminders.providers.base import OutboundSms
from sms_reminders.providers.phone_gateway import PhoneGatewayProvider


def provider(handler, **extra):
    s = Settings(sms_provider="telephone", phone_movers_url="192.168.1.23:8080", phone_movers_user="sms",
                 phone_movers_password="pw", **extra)
    return PhoneGatewayProvider(s, transport=httpx.MockTransport(handler))


MSG = OutboundSms("+33644645942", "+33600000001", "Bonjour", "1:r1:j2", service="movers")


def test_sends_through_the_movers_phone():
    seen = {}

    def handler(request: httpx.Request):
        seen.update(url=str(request.url), auth=request.headers["authorization"], body=json.loads(request.content))
        return httpx.Response(202, json={"id": "abc", "state": "Pending"})

    p = provider(handler)
    assert p.ready and p.ready_for("movers") and not p.ready_for("takeovers")
    r = p.send(MSG)
    assert r.ok and r.provider_message_id == "abc"
    assert seen["url"] == "http://192.168.1.23:8080/message"
    assert seen["auth"].startswith("Basic ") and seen["body"] == {"message": "Bonjour", "phoneNumbers": ["+33600000001"]}


def test_falls_back_to_newer_api_shape():
    calls = []

    def handler(request):
        body = json.loads(request.content)
        calls.append((request.url.path, sorted(body)))
        if request.url.path == "/messages" and "textMessage" in body:
            return httpx.Response(202, json={"id": "x"})
        return httpx.Response(404 if request.url.path == "/message" else 400)

    assert provider(handler).send(MSG).ok
    assert calls[-1] == ("/messages", ["phoneNumbers", "textMessage"])


def test_errors():
    def refused(request):
        raise httpx.ConnectError("refused")

    def timeout(request):
        raise httpx.ReadTimeout("t")

    r = provider(refused).send(MSG)
    assert not r.ok and r.transient and "injoignable" in r.error_message
    assert provider(timeout).send(MSG).uncertain
    r = provider(lambda req: httpx.Response(401)).send(MSG)
    assert not r.ok and not r.transient and r.error_code == "phone_auth"
    assert provider(lambda req: httpx.Response(503)).send(MSG).transient
    r = provider(lambda req: httpx.Response(202)).send(OutboundSms("x", "+33600000001", "b", "k", service="takeovers"))
    assert not r.ok and r.error_code == "phone_not_configured"


def test_unconfigured_service_is_blocked_not_failed(configured, clock):
    """Engine: a service whose phone is not linked keeps its reminders blocked (re-checked)."""
    from conftest import jobs_of, make_appt

    from sms_reminders.scheduler import run_due

    def handler(request):
        return httpx.Response(202, json={"id": "ok"})

    configured.provider = provider(handler)
    movers = make_appt()
    takeovers = make_appt(customer_ref="CLI-T", service="takeovers")
    j2 = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)
    clock.set(j2)
    run_due(configured, j2)
    assert jobs_of(movers)["j2"].status == "sent"
    job = jobs_of(takeovers)["j2"]
    assert job.status == "blocked" and "Takeovers non configuré" in job.status_reason
