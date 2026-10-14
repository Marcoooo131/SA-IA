"""Simulation: records messages in memory, never contacts any network.

Jobs executed by this provider are stored with status ``simulated`` (never ``sent``) and
``simulated = True``, and are displayed as "Simulé — non envoyé".
"""

from __future__ import annotations

import threading
import uuid

from .base import OutboundSms, SendResult


class SimulationProvider:
    name = "simulation"
    simulated = True

    def __init__(self) -> None:
        self.outbox: list[OutboundSms] = []
        self._keys: set[str] = set()
        self._lock = threading.Lock()

    def send(self, message: OutboundSms) -> SendResult:
        with self._lock:
            if message.idempotency_key in self._keys:
                return SendResult(ok=False, error_code="duplicate", error_message="Clé déjà utilisée (simulation).")
            self._keys.add(message.idempotency_key)
            self.outbox.append(message)
        return SendResult(ok=True, provider_message_id="SIM-" + uuid.uuid4().hex[:20])

    def parse_status_callback(self, url, params, headers):
        raise PermissionError("the simulation provider has no callbacks")
