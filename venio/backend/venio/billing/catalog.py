"""Catalogue Stripe : offres (mensuel / annuel), packs de crédits SMS, portail client.

Les prix sont retrouvés par « lookup key » : relancer la configuration ne crée jamais de doublon.
L'API crée automatiquement ce qui manque au premier besoin (ensure_catalog) : il suffit de poser la clé
Stripe sur le serveur. La commande ci-dessous reste disponible pour préparer un compte à l'avance :
    VENIO_STRIPE_SECRET_KEY=sk_test_… VENIO_DATABASE_ADMIN_URL=… python -m venio.billing.catalog
Les montants sont hors taxes (TVA à décider avant le passage en réel : Stripe Tax ou prix TTC).
"""
from __future__ import annotations

import asyncio
import threading
from typing import Any

from .stripe_api import request

CURRENCY = "eur"
# Packs de crédits SMS prépayés (05 « Offres et limites ») : prix à valider.
PACKS: dict[str, dict[str, Any]] = {
    "sms_100": {"credits": 100, "cents": 1000, "name": "Pack 100 crédits SMS"},
    "sms_500": {"credits": 500, "cents": 4000, "name": "Pack 500 crédits SMS"},
}


def plan_lookup(code: str, interval: str) -> str:
    return f"venio_{code}_{interval}"


def pack_lookup(code: str) -> str:
    return f"venio_{code}"


def prices_by_lookup(keys: list[str]) -> dict[str, dict]:
    res = request("GET", "/prices", {"lookup_keys": keys, "active": True, "limit": 100})
    return {p["lookup_key"]: p for p in res.get("data", [])}


def _product(name: str, ref: str) -> str:
    found = request("GET", "/products/search", {"query": f"metadata['venio_ref']:'{ref}'"}).get("data", [])
    if found:
        return found[0]["id"]
    return request("POST", "/products", {"name": name, "metadata": {"venio_ref": ref}},
                   idempotency_key=f"venio-product-{ref}")["id"]


def ensure_prices(plans: list[dict[str, Any]]) -> dict[str, str]:
    """Crée ce qui manque ; renvoie {lookup_key: price_id}."""
    wanted = [plan_lookup(p["code"], i) for p in plans for i in ("month", "year")] + [pack_lookup(c) for c in PACKS]
    existing = prices_by_lookup(wanted)
    out = {k: v["id"] for k, v in existing.items()}
    for p in plans:
        product = None
        for interval, cents in (("month", p["monthly_cents"]), ("year", p["yearly_cents"])):
            key = plan_lookup(p["code"], interval)
            if key in out:
                continue
            product = product or _product(f"Venio {p['name']}", f"plan_{p['code']}")
            out[key] = request("POST", "/prices", {
                "product": product, "currency": CURRENCY, "unit_amount": cents, "lookup_key": key,
                "recurring": {"interval": interval}, "tax_behavior": "exclusive",
                "metadata": {"venio_plan": p["code"], "interval": interval},
            }, idempotency_key=f"venio-price-{key}-{cents}")["id"]
    for code, pack in PACKS.items():
        key = pack_lookup(code)
        if key in out:
            continue
        out[key] = request("POST", "/prices", {
            "product": _product(pack["name"], code), "currency": CURRENCY, "unit_amount": pack["cents"],
            "lookup_key": key, "tax_behavior": "exclusive", "metadata": {"venio_pack": code},
        }, idempotency_key=f"venio-price-{key}-{pack['cents']}")["id"]
    return out


# Version de la configuration du portail : à incrémenter quand les offres proposées changent. La version 2
# (offre unique, 24/11/2026) remplace la version 1, qui proposait encore Starter, Pro et Business.
PORTAL_VERSION = "2"


def ensure_portal(plans: list[dict[str, Any]], prices: dict[str, str]) -> str:
    """Configuration du portail client : factures, carte, passage mensuel / annuel, résiliation à échéance."""
    for c in request("GET", "/billing_portal/configurations", {"active": True, "limit": 100}).get("data", []):
        if (c.get("metadata") or {}).get("venio") == PORTAL_VERSION:
            return c["id"]
    products: dict[str, list[str]] = {}
    for p in plans:
        price_ids = [prices[plan_lookup(p["code"], i)] for i in ("month", "year")]
        product = request("GET", f"/prices/{price_ids[0]}")["product"]
        products[product] = price_ids
    return request("POST", "/billing_portal/configurations", {
        "business_profile": {"headline": "Venio — gérez votre abonnement"},
        "features": {
            "invoice_history": {"enabled": True},
            "payment_method_update": {"enabled": True},
            "customer_update": {"enabled": True, "allowed_updates": ["email", "address", "tax_id", "name"]},
            "subscription_cancel": {"enabled": True, "mode": "at_period_end",
                                    "cancellation_reason": {"enabled": True, "options": ["too_expensive", "missing_features", "switched_service", "unused", "other"]}},
            "subscription_update": {"enabled": True, "default_allowed_updates": ["price"], "proration_behavior": "create_prorations",
                                    "products": [{"product": prod, "prices": ids} for prod, ids in products.items()]},
        },
        "metadata": {"venio": PORTAL_VERSION},
    }, idempotency_key=f"venio-portal-config-v{PORTAL_VERSION}")["id"]


_lock = threading.Lock()
_cache: dict[str, Any] = {}


def ensure_catalog(plans: list[dict[str, Any]]) -> dict[str, Any]:
    """Prix des offres et des packs + portail client, créés chez Stripe s'ils n'existent pas (une seule fois)."""
    wanted = {plan_lookup(p["code"], i) for p in plans for i in ("month", "year")} | {pack_lookup(c) for c in PACKS}
    with _lock:
        if _cache and wanted <= set(_cache["prices"]):
            return _cache
        prices = ensure_prices(plans)
        _cache.update(prices=prices, portal=ensure_portal(plans, prices))
        return _cache


def reset_cache() -> None:
    with _lock:
        _cache.clear()


def plan_from_lookup(lookup_key: str | None) -> str | None:
    """« venio_pro_year » → « pro »."""
    if lookup_key and lookup_key.startswith("venio_") and lookup_key.rsplit("_", 1)[-1] in ("month", "year"):
        return lookup_key[len("venio_"):].rsplit("_", 1)[0]
    return None


async def _main() -> None:
    import asyncpg

    from ..config import get_settings
    dsn = get_settings().database_admin_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(dsn)
    try:
        plans = [dict(r) for r in await conn.fetch("SELECT code, name, monthly_cents, yearly_cents FROM plan WHERE is_active ORDER BY monthly_cents")]
        prices = ensure_prices(plans)
        for p in plans:
            await conn.execute("UPDATE plan SET stripe_price_monthly = $1, stripe_price_yearly = $2 WHERE code = $3",
                               prices[plan_lookup(p["code"], "month")], prices[plan_lookup(p["code"], "year")], p["code"])
        print("prix :", prices)
        print("portail :", ensure_portal(plans, prices))
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(_main())
