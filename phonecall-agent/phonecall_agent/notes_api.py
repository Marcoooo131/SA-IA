"""Notes API: generates a Phone Call note from a transcript sent by a client (desktop app).

- No Twilio, no storage of the transcript or of the note (stateless). Only counters are logged.
- The AI provider key stays on this server: clients authenticate with a revocable bearer token
  (only its SHA-256 is configured: ``PCA_NOTE_API_TOKENS_SHA256``). Target: company SSO (OIDC).
- ``client_request_id`` makes client retries idempotent for 10 minutes (no double AI cost).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import threading
import time
from collections import deque
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from .container import Container
from .errors import InvalidAIResponse, PermanentError, PipelineError
from .generation import prompt_version
from .note_service import NO_CONTENT_TEXT, NoteSegment  # noqa: F401 - NO_CONTENT_TEXT re-exported
from .note_service import generate_note as build_note

log = logging.getLogger(__name__)


class SegmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start: float | None = Field(default=None, ge=0)
    end: float | None = Field(default=None, ge=0)
    speaker: Literal["advisor", "remote", "customer"] | None = None
    text: str = Field(max_length=5000)
    uncertain: bool = False


class NoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    segments: list[SegmentIn] = Field(max_length=3000)
    speaker_labels: bool = False
    duration_s: int | None = Field(default=None, ge=0, le=6 * 3600)
    client_request_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9-]{8,64}$")


class _RateLimiter:
    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self._hits: dict[str, deque] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= self.per_minute:
                return False
            q.append(now)
            return True


class _ResponseCache:
    def __init__(self, ttl: float = 600):
        self.ttl = ttl
        self._items: dict[str, tuple[float, dict]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> dict | None:
        with self._lock:
            item = self._items.get(key)
            if item and time.monotonic() - item[0] < self.ttl:
                return item[1]
            self._items.pop(key, None)
            return None

    def put(self, key: str, value: dict) -> None:
        with self._lock:
            now = time.monotonic()
            self._items = {k: v for k, v in self._items.items() if now - v[0] < self.ttl}
            self._items[key] = (now, value)


def build_notes_router(c: Container) -> APIRouter:
    router = APIRouter()
    settings = c.settings
    allowed = {h.strip().lower() for h in settings.note_api_tokens_sha256.split(",") if h.strip()}
    limiter = _RateLimiter(settings.note_api_rate_per_minute)
    cache = _ResponseCache()
    counters = {"requests": 0, "generated": 0, "no_content": 0, "errors": 0, "cache_hits": 0}

    def authenticate(authorization: str | None) -> str:
        token = (authorization or "").removeprefix("Bearer ").strip()
        if not token or not allowed:
            raise HTTPException(401, "missing or unknown token")
        digest = hashlib.sha256(token.encode()).hexdigest()
        if not any(hmac.compare_digest(digest, a) for a in allowed):
            raise HTTPException(401, "missing or unknown token")
        return digest[:16]

    @router.post("/api/v1/notes")
    def generate_note(body: NoteRequest, request: Request, authorization: str | None = Header(default=None)):
        client = authenticate(authorization)
        counters["requests"] += 1
        if not limiter.allow(client):
            raise HTTPException(429, "rate limit")
        cache_key = f"{client}:{body.client_request_id}" if body.client_request_id else None
        if cache_key and (cached := cache.get(cache_key)):
            counters["cache_hits"] += 1
            return cached
        total_chars = sum(len(s.text) for s in body.segments)
        if total_chars > settings.note_api_max_chars:
            raise HTTPException(413, "transcript too long")
        log.info("note request", extra={"stage": "notes"})  # no content in logs
        try:
            result = build_note(
                c.generator, c.business,
                [NoteSegment(text=s.text, start=s.start, end=s.end, speaker=s.speaker, uncertain=s.uncertain)
                 for s in body.segments],
                speaker_labels=body.speaker_labels, duration_s=body.duration_s,
                ai_max_attempts=settings.ai_max_attempts,
            )
        except InvalidAIResponse as exc:
            counters["errors"] += 1
            raise HTTPException(502, exc.code) from exc
        except PermanentError as exc:
            counters["errors"] += 1
            raise HTTPException(422, exc.code) from exc
        except PipelineError as exc:
            counters["errors"] += 1
            raise HTTPException(503, exc.code) from exc
        counters["no_content" if result["generator"] is None else "generated"] += 1
        if cache_key:
            cache.put(cache_key, result)
        return result

    @router.get("/api/v1/notes/health")
    def notes_health(authorization: str | None = Header(default=None)):
        authenticate(authorization)
        return {"status": "ok", "prompt_version": prompt_version(c.business), "generator": c.generator.name}

    router.counters = counters  # type: ignore[attr-defined]
    return router
