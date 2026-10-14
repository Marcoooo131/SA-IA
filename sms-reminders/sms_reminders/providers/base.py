"""Provider-independent SMS interface. The engine only knows this contract."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class OutboundSms:
    sender: str  # configured per service, never defaulted
    to: str  # E.164
    body: str
    idempotency_key: str  # stable per job (sms_job.dedup_key)
    status_callback_url: str | None = None


@dataclass(frozen=True)
class SendResult:
    ok: bool
    provider_message_id: str | None = None
    error_code: str | None = None
    error_message: str | None = None
    # True: temporary problem (network, 5xx, rate limit) -> may retry before expiry.
    transient: bool = False
    # True: provider reports the recipient opted out -> number is added to the blocked list.
    opted_out: bool = False
    # True: the provider may have accepted the message (e.g. timeout after sending the request).
    # The engine then marks the job "uncertain" and never resends it automatically.
    uncertain: bool = False


@dataclass(frozen=True)
class DeliveryUpdate:
    provider_message_id: str
    status: str  # normalised: queued | sent | delivered | undelivered | failed
    error_code: str | None = None


class SmsProvider(Protocol):
    name: str
    simulated: bool  # True: nothing ever leaves the server

    def send(self, message: OutboundSms) -> SendResult: ...

    def parse_status_callback(
        self, url: str, params: dict[str, str], headers: dict[str, str]
    ) -> DeliveryUpdate | None:
        """Validate and parse a delivery callback. Raise PermissionError if not authentic."""
        ...


class DisabledProvider:
    """Used when no provider is configured: every send is refused (blocked)."""

    name = "disabled"
    simulated = False

    def send(self, message: OutboundSms) -> SendResult:
        return SendResult(ok=False, error_code="provider_disabled", error_message="Aucun fournisseur SMS configuré.")

    def parse_status_callback(self, url, params, headers):
        raise PermissionError("no provider configured")
