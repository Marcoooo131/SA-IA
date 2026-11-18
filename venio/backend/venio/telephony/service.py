"""Récupération des appels manqués : ingestion des événements, machine d'états, décision, attribution.

Toutes les fonctions qui reçoivent `conn` s'exécutent dans une transaction positionnée sur l'entreprise
(RLS) : une entreprise ne peut jamais lire ni modifier les appels d'une autre.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import string
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncConnection

from ..config import get_settings
from ..db import execute, fetch_all, fetch_one, j
from ..scheduling.holidays import is_holiday
from . import phone, sms
from .adapters import CallEvent, CallEventType
from .rules import Facts, MissedCallConfig, decide

log = logging.getLogger("venio.missed_calls")
DAILY_SAFETY_LIMIT = 200                 # SMS par entreprise et par jour, contre les abus (SMS pumping)
SIMULATOR_DELAY_S = 3                    # délai de validation raccourci pour les lignes de test (affiché comme tel)
_ALPHABET = string.ascii_letters + string.digits


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def webhook_secret(line_id: UUID | str) -> str:
    """Secret de signature propre à une ligne, dérivé de la clé de l'application (jamais stocké)."""
    return hmac.new(get_settings().secret_key.encode(), f"telephony:{line_id}".encode(), hashlib.sha256).hexdigest()


def new_link_code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(8))


def link_url(code: str) -> str:
    return f"{get_settings().public_base_url.rstrip('/')}/c/{code}"


# ----------------------------------------------------------------------------- réglages

async def load_settings(conn: AsyncConnection) -> tuple[bool, MissedCallConfig]:
    row = await fetch_one(conn, "SELECT enabled, config FROM missed_call_settings")
    if not row:
        return False, MissedCallConfig()
    return row["enabled"], MissedCallConfig.model_validate(row["config"] or {})


# ----------------------------------------------------------------------------- ingestion

def _transition(call: dict[str, Any], ev: CallEvent, mode: str) -> dict[str, Any]:
    """Machine d'états : ringing → answered | transferred | missed | abandoned, puis fin d'appel.

    Les webhooks n'arrivent pas toujours dans l'ordre : une prise en charge (décroché, transfert)
    l'emporte toujours sur un « manqué » ou un « abandon », même reçu après.
    """
    upd: dict[str, Any] = {}
    outcome = call["outcome"]
    if ev.type == CallEventType.ANSWERED and outcome != "answered":
        upd.update(outcome="answered", answered_at=call["answered_at"] or ev.occurred_at)
    elif ev.type == CallEventType.TRANSFERRED and outcome not in ("answered", "transferred"):
        upd["outcome"] = "transferred"
    elif ev.type == CallEventType.MISSED and outcome == "pending":
        upd["outcome"] = "missed"
    elif ev.type == CallEventType.ABANDONED and outcome == "pending":
        upd["outcome"] = "abandoned"
    elif ev.type == CallEventType.INBOUND and outcome == "pending" and mode == "forward_no_answer":
        # Renvoi sur non-réponse : si l'appel arrive chez nous, l'entreprise n'a pas décroché.
        upd["outcome"] = "missed"
    if ev.type == CallEventType.COMPLETED:
        upd["ended_at"] = ev.occurred_at
    if ev.occurred_at < call["started_at"]:
        upd["started_at"] = ev.occurred_at
    return upd


async def ingest(conn: AsyncConnection, tenant_id: UUID, line: dict[str, Any], events: list[CallEvent],
                 delay_override_s: int | None = None) -> list[UUID]:
    """Enregistre des événements (idempotent) et programme l'évaluation des appels manqués."""
    touched: list[UUID] = []
    _, cfg = await load_settings(conn)
    for ev in events:
        raw = await fetch_one(
            conn,
            "INSERT INTO telephony_event_raw (tenant_id, line_id, provider, provider_event_id, payload)"
            " VALUES (:t, :l, :p, :e, CAST(:d AS jsonb)) ON CONFLICT DO NOTHING RETURNING id",
            t=tenant_id, l=line["id"], p=ev.provider, e=ev.provider_event_id, d=j(ev.raw),
        )
        if not raw:
            continue  # webhook rejoué : déjà traité
        from_number = phone.normalize(ev.from_raw)
        await execute(
            conn,
            "INSERT INTO call (tenant_id, line_id, provider, provider_call_id, from_number, from_raw, to_number, started_at)"
            " VALUES (:t, :l, :p, :c, :f, :fr, :to, :at) ON CONFLICT (tenant_id, provider, provider_call_id) DO NOTHING",
            t=tenant_id, l=line["id"], p=ev.provider, c=ev.provider_call_id, f=from_number, fr=ev.from_raw,
            to=ev.to_number, at=ev.occurred_at,
        )
        call = await fetch_one(
            conn, "SELECT * FROM call WHERE provider = :p AND provider_call_id = :c FOR UPDATE",
            p=ev.provider, c=ev.provider_call_id,
        )
        upd = _transition(call, ev, line["mode"])
        if upd:
            sets = ", ".join(f"{k} = :{k}" for k in upd)
            await execute(conn, f"UPDATE call SET {sets} WHERE id = :id", id=call["id"], **upd)
            call.update(upd)
        await execute(conn, "UPDATE telephony_line SET last_event_at = now() WHERE id = :l", l=line["id"])
        touched.append(call["id"])
        if call["outcome"] in ("missed", "abandoned"):
            await _schedule_evaluation(conn, tenant_id, call, cfg, line, delay_override_s)
    return touched


async def _schedule_evaluation(conn, tenant_id, call, cfg: MissedCallConfig, line, delay_override_s) -> None:
    rec = await fetch_one(
        conn,
        "INSERT INTO missed_call_recovery (tenant_id, call_id, from_number) VALUES (:t, :c, :f)"
        " ON CONFLICT (call_id) DO NOTHING RETURNING id",
        t=tenant_id, c=call["id"], f=call["from_number"],
    )
    if not rec:
        return  # une seule évaluation par appel, même si plusieurs scénarios ou événements le signalent
    delay = delay_override_s if delay_override_s is not None else (
        SIMULATOR_DELAY_S if line["provider"] == "simulator" else cfg.validation_delay_s)
    base = call["ended_at"] or utcnow()
    await execute(
        conn, "INSERT INTO job (tenant_id, kind, ref_id, run_at) VALUES (:t, 'missed_call_evaluate', :r, :w)",
        t=tenant_id, r=rec["id"], w=max(base, utcnow()) + timedelta(seconds=delay),
    )


# ----------------------------------------------------------------------------- décision

EXTRA_PERIOD = date(2000, 1, 1)   # solde des crédits achetés (packs), sans expiration — voir billing/service.py


async def _credit_balances(conn, month_start) -> tuple[int, int]:
    """(crédits restants du forfait mensuel, crédits achetés disponibles)."""
    lim = await fetch_one(
        conn,
        "SELECT pe.value FROM subscription s JOIN plan_entitlement pe ON pe.plan_id = s.plan_id"
        " AND pe.key = 'limit.sms_credits_per_month'",
    )
    used = await fetch_one(
        conn, "SELECT value FROM usage_counter WHERE key = 'sms_credits' AND period = :p", p=month_start)
    extra = await fetch_one(
        conn, "SELECT value FROM usage_counter WHERE key = 'sms_credits_extra' AND period = :p", p=EXTRA_PERIOD)
    monthly = int(lim["value"]) if lim and lim["value"] is not None else 0
    return max(0, monthly - int(used["value"] if used else 0)), max(0, int(extra["value"]) if extra else 0)


async def _excluded_numbers(conn, line: dict[str, Any], tenant: dict[str, Any]) -> set[str]:
    own = {phone.normalize(x) for x in [tenant["public_profile"].get("phone")] if x}
    lines = await fetch_all(conn, "SELECT business_number, provider_number FROM telephony_line")
    for ln in lines:
        own |= {phone.normalize(ln["business_number"]), phone.normalize(ln["provider_number"])}
    return {n for n in own if n}


async def evaluate(conn: AsyncConnection, recovery_id: UUID) -> str:
    """Applique les règles à un appel manqué, après la période de validation. Renvoie la décision."""
    rec = await fetch_one(conn, "SELECT * FROM missed_call_recovery WHERE id = :r FOR UPDATE", r=recovery_id)
    if not rec or rec["decision"] != "pending":
        return "ignored"
    call = await fetch_one(conn, "SELECT * FROM call WHERE id = :c", c=rec["call_id"])
    line = await fetch_one(conn, "SELECT * FROM telephony_line WHERE id = :l", l=call["line_id"])
    tenant = await fetch_one(conn, "SELECT id, slug, name, timezone, holidays_country, status, public_profile FROM tenant")
    number = call["from_number"]
    # Sérialise les décisions pour un même numéro : deux appels simultanés ne déclenchent qu'un SMS.
    if number:
        await execute(conn, "SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))", k=f"{tenant['id']}:{number}")

    enabled, cfg = await load_settings(conn)
    tz = ZoneInfo(tenant["timezone"])
    now = utcnow()
    month_start = now.astimezone(tz).date().replace(day=1)
    ended = call["ended_at"] or call["started_at"]

    async def count_sent(since) -> int:
        row = await fetch_one(
            conn,
            "SELECT count(*) AS n FROM missed_call_recovery WHERE from_number = :n AND decision = 'sent'"
            " AND decided_at > :s AND id <> :r", n=number, s=since, r=recovery_id)
        return row["n"]

    exclusions = {r["number"]: r["kind"] for r in await fetch_all(
        conn, "SELECT number, kind FROM phone_exclusion WHERE number = :n", n=number)} if number else {}
    called_back = bool(number and await fetch_one(
        conn, "SELECT 1 FROM call WHERE from_number = :n AND outcome = 'answered' AND started_at > :s LIMIT 1",
        n=number, s=call["started_at"]))
    recent_request = False
    if number and cfg.recent_request_days:
        rows = await fetch_all(
            conn,
            "SELECT c.phone FROM case_file cf JOIN contact c ON c.id = cf.contact_id"
            " WHERE cf.created_at > :s AND c.phone IS NOT NULL",
            s=now - timedelta(days=cfg.recent_request_days))
        recent_request = any(phone.normalize(r["phone"]) == number for r in rows)
    from ..modules.booking_core import load_default_flow
    has_page = tenant["status"] == "active" and (await load_default_flow(conn)) is not None
    text = sms.render(cfg.template_text(), tenant["name"], link_url("XXXXXXXX"), cfg.stop_mention)
    credits_needed = sms.segments(text)["segments"]
    sent_today = (await fetch_one(
        conn, "SELECT count(*) AS n FROM missed_call_recovery WHERE decision = 'sent' AND decided_at > :s",
        s=now - timedelta(hours=24)))["n"]

    facts = Facts(
        enabled=enabled, line_active=line["status"] == "active", outcome=call["outcome"], from_number=number,
        is_mobile=phone.is_fr_mobile(number),
        excluded=bool(number and (exclusions.get(number) == "excluded" or number in await _excluded_numbers(conn, line, tenant))),
        opted_out=exclusions.get(number) == "opt_out",
        sent_in_burst_window=await count_sent(now - timedelta(hours=cfg.burst_window_hours)) if number else 0,
        sent_30d=await count_sent(now - timedelta(days=30)) if number else 0,
        called_back=called_back, recent_request=recent_request, has_page=has_page,
        local_now=now.astimezone(tz), call_ended_local=ended.astimezone(tz),
        credits_needed=credits_needed, credits_left=sum(await _credit_balances(conn, month_start)),
        sent_today=sent_today, daily_limit=DAILY_SAFETY_LIMIT, config=cfg,
    )
    country = tenant["holidays_country"]
    d = decide(facts, lambda day: bool(country) and is_holiday(country, day))

    if d.action == "defer":
        await execute(
            conn, "INSERT INTO job (tenant_id, kind, ref_id, run_at) VALUES (:t, 'missed_call_evaluate', :r, :w)",
            t=tenant["id"], r=recovery_id, w=d.run_at_local.astimezone(timezone.utc))
        return "deferred"
    if d.action == "skip":
        await execute(
            conn, "UPDATE missed_call_recovery SET decision = 'not_sent', reason = :why, decided_at = now() WHERE id = :r",
            why=d.reason, r=recovery_id)
        return "not_sent"

    code = new_link_code()
    body = sms.render(cfg.template_text(), tenant["name"], link_url(code), cfg.stop_mention)
    seg = sms.segments(body)["segments"]
    await execute(conn, "INSERT INTO recovery_link (code, tenant_id, recovery_id) VALUES (:c, :t, :r)",
                  c=code, t=tenant["id"], r=recovery_id)
    # Le forfait mensuel d'abord, puis les crédits achetés.
    monthly_left, _ = await _credit_balances(conn, month_start)
    from_monthly = min(seg, monthly_left)
    from_extra = seg - from_monthly
    await execute(
        conn,
        "INSERT INTO usage_counter (tenant_id, key, period, value) VALUES (:t, 'sms_credits', :p, :v)"
        " ON CONFLICT (tenant_id, key, period) DO UPDATE SET value = usage_counter.value + :v",
        t=tenant["id"], p=month_start, v=from_monthly)
    if from_extra:
        await execute(conn, "UPDATE usage_counter SET value = value - :v WHERE key = 'sms_credits_extra' AND period = :p",
                      v=from_extra, p=EXTRA_PERIOD)
    notif = await fetch_one(
        conn,
        "INSERT INTO notification (tenant_id, channel, template_key, to_address, scheduled_for, body, segments, extra_segments)"
        " VALUES (:t, 'sms', 'missed_call_sms', :to, now(), :b, :s, :x) RETURNING id",
        t=tenant["id"], to=number, b=body, s=seg, x=from_extra)
    await execute(conn, "INSERT INTO job (tenant_id, kind, ref_id) VALUES (:t, 'send_notification', :r)",
                  t=tenant["id"], r=notif["id"])
    await execute(
        conn,
        "UPDATE missed_call_recovery SET decision = 'sent', reason = 'sent', decided_at = now(), link_code = :c,"
        " notification_id = :n, credits = :s WHERE id = :r",
        c=code, n=notif["id"], s=seg, r=recovery_id)
    return "sent"


async def refund_credits(conn: AsyncConnection, notification: dict[str, Any]) -> None:
    """Un SMS qui ne part pas (simulé, envois payants désactivés) ne consomme pas de crédit."""
    seg = notification.get("segments") or 0
    extra = notification.get("extra_segments") or 0
    if seg - extra:
        await execute(
            conn, "UPDATE usage_counter SET value = GREATEST(value - :v, 0) WHERE key = 'sms_credits'"
            " AND period = date_trunc('month', :at AT TIME ZONE (SELECT timezone FROM tenant))::date",
            v=seg - extra, at=notification["created_at"])
    if extra:
        await execute(conn, "UPDATE usage_counter SET value = value + :v WHERE key = 'sms_credits_extra' AND period = :p",
                      v=extra, p=EXTRA_PERIOD)


async def recovery_line_provider(conn: AsyncConnection, notification_id: UUID) -> str | None:
    row = await fetch_one(
        conn,
        "SELECT l.provider FROM missed_call_recovery r JOIN call c ON c.id = r.call_id"
        " JOIN telephony_line l ON l.id = c.line_id WHERE r.notification_id = :n", n=notification_id)
    return row["provider"] if row else None


# ----------------------------------------------------------------------------- attribution

async def attach_session(conn: AsyncConnection, tenant_id: UUID, code: str | None, session_id: UUID) -> None:
    if not code:
        return
    await execute(
        conn,
        "UPDATE missed_call_recovery r SET session_id = COALESCE(r.session_id, :s),"
        " form_started_at = COALESCE(r.form_started_at, now())"
        " FROM recovery_link l WHERE l.code = :c AND l.tenant_id = :t AND l.recovery_id = r.id",
        s=session_id, c=code[:16], t=tenant_id)


async def attach_booking(conn: AsyncConnection, tenant_id: UUID, session_id: UUID, booking_id: UUID) -> None:
    await execute(
        conn,
        "UPDATE missed_call_recovery r SET booking_id = COALESCE(r.booking_id, :b), booked_at = COALESCE(r.booked_at, now())"
        " FROM recovery_link l, intake_session s"
        " WHERE s.id = :s AND l.code = s.source->>'mc' AND l.tenant_id = :t AND l.recovery_id = r.id",
        b=booking_id, s=session_id, t=tenant_id)
