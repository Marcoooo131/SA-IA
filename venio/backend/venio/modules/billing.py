"""API abonnement (Stripe) et assistant de configuration.

Le paiement est hébergé par Stripe (Checkout) ; factures, carte, changement d'offre et résiliation passent
par le portail client Stripe. L'activation vient toujours du webhook vérifié, jamais du navigateur.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from ..billing import catalog
from ..billing.service import EXTRA_PERIOD, access_state, load_subscription, process_event
from ..billing.stripe_api import BillingNotConfigured, StripeError, request as stripe, verify_signature
from ..config import get_settings
from ..db import execute, fetch_all, fetch_one, j, tx
from ..deps import Auth, current_auth, require_role
from ..errors import api_error

router = APIRouter(prefix="/api/billing", tags=["abonnement"])
public_router = APIRouter(tags=["abonnement — webhook"])
admin = require_role("admin")
onboarding_router = APIRouter(prefix="/api/onboarding", tags=["assistant"])


def _app_url(path: str) -> str:
    return f"{get_settings().public_base_url.rstrip('/')}{path}"


async def _stripe(*args, **kwargs) -> dict:
    try:
        return await asyncio.to_thread(stripe, *args, **kwargs)
    except BillingNotConfigured as exc:
        raise api_error(503, "billing_not_configured", str(exc))
    except StripeError as exc:
        raise api_error(502, "stripe_error", f"Le service de paiement a refusé la demande : {exc}")


async def _catalog(conn) -> dict[str, Any]:
    """Offres, packs et portail chez Stripe — créés automatiquement au premier besoin."""
    plans = await fetch_all(conn, "SELECT code, name, monthly_cents, yearly_cents FROM plan WHERE is_active ORDER BY monthly_cents")
    try:
        return await asyncio.to_thread(catalog.ensure_catalog, plans)
    except BillingNotConfigured as exc:
        raise api_error(503, "billing_not_configured", str(exc))
    except StripeError as exc:
        raise api_error(502, "stripe_error", f"Le service de paiement a refusé la demande : {exc}")


async def _credits(conn) -> dict[str, Any]:
    tz = (await fetch_one(conn, "SELECT timezone FROM tenant"))["timezone"]
    lim = await fetch_one(conn, "SELECT pe.value FROM subscription s JOIN plan_entitlement pe ON pe.plan_id = s.plan_id"
                                " AND pe.key = 'limit.sms_credits_per_month'")
    used = await fetch_one(conn, "SELECT value FROM usage_counter WHERE key = 'sms_credits'"
                                 " AND period = date_trunc('month', now() AT TIME ZONE :tz)::date", tz=tz)
    extra = await fetch_one(conn, "SELECT value FROM usage_counter WHERE key = 'sms_credits_extra' AND period = :p",
                            p=datetime.fromisoformat(EXTRA_PERIOD).date())
    return {"monthly_limit": lim["value"] if lim else 0, "monthly_used": int(used["value"]) if used else 0,
            "extra_balance": int(extra["value"]) if extra else 0}


@router.get("")
async def billing(auth: Auth = Depends(current_auth)) -> dict:
    s = get_settings()
    async with tx(tenant_id=auth.tenant_id) as conn:
        sub = await load_subscription(conn)
        plans = await fetch_all(
            conn, "SELECT id, code, name, monthly_cents, yearly_cents"
                  " FROM plan WHERE is_public AND is_active ORDER BY monthly_cents")
        ents = await fetch_all(conn, "SELECT p.code, e.key, e.value FROM plan_entitlement e JOIN plan p ON p.id = e.plan_id")
        credits = await _credits(conn)
        grants = await fetch_all(conn, "SELECT credits, source, amount_cents, created_at FROM sms_credit_grant ORDER BY created_at DESC LIMIT 20")
    by_plan: dict[str, dict[str, Any]] = {}
    for e in ents:
        by_plan.setdefault(e["code"], {})[e["key"]] = e["value"]
    return {
        "configured": bool(s.stripe_secret_key), "test_mode": not s.stripe_live_enabled,
        "subscription": {k: sub[k] for k in ("status", "plan_code", "plan_name", "billing_interval", "trial_ends_at",
                                              "current_period_end", "cancel_at_period_end", "past_due_since")} | {
            "has_stripe": bool(sub["stripe_subscription_id"]), "has_customer": bool(sub["stripe_customer_id"])} if sub else None,
        "access": access_state(sub),
        "plans": [{**{k: p[k] for k in ("code", "name", "monthly_cents", "yearly_cents")}, "purchasable": bool(s.stripe_secret_key),
                   "entitlements": by_plan.get(p["code"], {})} for p in plans],
        "packs": [{"code": c, **v} for c, v in catalog.PACKS.items()],
        "credits": credits, "grants": grants,
    }


async def _ensure_customer(conn, auth: Auth, sub: dict[str, Any]) -> str:
    if sub["stripe_customer_id"]:
        return sub["stripe_customer_id"]
    tenant = await fetch_one(conn, "SELECT name FROM tenant")
    customer = await _stripe("POST", "/customers", {
        "email": auth.email, "name": tenant["name"], "metadata": {"tenant_id": str(auth.tenant_id)}},
        idempotency_key=f"venio-customer-{auth.tenant_id}")
    await execute(conn, "UPDATE subscription SET stripe_customer_id = :c, updated_at = now()", c=customer["id"])
    return customer["id"]


class CheckoutIn(BaseModel):
    plan: Literal["starter", "pro", "business"]
    interval: Literal["month", "year"] = "month"


@router.post("/checkout")
async def checkout(body: CheckoutIn, auth: Auth = Depends(admin)) -> dict:
    async with tx(tenant_id=auth.tenant_id) as conn:
        sub = await load_subscription(conn)
        if sub["stripe_subscription_id"] and sub["status"] not in ("canceled", "incomplete"):
            raise api_error(409, "already_subscribed", "Vous avez déjà un abonnement : changez d'offre depuis « Gérer mon abonnement ».")
        price = (await _catalog(conn))["prices"].get(catalog.plan_lookup(body.plan, body.interval))
        if not price:
            raise api_error(503, "billing_not_configured", "Cette offre n'est pas encore disponible au paiement en ligne.")
        customer = await _ensure_customer(conn, auth, sub)
    now = datetime.now(timezone.utc)
    sub_data: dict[str, Any] = {"metadata": {"tenant_id": str(auth.tenant_id)}}
    # L'essai en cours est conservé : la carte est enregistrée maintenant, le premier prélèvement a lieu à la fin de l'essai.
    if sub["status"] == "trialing" and sub["trial_ends_at"] and (sub["trial_ends_at"] - now).total_seconds() > 48 * 3600:
        sub_data["trial_end"] = int(sub["trial_ends_at"].timestamp())
    session = await _stripe("POST", "/checkout/sessions", {
        "mode": "subscription", "customer": customer, "client_reference_id": str(auth.tenant_id),
        "line_items": [{"price": price, "quantity": 1}], "subscription_data": sub_data,
        "allow_promotion_codes": True, "billing_address_collection": "required",
        "tax_id_collection": {"enabled": True}, "customer_update": {"name": "auto", "address": "auto"},
        "locale": "fr",
        "success_url": _app_url("/app/abonnement?retour=succes"),
        "cancel_url": _app_url("/app/abonnement?retour=annule"),
    })
    return {"url": session["url"]}


@router.post("/portal")
async def portal(auth: Auth = Depends(admin)) -> dict:
    async with tx(tenant_id=auth.tenant_id) as conn:
        sub = await load_subscription(conn)
        if not sub or not sub["stripe_customer_id"]:
            raise api_error(409, "no_customer", "Aucun moyen de paiement enregistré : choisissez d'abord une offre.")
        cat = await _catalog(conn)
    params: dict[str, Any] = {"customer": sub["stripe_customer_id"], "return_url": _app_url("/app/abonnement"),
                              "locale": "fr", "configuration": cat["portal"]}
    return {"url": (await _stripe("POST", "/billing_portal/sessions", params))["url"]}


class PackIn(BaseModel):
    pack: Literal["sms_100", "sms_500"]


@router.post("/sms-pack")
async def buy_pack(body: PackIn, auth: Auth = Depends(admin)) -> dict:
    pack = catalog.PACKS[body.pack]
    async with tx(tenant_id=auth.tenant_id) as conn:
        price_id = (await _catalog(conn))["prices"][catalog.pack_lookup(body.pack)]
        customer = await _ensure_customer(conn, auth, await load_subscription(conn))
    session = await _stripe("POST", "/checkout/sessions", {
        "mode": "payment", "customer": customer, "client_reference_id": str(auth.tenant_id),
        "line_items": [{"price": price_id, "quantity": 1}], "locale": "fr",
        "metadata": {"tenant_id": str(auth.tenant_id), "venio_pack": body.pack, "credits": pack["credits"]},
        "invoice_creation": {"enabled": True},
        "success_url": _app_url("/app/abonnement?retour=pack"), "cancel_url": _app_url("/app/abonnement?retour=annule"),
    })
    return {"url": session["url"]}


@public_router.post("/api/billing/webhook")
async def webhook(request: Request) -> dict:
    payload = await request.body()
    try:
        verify_signature(payload, request.headers.get("stripe-signature"), get_settings().stripe_webhook_secret)
        event = json.loads(payload)
    except (StripeError, ValueError):
        raise api_error(400, "invalid_signature", "Signature Stripe invalide.")
    if bool(event.get("livemode")) and not get_settings().stripe_live_enabled:
        raise api_error(400, "live_refused", "Événement réel refusé : Stripe est en mode test uniquement.")
    return {"result": await process_event(event)}


# ----------------------------------------------------------------------------- assistant de configuration

@onboarding_router.get("")
async def onboarding(auth: Auth = Depends(current_auth)) -> dict:
    """Étapes calculées à partir de l'état réel de l'espace (rien à cocher à la main), reprenables."""
    async with tx(tenant_id=auth.tenant_id) as conn:
        t = await fetch_one(conn, "SELECT vertical, public_profile, branding, settings FROM tenant")
        services = (await fetch_one(conn, "SELECT count(*) AS n FROM service WHERE is_active"))["n"]
        rules = (await fetch_one(conn, "SELECT count(*) AS n FROM availability_rule"))["n"]
        mc = await fetch_one(conn, "SELECT enabled FROM missed_call_settings")
        bookings = (await fetch_one(conn, "SELECT count(*) AS n FROM booking WHERE status IN ('confirmed','completed')"))["n"]
    prof, brand, settings = t["public_profile"] or {}, t["branding"] or {}, t["settings"] or {}
    skipped = set(settings.get("onboarding_skipped", []))
    steps = [
        {"key": "modele", "label": "Choisir votre modèle métier", "done": bool(t["vertical"]), "href": "/app/parcours"},
        {"key": "horaires", "label": "Vérifier vos horaires et prestations", "done": services > 0 and rules > 0 and "horaires" in set(settings.get("onboarding_seen", [])), "href": "/app/parametres?onglet=horaires"},
        {"key": "page", "label": "Personnaliser votre page (accroche, coordonnées, logo)", "done": bool(prof.get("tagline") or prof.get("phone") or brand.get("logo_url")), "href": "/app/parametres"},
        {"key": "appels", "label": "Récupération des appels manqués (facultatif)", "done": bool(mc and mc["enabled"]) or "appels" in skipped, "href": "/app/parametres?onglet=appels", "optional": True},
        {"key": "publier", "label": "Partager votre lien et recevoir une première réservation", "done": bookings > 0, "href": "/app"},
    ]
    return {"steps": steps, "done": sum(s["done"] for s in steps), "total": len(steps),
            "dismissed": bool(settings.get("onboarding_dismissed"))}


class OnboardingIn(BaseModel):
    seen: str | None = None
    skip: str | None = None
    dismiss: bool | None = None


@onboarding_router.post("")
async def onboarding_update(body: OnboardingIn, auth: Auth = Depends(current_auth)) -> dict:
    async with tx(tenant_id=auth.tenant_id) as conn:
        t = await fetch_one(conn, "SELECT settings FROM tenant")
        settings = dict(t["settings"] or {})
        for key, value in (("onboarding_seen", body.seen), ("onboarding_skipped", body.skip)):
            if value in ("horaires", "appels"):
                settings[key] = sorted(set(settings.get(key, [])) | {value})
        if body.dismiss is not None:
            settings["onboarding_dismissed"] = body.dismiss
        await execute(conn, "UPDATE tenant SET settings = CAST(:s AS jsonb) WHERE id = :t", s=j(settings), t=auth.tenant_id)
    return await onboarding(auth)
