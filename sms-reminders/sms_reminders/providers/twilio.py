"""Twilio Programmable Messaging adapter.

Implemented against Twilio's public REST contract and tested with a mocked HTTP transport only:
it has NOT been validated against a real Twilio account. See docs/FOURNISSEUR_SMS.md.
Credentials come exclusively from environment variables; the sender (``From`` number,
alphanumeric sender ID or ``MG…`` Messaging Service SID) comes from the service settings.
"""

from __future__ import annotations

import base64
import hashlib
import hmac

import httpx

from ..config import Settings
from .base import DeliveryUpdate, OutboundSms, SendResult

# Twilio error codes that are definitive for this recipient.
_OPT_OUT_CODES = {"21610"}  # recipient replied STOP
_PERMANENT_CODES = {"21211", "21612", "21614", "21408", "21606", "21610", "30004", "30005", "30006"}
_STATUS_MAP = {
    "accepted": "queued", "queued": "queued", "sending": "queued", "scheduled": "queued",
    "sent": "sent", "delivered": "delivered", "undelivered": "undelivered", "failed": "failed",
    "read": "delivered", "canceled": "failed",
}


def twilio_signature(auth_token: str, url: str, params: dict[str, str]) -> str:
    payload = url + "".join(k + params[k] for k in sorted(params))
    digest = hmac.new(auth_token.encode(), payload.encode(), hashlib.sha1).digest()
    return base64.b64encode(digest).decode()


class TwilioProvider:
    name = "twilio"
    simulated = False

    @property
    def ready(self) -> bool:
        """False while the account credentials are missing: sending is then blocked, not failed."""
        return bool(self.account_sid and self.auth_token)

    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        self.account_sid = settings.twilio_account_sid
        self.auth_token = settings.twilio_auth_token.get_secret_value()
        self.validate_signature = settings.twilio_validate_signature
        self.client = httpx.Client(
            base_url=settings.twilio_api_base,
            auth=(self.account_sid, self.auth_token),
            timeout=settings.http_timeout_seconds,
            transport=transport,
        )

    def send(self, message: OutboundSms) -> SendResult:
        if not (self.account_sid and self.auth_token):
            return SendResult(ok=False, error_code="not_configured", error_message="Identifiants Twilio absents.")
        data = {"To": message.to, "Body": message.body}
        if message.sender.startswith("MG"):
            data["MessagingServiceSid"] = message.sender
        else:
            data["From"] = message.sender
        if message.status_callback_url:
            data["StatusCallback"] = message.status_callback_url
        try:
            resp = self.client.post(f"/2010-04-01/Accounts/{self.account_sid}/Messages.json", data=data)
        except httpx.TimeoutException:
            # The request may have reached Twilio: the engine treats a timeout as uncertain.
            return SendResult(ok=False, error_code="timeout", error_message="Délai dépassé", uncertain=True)
        except httpx.HTTPError as exc:
            return SendResult(ok=False, error_code="network", error_message=type(exc).__name__, transient=True)
        if resp.status_code in (200, 201):
            body = resp.json()
            return SendResult(ok=True, provider_message_id=body.get("sid"))
        try:
            err = resp.json()
        except ValueError:
            err = {}
        code = str(err.get("code") or resp.status_code)
        msg = str(err.get("message") or "")[:300]
        transient = resp.status_code == 429 or resp.status_code >= 500
        if code in _PERMANENT_CODES:
            transient = False
        return SendResult(ok=False, error_code=code, error_message=msg, transient=transient, opted_out=code in _OPT_OUT_CODES)

    def parse_status_callback(self, url: str, params: dict[str, str], headers: dict[str, str]) -> DeliveryUpdate | None:
        if self.validate_signature:
            given = headers.get("x-twilio-signature", "")
            expected = twilio_signature(self.auth_token, url, params)
            if not given or not hmac.compare_digest(given, expected):
                raise PermissionError("invalid Twilio signature")
        if params.get("AccountSid") != self.account_sid:
            raise PermissionError("unexpected account")
        sid = params.get("MessageSid") or params.get("SmsSid")
        status = _STATUS_MAP.get((params.get("MessageStatus") or params.get("SmsStatus") or "").lower())
        if not sid or not status:
            return None
        return DeliveryUpdate(sid, status, params.get("ErrorCode") or None)
