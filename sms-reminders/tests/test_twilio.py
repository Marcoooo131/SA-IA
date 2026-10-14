"""Twilio adapter against a mocked transport (no network). Not a validation of the real service."""

from __future__ import annotations

import httpx
import pytest

from sms_reminders.config import Settings
from sms_reminders.providers.base import OutboundSms
from sms_reminders.providers.twilio import TwilioProvider, twilio_signature

SID = "AC" + "a" * 32


def provider(handler):
    s = Settings(sms_provider="twilio", twilio_account_sid=SID, twilio_auth_token="tok")
    return TwilioProvider(s, transport=httpx.MockTransport(handler))


MSG = OutboundSms("+33600000900", "+33600000001", "Bonjour", "1:r1:j2", "https://x.test/cb")


def test_success_and_payload():
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["body"] = dict(httpx.QueryParams(request.content.decode()))
        return httpx.Response(201, json={"sid": "SM123"})

    r = provider(handler).send(MSG)
    assert r.ok and r.provider_message_id == "SM123"
    assert seen["url"].endswith(f"/2010-04-01/Accounts/{SID}/Messages.json")
    assert seen["body"] == {"To": "+33600000001", "Body": "Bonjour", "From": "+33600000900", "StatusCallback": "https://x.test/cb"}


def test_messaging_service_sender():
    seen = {}

    def handler(request):
        seen.update(httpx.QueryParams(request.content.decode()))
        return httpx.Response(201, json={"sid": "SM1"})

    provider(handler).send(OutboundSms("MG" + "b" * 32, "+33600000001", "x", "k"))
    assert "MessagingServiceSid" in seen and "From" not in seen


@pytest.mark.parametrize("status,code,transient,opted_out", [(503, 20500, True, False), (429, 20429, True, False),
                                                             (400, 21211, False, False), (400, 21610, False, True)])
def test_errors(status, code, transient, opted_out):
    r = provider(lambda req: httpx.Response(status, json={"code": code, "message": "m"})).send(MSG)
    assert not r.ok and r.transient is transient and r.opted_out is opted_out and r.error_code == str(code)


def test_timeout_is_uncertain_and_network_error_transient():
    def timeout(req):
        raise httpx.ReadTimeout("t")

    def refused(req):
        raise httpx.ConnectError("c")

    assert provider(timeout).send(MSG).uncertain is True
    r = provider(refused).send(MSG)
    assert r.transient and not r.uncertain


def test_status_callback_signature():
    p = provider(lambda r: httpx.Response(500))
    params = {"AccountSid": SID, "MessageSid": "SM1", "MessageStatus": "delivered"}
    url = "https://x.test/webhooks/sms/twilio/status"
    sig = twilio_signature("tok", url, params)
    upd = p.parse_status_callback(url, params, {"x-twilio-signature": sig})
    assert upd.provider_message_id == "SM1" and upd.status == "delivered"
    with pytest.raises(PermissionError):
        p.parse_status_callback(url, params, {"x-twilio-signature": "bad"})
    with pytest.raises(PermissionError):
        p.parse_status_callback(url, {**params, "AccountSid": "ACother"}, {"x-twilio-signature": twilio_signature("tok", url, {**params, "AccountSid": "ACother"})})
