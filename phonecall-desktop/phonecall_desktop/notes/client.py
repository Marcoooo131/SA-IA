"""Note generation clients.

``GatewayNoteClient`` calls the company gateway (``phonecall-agent``: ``POST /api/v1/notes``),
which holds the AI provider key, applies the versioned prompt and the anti-invention checks.
``direct.DirectAINoteClient`` runs the same code inside the app, with a key stored in the
Windows Credential Manager (chosen for a small number of workstations).
"""

from __future__ import annotations

import logging
import time
import uuid
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass, field

import httpx

from ..errors import AppError, ErrorCode
from ..transcript.assembler import Segment

log = logging.getLogger(__name__)


@dataclass
class NoteResult:
    text: str
    no_usable_content: bool = False
    category: str | None = None
    flags: list[dict] = field(default_factory=list)
    points_to_verify: list[str] = field(default_factory=list)
    quality_score: int | None = None
    prompt_version: str | None = None
    model: str | None = None
    cost_usd: float = 0.0
    simulated: bool = False

    def to_dict(self) -> dict:
        return self.__dict__.copy()


def segments_payload(segments: list[Segment]) -> list[dict]:
    return [
        {"start": round(s.t_start, 2), "end": round(s.t_end, 2), "speaker": s.speaker, "text": s.text,
         "uncertain": s.uncertain}
        for s in segments
    ]


def note_from_payload(data: dict) -> NoteResult:
    """Payload of ``POST /api/v1/notes`` (gateway) or of ``phonecall_agent.note_service`` (direct mode)."""
    quality = data.get("quality") or {}
    return NoteResult(
        text=data.get("note_text", ""),
        no_usable_content=bool(data.get("no_usable_content")),
        category=data.get("category"),
        flags=list(quality.get("flags") or []),
        points_to_verify=list(data.get("points_to_verify") or []),
        quality_score=quality.get("score"),
        prompt_version=data.get("prompt_version"),
        model=data.get("model"),
        cost_usd=float(data.get("cost_usd") or 0.0),
    )


class NoteClient(ABC):
    name = "abstract"

    @abstractmethod
    def generate(self, segments: list[Segment], duration_s: int, request_id: str,
                 meta: dict | None = None) -> NoteResult:
        """``meta``: authorised data of the PC (started_at, call direction / type chosen by the advisor)."""


class GatewayNoteClient(NoteClient):
    name = "gateway"

    def __init__(self, base_url: str, token_provider: Callable[[], str | None], timeout_s: float = 90.0,
                 attempts: int = 3, transport: httpx.BaseTransport | None = None, verify: bool | str = True,
                 sleep: Callable[[float], None] = time.sleep):
        self.base_url = base_url.rstrip("/")
        self.token_provider = token_provider
        self.attempts = attempts
        self.sleep = sleep
        self._client = httpx.Client(
            timeout=httpx.Timeout(timeout_s, connect=10.0), transport=transport, verify=verify,
            headers={"User-Agent": "phonecall-desktop/0.1"},
        )

    def generate(self, segments: list[Segment], duration_s: int, request_id: str,
                 meta: dict | None = None) -> NoteResult:
        token = self.token_provider()
        if not token:
            raise AppError(ErrorCode.NOTE_AUTH, "aucun jeton configuré")
        body = {"segments": segments_payload(segments), "speaker_labels": True, "duration_s": duration_s,
                "client_request_id": request_id}
        last: AppError | None = None
        for attempt in range(1, self.attempts + 1):
            try:
                resp = self._client.post(f"{self.base_url}/api/v1/notes", json=body,
                                         headers={"Authorization": f"Bearer {token}"})
            except httpx.TimeoutException:
                last = AppError(ErrorCode.NOTE_TIMEOUT, retryable=True)
            except httpx.TransportError:
                last = AppError(ErrorCode.NOTE_NETWORK, retryable=True)
            else:
                if resp.status_code == 200:
                    return self._parse(resp.json())
                if resp.status_code in (401, 403):
                    raise AppError(ErrorCode.NOTE_AUTH)
                if resp.status_code in (400, 413, 422):
                    raise AppError(ErrorCode.NOTE_REJECTED, f"HTTP {resp.status_code}")
                last = AppError(ErrorCode.NOTE_SERVER, f"HTTP {resp.status_code}", retryable=True)
            log.warning("note generation attempt %s failed: %s", attempt, last.code.value)
            if attempt < self.attempts:
                self.sleep(min(2 ** attempt, 10))
        assert last is not None
        raise last

    @staticmethod
    def _parse(data: dict) -> NoteResult:
        return note_from_payload(data)

    def health(self) -> bool:
        token = self.token_provider()
        try:
            r = self._client.get(f"{self.base_url}/api/v1/notes/health", headers={"Authorization": f"Bearer {token}"})
            return r.status_code == 200
        except httpx.HTTPError:
            return False


class SimulatedNoteClient(NoteClient):
    """SIMULATION for tests and offline UI checks: no AI. The 'note' is a mechanical, clearly
    labelled digest of the transcript — it is not a Phone Call."""

    name = "simulated"

    def __init__(self, fail_times: int = 0):
        self.fail_times = fail_times
        self.calls = 0

    def generate(self, segments: list[Segment], duration_s: int, request_id: str,
                 meta: dict | None = None) -> NoteResult:
        self.calls += 1
        if self.fail_times > 0:
            self.fail_times -= 1
            raise AppError(ErrorCode.NOTE_NETWORK, retryable=True)
        remote = [s.text for s in segments if s.speaker == "remote"]
        text = "[NOTE SIMULÉE — mode test, aucune IA]\n" + "\n".join(f"- Interlocuteur : {t}" for t in remote[:5])
        return NoteResult(text=text, simulated=True, flags=[{"code": "simulation", "severity": "warning",
                                                               "message": "Note simulée (mode test)."}])


def new_request_id() -> str:
    return uuid.uuid4().hex
