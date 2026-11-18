"""Abonnements : état d'accès, synchronisation depuis Stripe, crédits SMS achetés.

Règles (02 §11.2 et 05 §C) :
- seul un webhook vérifié active ou modifie un abonnement, jamais la page de retour du navigateur ;
- l'état local est recalculé à partir de l'objet relu chez Stripe, pas de l'ordre d'arrivée des événements ;
- on ne coupe jamais un rendez-vous déjà confirmé : seules les NOUVELLES réservations publiques sont suspendues.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncConnection

from ..config import get_settings
from ..db import execute, fetch_one, tx
from .catalog import plan_from_lookup
from .stripe_api import request

log = logging.getLogger("venio.billing")
EXTRA_PERIOD = "2000-01-01"   # période fixe du solde de crédits SMS achetés (sans expiration)

STATUS_MAP = {"trialing": "trialing", "active": "active", "past_due": "past_due", "unpaid": "unpaid",
              "canceled": "canceled", "incomplete": "incomplete", "incomplete_expired": "canceled", "paused": "unpaid"}


def _ts(v: int | None) -> datetime | None:
    return datetime.fromtimestamp(v, tz=timezone.utc) if v else None


def access_state(sub: dict[str, Any] | None, now: datetime | None = None) -> dict[str, Any]:
    """État d'accès d'une entreprise, affiché dans l'espace et appliqué aux pages publiques."""
    now = now or datetime.now(timezone.utc)
    if not sub:
        return {"state": "none", "public_blocked": False, "days_left": None, "grace_ends_at": None}
    status = sub["status"]
    trial_end = sub.get("trial_ends_at")
    has_stripe = bool(sub.get("stripe_subscription_id"))
    if status == "trialing":
        if trial_end and trial_end < now and not has_stripe:
            return {"state": "trial_expired", "public_blocked": True, "days_left": 0, "grace_ends_at": None}
        days = max(0, -(-int((trial_end - now).total_seconds()) // 86400)) if trial_end else None
        return {"state": "trial_paid" if has_stripe else "trial", "public_blocked": False, "days_left": days, "grace_ends_at": None}
    if status == "active":
        return {"state": "active", "public_blocked": False, "days_left": None, "grace_ends_at": None}
    if status == "past_due":
        since = sub.get("past_due_since") or now
        grace_end = since + timedelta(days=get_settings().billing_grace_days)
        blocked = now >= grace_end
        return {"state": "restricted" if blocked else "past_due", "public_blocked": blocked, "days_left": None, "grace_ends_at": grace_end}
    if status == "incomplete":
        return {"state": "incomplete", "public_blocked": False, "days_left": None, "grace_ends_at": None}
    return {"state": "restricted" if status == "unpaid" else "canceled", "public_blocked": True, "days_left": None, "grace_ends_at": None}


async def load_subscription(conn: AsyncConnection) -> dict[str, Any] | None:
    return await fetch_one(
        conn,
        "SELECT s.*, p.code AS plan_code, p.name AS plan_name FROM subscription s JOIN plan p ON p.id = s.plan_id")


async def public_blocked(conn: AsyncConnection) -> bool:
    return access_state(await load_subscription(conn))["public_blocked"]


# ----------------------------------------------------------------------------- synchronisation

async def sync_subscription(stripe_sub: dict[str, Any], tenant_hint: str | None = None) -> UUID | None:
    """Recopie l'état d'un abonnement Stripe (relu à la source) dans la table subscription."""
    meta = stripe_sub.get("metadata") or {}
    tenant_id = meta.get("tenant_id") or tenant_hint
    if not tenant_id:
        log.warning("abonnement Stripe %s sans entreprise associée", stripe_sub.get("id"))
        return None
    items = (stripe_sub.get("items") or {}).get("data") or []
    price = items[0]["price"] if items else {}
    status = STATUS_MAP.get(stripe_sub.get("status", ""), "incomplete")
    async with tx(tenant_id=tenant_id) as conn:
        cur = await load_subscription(conn)
        if not cur:
            log.warning("entreprise %s inconnue pour l'abonnement %s", tenant_id, stripe_sub.get("id"))
            return None
        code = plan_from_lookup(price.get("lookup_key")) or (price.get("metadata") or {}).get("venio_plan")
        plan = await fetch_one(
            conn, "SELECT id FROM plan WHERE code = :c OR stripe_price_monthly = :p OR stripe_price_yearly = :p"
                  " ORDER BY (code = :c) DESC LIMIT 1", c=code or "", p=price.get("id"))
        if status == "incomplete" and cur["status"] == "trialing" and not cur["stripe_subscription_id"]:
            return UUID(str(tenant_id))  # paiement pas encore abouti : l'essai en cours continue
        past_due_since = cur["past_due_since"] if status == "past_due" else None
        if status == "past_due" and not past_due_since:
            past_due_since = datetime.now(timezone.utc)
        await execute(
            conn,
            "UPDATE subscription SET plan_id = COALESCE(:plan, plan_id), billing_interval = :iv, status = :st,"
            " stripe_customer_id = :cus, stripe_subscription_id = :sid, stripe_price_id = :price,"
            " trial_ends_at = COALESCE(:trial, trial_ends_at), current_period_end = :pe,"
            " cancel_at_period_end = :cancel, past_due_since = :pds, updated_at = now()",
            plan=plan["id"] if plan else None,
            iv="year" if (price.get("recurring") or {}).get("interval") == "year" else "month",
            st=status, cus=stripe_sub.get("customer"), sid=stripe_sub.get("id"), price=price.get("id"),
            trial=_ts(stripe_sub.get("trial_end")) if status == "trialing" else None,
            pe=_ts(stripe_sub.get("current_period_end")), cancel=bool(stripe_sub.get("cancel_at_period_end")),
            pds=past_due_since)
    return UUID(str(tenant_id))


async def grant_credits(tenant_id: str, credits: int, ref: str, amount_cents: int | None, source: str = "stripe_pack") -> bool:
    """Crédite un pack de SMS une seule fois par paiement (unicité de la référence Stripe)."""
    async with tx(tenant_id=tenant_id) as conn:
        row = await fetch_one(
            conn,
            "INSERT INTO sms_credit_grant (tenant_id, credits, source, stripe_ref, amount_cents) VALUES (:t, :c, :s, :r, :a)"
            " ON CONFLICT (stripe_ref) DO NOTHING RETURNING id",
            t=tenant_id, c=credits, s=source, r=ref, a=amount_cents)
        if not row:
            return False
        await execute(
            conn,
            "INSERT INTO usage_counter (tenant_id, key, period, value) VALUES (:t, 'sms_credits_extra', :p, :v)"
            " ON CONFLICT (tenant_id, key, period) DO UPDATE SET value = usage_counter.value + :v",
            t=tenant_id, p=datetime.fromisoformat(EXTRA_PERIOD).date(), v=credits)
    return True


# ----------------------------------------------------------------------------- webhooks

HANDLED = {"checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
           "customer.subscription.deleted", "customer.subscription.trial_will_end", "customer.subscription.paused",
           "customer.subscription.resumed", "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"}


async def process_event(event: dict[str, Any]) -> str:
    """Traite un événement Stripe vérifié. Idempotent : un événement déjà traité est ignoré."""
    async with tx() as conn:
        seen = await fetch_one(conn, "SELECT processed_at FROM stripe_event WHERE id = :i", i=event["id"])
        if seen and seen["processed_at"]:
            return "duplicate"
        if not seen:
            await execute(conn, "INSERT INTO stripe_event (id, type) VALUES (:i, :t) ON CONFLICT DO NOTHING",
                          i=event["id"], t=event["type"])
    etype, obj = event["type"], event["data"]["object"]
    tenant: UUID | None = None
    result = "ignored"
    try:
        if etype == "checkout.session.completed":
            ref = obj.get("client_reference_id") or (obj.get("metadata") or {}).get("tenant_id")
            if obj.get("mode") == "subscription" and obj.get("subscription"):
                tenant = await sync_subscription(await asyncio.to_thread(request, "GET", f"/subscriptions/{obj['subscription']}"), ref)
                result = "subscription_synced"
            elif obj.get("mode") == "payment" and (obj.get("metadata") or {}).get("venio_pack"):
                if obj.get("payment_status") == "paid" and ref:
                    credits = int(obj["metadata"]["credits"])
                    await grant_credits(ref, credits, obj["id"], obj.get("amount_total"))
                    tenant, result = UUID(str(ref)), "credits_granted"
                else:
                    result = "payment_not_paid"
        elif etype.startswith("customer.subscription."):
            tenant = await sync_subscription(await asyncio.to_thread(request, "GET", f"/subscriptions/{obj['id']}"))
            result = "subscription_synced"
        elif etype.startswith("invoice.") and obj.get("subscription"):
            tenant = await sync_subscription(await asyncio.to_thread(request, "GET", f"/subscriptions/{obj['subscription']}"))
            result = "subscription_synced"
    except Exception as exc:  # noqa: BLE001 — journalisé ; Stripe renverra l'événement (réponse 500)
        async with tx() as conn:
            await execute(conn, "UPDATE stripe_event SET error = :e WHERE id = :i", e=str(exc)[:500], i=event["id"])
        raise
    async with tx() as conn:
        await execute(conn, "UPDATE stripe_event SET processed_at = now(), tenant_id = :t, error = NULL WHERE id = :i",
                      t=tenant, i=event["id"])
    return result
