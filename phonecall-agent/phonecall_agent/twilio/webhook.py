"""Twilio Recording Status Callback: signature validation and payload parsing.

Twilio signs every webhook with ``X-Twilio-Signature`` (HMAC-SHA1 of the full URL followed by
the sorted POST parameters, keyed with the account Auth Token). We use the official
``twilio.request_validator.RequestValidator`` rather than a home-made implementation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from twilio.request_validator import RequestValidator

SID_PATTERNS = {
    "AccountSid": re.compile(r"^AC[0-9a-fA-F]{32}$"),
    "CallSid": re.compile(r"^CA[0-9a-fA-F]{32}$"),
    "RecordingSid": re.compile(r"^RE[0-9a-fA-F]{32}$"),
}

# Statuses documented for RecordingStatusCallbackEvent: in-progress, completed, absent (and failed).
KNOWN_STATUSES = {"in-progress", "completed", "absent", "failed"}


class InvalidPayload(ValueError):
    pass


@dataclass(frozen=True)
class RecordingStatusEvent:
    account_sid: str
    call_sid: str
    recording_sid: str
    recording_status: str
    recording_duration: int | None
    recording_channels: int | None
    recording_source: str | None
    error_code: str | None

    @property
    def idempotency_key(self) -> str:
        return f"{self.recording_sid}:{self.recording_status}"


def verify_signature(auth_token: str, url: str, params: dict[str, str], signature: str | None) -> bool:
    if not signature or not auth_token:
        return False
    return RequestValidator(auth_token).validate(url, params, signature)


def parse_recording_status(params: dict[str, str]) -> RecordingStatusEvent:
    for field, pattern in SID_PATTERNS.items():
        value = params.get(field, "")
        if not pattern.match(value):
            raise InvalidPayload(f"missing or malformed {field}")
    status = params.get("RecordingStatus", "")
    if status not in KNOWN_STATUSES:
        raise InvalidPayload("unknown RecordingStatus")

    def _int(name: str) -> int | None:
        raw = params.get(name)
        if raw in (None, ""):
            return None
        try:
            return int(raw)
        except ValueError as exc:
            raise InvalidPayload(f"malformed {name}") from exc

    # RecordingUrl is deliberately ignored: the media URL is rebuilt from the SID on our side
    # (no SSRF through a forged URL, no private URL stored).
    return RecordingStatusEvent(
        account_sid=params["AccountSid"],
        call_sid=params["CallSid"],
        recording_sid=params["RecordingSid"],
        recording_status=status,
        recording_duration=_int("RecordingDuration"),
        recording_channels=_int("RecordingChannels"),
        recording_source=(params.get("RecordingSource") or None),
        error_code=(params.get("ErrorCode") or None),
    )
