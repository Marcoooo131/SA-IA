"""Limitation de débit en mémoire (une instance). Remplacée par Redis quand l'API aura plusieurs instances."""
import time
from collections import defaultdict

from fastapi import Request

from .errors import api_error

_hits: dict[str, list[float]] = defaultdict(list)


def limit(bucket: str, max_hits: int, per_seconds: int):
    async def dependency(request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        key = f"{bucket}:{ip}"
        now = time.monotonic()
        window = [t for t in _hits[key] if now - t < per_seconds]
        if len(window) >= max_hits:
            _hits[key] = window
            raise api_error(429, "rate_limited", "Trop de requêtes, réessayez dans un instant.")
        window.append(now)
        _hits[key] = window

    return dependency


def reset() -> None:
    _hits.clear()
