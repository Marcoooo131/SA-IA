"""SMS sent by the company's own Android phones (the SIM of each service's number).

Each phone runs the free, open-source app « SMS Gate » (SMS Gateway for Android, sms-gate.app) in
« Local server » mode: no account, no subscription, no third party. The app exposes a small REST
API on the local network (``http://<phone IP>:8080``, login / password shown in the app); the SMS
leaves from the phone's SIM, so the customer sees the real number and can reply to it.

One phone per service: Movers (06 44 64 59 42) and Takeovers (07 57 59 92 89). The same phone
may serve both if needed.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from ..config import Settings
from .base import OutboundSms, SendResult


@dataclass(frozen=True)
class PhoneEndpoint:
    url: str
    username: str
    password: str


class PhoneGatewayProvider:
    name = "telephone"
    simulated = False

    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None):
        self.endpoints: dict[str, PhoneEndpoint] = {}
        for service in ("movers", "takeovers"):
            url = getattr(settings, f"phone_{service}_url").strip().rstrip("/")
            user = getattr(settings, f"phone_{service}_user").strip()
            password = getattr(settings, f"phone_{service}_password").get_secret_value()
            if url and user and password:
                if "://" not in url:
                    url = "http://" + url
                self.endpoints[service] = PhoneEndpoint(url, user, password)
        self.timeout = settings.http_timeout_seconds
        self.transport = transport

    @property
    def ready(self) -> bool:
        return bool(self.endpoints)

    def ready_for(self, service: str | None) -> bool:
        return service in self.endpoints

    def send(self, message: OutboundSms) -> SendResult:
        endpoint = self.endpoints.get(message.service or "")
        if endpoint is None:
            return SendResult(ok=False, error_code="phone_not_configured",
                              error_message="Aucun téléphone d'envoi configuré pour ce service.")
        payloads = (
            {"message": message.body, "phoneNumbers": [message.to]},
            {"textMessage": {"text": message.body}, "phoneNumbers": [message.to]},  # newer app versions
        )
        try:
            with httpx.Client(base_url=endpoint.url, auth=(endpoint.username, endpoint.password),
                              timeout=self.timeout, transport=self.transport) as client:
                resp = None
                for path in ("/message", "/messages"):
                    for payload in payloads:
                        resp = client.post(path, json=payload)
                        if resp.status_code not in (400, 404, 405, 422):
                            break
                    if resp.status_code not in (404, 405):
                        break
        except httpx.ConnectError:
            # Nothing reached the phone (off, not on the same Wi-Fi, app stopped): safe to retry.
            return SendResult(ok=False, error_code="phone_unreachable", transient=True,
                              error_message="Téléphone injoignable (allumé, même Wi-Fi, application SMS Gate démarrée ?)")
        except httpx.TimeoutException:
            return SendResult(ok=False, error_code="phone_timeout", uncertain=True,
                              error_message="Le téléphone n'a pas répondu à temps : vérifier sur le téléphone si le SMS est parti.")
        except httpx.HTTPError as exc:
            return SendResult(ok=False, error_code="phone_error", transient=True, error_message=type(exc).__name__)
        if resp.status_code in (200, 201, 202):
            try:
                ident = str(resp.json().get("id") or "")
            except ValueError:
                ident = ""
            return SendResult(ok=True, provider_message_id=ident or None)
        if resp.status_code == 401:
            return SendResult(ok=False, error_code="phone_auth", error_message="Identifiant ou mot de passe du téléphone incorrect.")
        transient = resp.status_code == 429 or resp.status_code >= 500
        return SendResult(ok=False, error_code=f"phone_http_{resp.status_code}", transient=transient,
                          error_message=resp.text[:200])

    def parse_status_callback(self, url, params, headers):
        raise PermissionError("no callbacks for the phone gateway")
