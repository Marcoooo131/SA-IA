"""Adaptateurs de téléphonie : traduisent les webhooks de chaque fournisseur en événements normalisés.

Ajouter un fournisseur (Twilio, Telnyx, Aircall…) = écrire un adaptateur ; le reste du module
(machine d'états, règles, SMS, statistiques) ne change pas.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Protocol


class CallEventType(str, Enum):
    INBOUND = "call.inbound"          # un appel arrive sur une ligne suivie
    ANSWERED = "call.answered"        # quelqu'un a décroché (l'entreprise, pas un message automatique)
    MISSED = "call.missed"            # sonnerie sans réponse, occupé, injoignable
    ABANDONED = "call.abandoned"      # l'appelant a raccroché avant la fin
    TRANSFERRED = "call.transferred"  # passé à un autre poste ou numéro
    COMPLETED = "call.completed"      # fin d'appel


@dataclass(frozen=True)
class CallEvent:
    provider: str
    provider_event_id: str
    provider_call_id: str
    type: CallEventType
    from_raw: str | None
    to_number: str | None
    occurred_at: datetime
    raw: dict[str, Any]


class WebhookRejected(Exception):
    """Signature absente ou invalide, ou charge utile illisible : réponse 401/400, rien n'est traité."""


class TelephonyAdapter(Protocol):
    code: str

    def verify(self, body: bytes, headers: dict[str, str], secret: str) -> None: ...

    def parse(self, body: bytes, headers: dict[str, str]) -> list[CallEvent]: ...


def _ts(value: Any) -> datetime:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class SimulatorAdapter:
    """Fournisseur simulé : tests automatiques, développement, essai par l'entreprise et démonstration.

    Format : {"events": [{"id", "call_id", "type", "from", "to", "at"}]} signé par HMAC-SHA256
    (en-tête X-Venio-Signature). Aucun appel ni SMS réel n'est jamais associé à ce fournisseur.
    """
    code = "simulator"

    @staticmethod
    def sign(body: bytes, secret: str) -> str:
        return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    def verify(self, body: bytes, headers: dict[str, str], secret: str) -> None:
        given = headers.get("x-venio-signature", "")
        if not given or not hmac.compare_digest(given, self.sign(body, secret)):
            raise WebhookRejected("Signature invalide.")

    def parse(self, body: bytes, headers: dict[str, str]) -> list[CallEvent]:
        try:
            data = json.loads(body)
            out = []
            for e in data["events"][:20]:
                out.append(CallEvent(
                    provider=self.code, provider_event_id=str(e["id"])[:100], provider_call_id=str(e["call_id"])[:100],
                    type=CallEventType(e["type"]), from_raw=(None if e.get("from") is None else str(e["from"])[:40]),
                    to_number=(None if e.get("to") is None else str(e["to"])[:40]), occurred_at=_ts(e["at"]), raw=e,
                ))
            return out
        except (KeyError, TypeError, ValueError) as exc:
            raise WebhookRejected("Charge utile illisible.") from exc


ADAPTERS: dict[str, TelephonyAdapter] = {"simulator": SimulatorAdapter()}


def get_adapter(code: str) -> TelephonyAdapter | None:
    return ADAPTERS.get(code)
