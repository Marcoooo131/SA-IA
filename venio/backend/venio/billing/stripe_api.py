"""Client Stripe minimal (API HTTPS, sans SDK) et vérification des webhooks.

Garde-fou (décision du 18/11/2026) : tant que VENIO_STRIPE_LIVE_ENABLED n'est pas activé explicitement,
toute clé réelle (sk_live_… / rk_live_…) est refusée — au démarrage de l'API et à chaque appel.
"""
from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any

import httpx

from ..config import get_settings

API = "https://api.stripe.com/v1"
SIGNATURE_TOLERANCE_S = 300


class StripeError(Exception):
    def __init__(self, message: str, status: int = 0, code: str | None = None):
        super().__init__(message)
        self.status, self.code = status, code


class BillingNotConfigured(StripeError):
    pass


def check_key_mode(key: str | None, live_enabled: bool) -> None:
    """Refuse une clé réelle tant que le passage en réel n'a pas été autorisé."""
    if key and key.split("_")[1:2] == ["live"] and not live_enabled:
        raise RuntimeError("Clé Stripe réelle refusée : Stripe est en mode test uniquement "
                           "(VENIO_STRIPE_LIVE_ENABLED non activé).")


def _key() -> str:
    s = get_settings()
    if not s.stripe_secret_key:
        raise BillingNotConfigured("Le paiement en ligne n'est pas encore configuré.")
    check_key_mode(s.stripe_secret_key, s.stripe_live_enabled)
    return s.stripe_secret_key


def form(params: dict[str, Any], prefix: str = "") -> list[tuple[str, str]]:
    """Encode les paramètres imbriqués au format attendu par Stripe : a[b][0][c]=…"""
    out: list[tuple[str, str]] = []
    for k, v in params.items():
        key = f"{prefix}[{k}]" if prefix else str(k)
        if v is None:
            continue
        if isinstance(v, dict):
            out += form(v, key)
        elif isinstance(v, (list, tuple)):
            for i, item in enumerate(v):
                if isinstance(item, dict):
                    out += form(item, f"{key}[{i}]")
                else:
                    out.append((f"{key}[{i}]", _scalar(item)))
        else:
            out.append((key, _scalar(v)))
    return out


def _scalar(v: Any) -> str:
    return "true" if v is True else "false" if v is False else str(v)


def request(method: str, path: str, params: dict[str, Any] | None = None, idempotency_key: str | None = None) -> dict:
    headers = {"Authorization": f"Bearer {_key()}", "Stripe-Version": "2024-06-20"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    data = form(params or {})
    if method == "GET":
        r = httpx.get(f"{API}{path}", params=data, headers=headers, timeout=20)
    else:
        r = httpx.post(f"{API}{path}", data=data, headers=headers, timeout=20)
    body = r.json() if r.content else {}
    if r.status_code >= 300:
        err = body.get("error", {}) if isinstance(body, dict) else {}
        raise StripeError(err.get("message", f"Stripe {r.status_code}"), r.status_code, err.get("code"))
    return body


def verify_signature(payload: bytes, header: str | None, secret: str, now: float | None = None) -> None:
    """Vérifie l'en-tête Stripe-Signature (t=…,v1=…) : HMAC-SHA256 de « t.payload », tolérance 5 min."""
    if not header or not secret:
        raise StripeError("Signature absente.", 400)
    parts: dict[str, list[str]] = {}
    for item in header.split(","):
        k, _, v = item.strip().partition("=")
        parts.setdefault(k, []).append(v)
    try:
        ts = int(parts["t"][0])
    except (KeyError, ValueError) as exc:
        raise StripeError("Signature illisible.", 400) from exc
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, sig) for sig in parts.get("v1", [])):
        raise StripeError("Signature invalide.", 400)
    if abs((now or time.time()) - ts) > SIGNATURE_TOLERANCE_S:
        raise StripeError("Signature expirée.", 400)


def sign(payload: bytes, secret: str, ts: int | None = None) -> str:
    """Signature au format Stripe (tests et outils internes)."""
    ts = ts or int(time.time())
    return f"t={ts},v1=" + hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
