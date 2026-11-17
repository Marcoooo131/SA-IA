"""Notifications : planification, rendu, envoi et file de tâches.

Chaque message est une ligne `notification` (historique complet) et une ligne `job`
(identifiant uniquement). Le worker prend les tâches dues avec SKIP LOCKED, puis traite
chaque message dans le contexte RLS de l'entreprise concernée.

Fournisseur "log" (par défaut) : le message est rendu et enregistré avec le statut « logged »,
il n'est PAS envoyé. Fournisseur "smtp" : envoi réel (Brevo, Scaleway TEM, Postmark… via SMTP).
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncConnection

from ..config import get_settings
from ..db import execute, fetch_all, fetch_one, tx
from ..security import signed_token

log = logging.getLogger("venio.notifications")

MAX_ATTEMPTS = 5
MEETING_LABELS = {"on_site": "à votre adresse", "at_location": "dans nos locaux", "video": "en visio", "phone": "par téléphone"}
FR_DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
FR_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre",
             "octobre", "novembre", "décembre"]


def manage_url(tenant_slug: str, booking_id: UUID | str) -> str:
    s = get_settings()
    return f"{s.public_base_url}/r/{tenant_slug}/rdv/{signed_token(s.secret_key, 'manage', str(booking_id))}"


def fr_datetime(dt: datetime, tz_name: str) -> str:
    local = dt.astimezone(ZoneInfo(tz_name))
    return f"{FR_DAYS[local.weekday()]} {local.day} {FR_MONTHS[local.month - 1]} {local.year} à {local:%H:%M}"


async def _enqueue(conn: AsyncConnection, tenant_id, booking_id, contact_id, template_key: str, to: str | None,
                   when: datetime) -> None:
    if not to:
        return
    row = await fetch_one(
        conn,
        "INSERT INTO notification (tenant_id, booking_id, contact_id, channel, template_key, to_address, scheduled_for)"
        " VALUES (:t, :b, :c, 'email', :k, :to, :w) RETURNING id",
        t=tenant_id, b=booking_id, c=contact_id, k=template_key, to=to, w=when,
    )
    await execute(
        conn, "INSERT INTO job (tenant_id, kind, ref_id, run_at) VALUES (:t, 'send_notification', :r, :w)",
        t=tenant_id, r=row["id"], w=when,
    )


async def on_booking_confirmed(conn: AsyncConnection, tenant: dict, booking: dict, contact: dict) -> None:
    now = datetime.now(timezone.utc)
    await _enqueue(conn, tenant["id"], booking["id"], contact["id"], "client_confirmation", contact.get("email"), now)
    await _enqueue(conn, tenant["id"], booking["id"], None, "business_new_booking", tenant.get("notification_email"), now)
    await schedule_reminders(conn, tenant, booking, contact)


async def schedule_reminders(conn: AsyncConnection, tenant: dict, booking: dict, contact: dict) -> None:
    now = datetime.now(timezone.utc)
    for template_key, before in (("client_reminder", timedelta(hours=24)),):
        when = booking["starts_at"] - before
        if when > now + timedelta(minutes=30):
            await _enqueue(conn, tenant["id"], booking["id"], contact["id"], template_key, contact.get("email"), when)


async def cancel_pending(conn: AsyncConnection, booking_id: UUID) -> None:
    ids = await fetch_all(
        conn, "UPDATE notification SET status = 'cancelled' WHERE booking_id = :b AND status = 'scheduled' RETURNING id",
        b=booking_id,
    )
    if ids:
        await execute(
            conn, "UPDATE job SET status = 'cancelled' WHERE kind = 'send_notification' AND ref_id = ANY(:ids) AND status = 'pending'",
            ids=[r["id"] for r in ids],
        )


async def on_booking_cancelled(conn: AsyncConnection, tenant: dict, booking: dict, contact: dict | None, by: str) -> None:
    await cancel_pending(conn, booking["id"])
    now = datetime.now(timezone.utc)
    if contact:
        await _enqueue(conn, tenant["id"], booking["id"], contact["id"], "client_cancellation", contact.get("email"), now)
    if by == "client":
        await _enqueue(conn, tenant["id"], booking["id"], None, "business_cancellation", tenant.get("notification_email"), now)


async def on_booking_rescheduled(conn: AsyncConnection, tenant: dict, booking: dict, contact: dict | None) -> None:
    await cancel_pending(conn, booking["id"])
    if contact:
        now = datetime.now(timezone.utc)
        await _enqueue(conn, tenant["id"], booking["id"], contact["id"], "client_rescheduled", contact.get("email"), now)
        await schedule_reminders(conn, tenant, booking, contact)
    await _enqueue(conn, tenant["id"], booking["id"], None, "business_rescheduled", tenant.get("notification_email"),
                   datetime.now(timezone.utc))


# ----------------------------------------------------------------------------- rendu

def render(template_key: str, ctx: dict[str, Any]) -> tuple[str, str]:
    """Renvoie (sujet, texte). Le texte est volontairement simple et lisible sur mobile."""
    t, b = ctx["tenant"], ctx["booking"]
    when = fr_datetime(b["starts_at"], t["timezone"])
    where = MEETING_LABELS.get(ctx["service"]["meeting_type"], "")
    service = ctx["service"]["name"]
    first = (ctx.get("contact") or {}).get("first_name", "")
    contact_line = ""
    if ctx.get("contact"):
        c = ctx["contact"]
        contact_line = f"{c['first_name']} {c.get('last_name') or ''}".strip()
        contact_line += f" · {c.get('email') or ''} · {c.get('phone') or ''}"
    manage = ctx.get("manage_url", "")
    dash = f"{get_settings().public_base_url}/app/dossiers/{b.get('case_file_id') or ''}"
    signature = f"\n\n— {t['name']}\n(Message envoyé via Venio)"
    if template_key == "client_confirmation":
        return (f"Rendez-vous confirmé — {when}",
                f"Bonjour {first},\n\nVotre rendez-vous « {service} » {where} est confirmé pour le {when}.\n\n"
                f"Pour le reporter ou l'annuler : {manage}{signature}")
    if template_key == "client_reminder":
        return (f"Rappel : votre rendez-vous {when}",
                f"Bonjour {first},\n\nNous vous rappelons votre rendez-vous « {service} » {where} le {when}.\n\n"
                f"Un empêchement ? Reportez ou annulez ici : {manage}{signature}")
    if template_key == "client_cancellation":
        return ("Rendez-vous annulé",
                f"Bonjour {first},\n\nVotre rendez-vous « {service} » du {when} est annulé.\n\n"
                f"Vous pouvez reprendre rendez-vous à tout moment : {get_settings().public_base_url}/r/{t['slug']}{signature}")
    if template_key == "client_rescheduled":
        return (f"Rendez-vous déplacé — {when}",
                f"Bonjour {first},\n\nVotre rendez-vous « {service} » a été déplacé au {when}.\n\n"
                f"Pour le modifier : {manage}{signature}")
    if template_key == "business_new_booking":
        return (f"Nouveau rendez-vous : {contact_line.split(' · ')[0]} — {when}",
                f"Nouveau rendez-vous « {service} » le {when}.\n\nClient : {contact_line}\n\n"
                f"{ctx.get('summary') or ''}\n\nDossier complet : {dash}")
    if template_key == "business_cancellation":
        return (f"Rendez-vous annulé par le client — {when}",
                f"Le client a annulé le rendez-vous « {service} » du {when}.\n\nClient : {contact_line}\n\nDossier : {dash}")
    if template_key == "business_rescheduled":
        return (f"Rendez-vous déplacé — {when}",
                f"Le rendez-vous « {service} » a été déplacé au {when}.\n\nClient : {contact_line}\n\nDossier : {dash}")
    raise ValueError(f"modèle inconnu : {template_key}")


async def _context(conn: AsyncConnection, notif: dict) -> dict[str, Any]:
    booking = await fetch_one(
        conn, "SELECT id, service_id, case_file_id, starts_at, ends_at, status FROM booking WHERE id = :b", b=notif["booking_id"]
    )
    tenant = await fetch_one(conn, "SELECT id, slug, name, timezone FROM tenant WHERE id = :t", t=notif["tenant_id"])
    service = await fetch_one(conn, "SELECT name, meeting_type FROM service WHERE id = :s", s=booking["service_id"])
    contact = None
    case = None
    if booking["case_file_id"]:
        case = await fetch_one(conn, "SELECT contact_id, summary FROM case_file WHERE id = :c", c=booking["case_file_id"])
        contact = await fetch_one(
            conn, "SELECT first_name, last_name, email, phone FROM contact WHERE id = :c", c=case["contact_id"]
        )
    return {"tenant": tenant, "booking": booking, "service": service, "contact": contact,
            "summary": case["summary"] if case else None, "manage_url": manage_url(tenant["slug"], booking["id"])}


# ----------------------------------------------------------------------------- envoi

def _send_smtp(to: str, subject: str, body: str) -> str:
    s = get_settings()
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = s.email_from, to, subject
    msg.set_content(body)
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
        if s.smtp_starttls:
            smtp.starttls()
        if s.smtp_user:
            smtp.login(s.smtp_user, s.smtp_password)
        smtp.send_message(msg)
    return msg.get("Message-ID", "")


async def deliver(conn: AsyncConnection, notification_id: UUID) -> str:
    notif = await fetch_one(conn, "SELECT * FROM notification WHERE id = :n FOR UPDATE", n=notification_id)
    if not notif or notif["status"] != "scheduled":
        return "ignored"
    ctx = await _context(conn, notif)
    if notif["template_key"].startswith("client_reminder") and ctx["booking"]["status"] != "confirmed":
        await execute(conn, "UPDATE notification SET status = 'skipped' WHERE id = :n", n=notification_id)
        return "skipped"
    subject, body = render(notif["template_key"], ctx)
    provider = get_settings().email_provider
    if provider == "smtp":
        msg_id = await asyncio.to_thread(_send_smtp, notif["to_address"], subject, body)
        status = "sent"
    else:
        log.info("[email non envoyé — fournisseur log] à %s : %s", notif["to_address"], subject)
        msg_id, status = None, "logged"
    await execute(
        conn,
        "UPDATE notification SET status = :st, provider = :p, provider_msg_id = :m, sent_at = now(),"
        " attempts = attempts + 1, last_error = NULL WHERE id = :n",
        st=status, p=provider, m=msg_id, n=notification_id,
    )
    return status


async def run_due_jobs(batch: int = 20) -> int:
    """Traite les tâches dues. Renvoie le nombre de tâches traitées."""
    async with tx() as conn:
        jobs = await fetch_all(
            conn,
            "UPDATE job SET status = 'running', locked_at = now(), attempts = attempts + 1"
            " WHERE id IN (SELECT id FROM job WHERE status = 'pending' AND run_at <= now()"
            "              ORDER BY run_at LIMIT :n FOR UPDATE SKIP LOCKED)"
            " RETURNING id, tenant_id, kind, ref_id, attempts",
            n=batch,
        )
    for job in jobs:
        try:
            async with tx(tenant_id=job["tenant_id"]) as conn:
                if job["kind"] == "send_notification":
                    await deliver(conn, job["ref_id"])
            async with tx() as conn:
                await execute(conn, "UPDATE job SET status = 'done' WHERE id = :i", i=job["id"])
        except Exception as exc:  # noqa: BLE001 — toute erreur est journalisée et réessayée
            log.exception("échec de la tâche %s", job["id"])
            final = job["attempts"] >= MAX_ATTEMPTS
            async with tx() as conn:
                await execute(
                    conn,
                    "UPDATE job SET status = :s, last_error = :e, run_at = now() + make_interval(mins => :m)"
                    " WHERE id = :i",
                    s="failed" if final else "pending", e=str(exc)[:500], m=5 * job["attempts"], i=job["id"],
                )
            if job["kind"] == "send_notification":
                async with tx(tenant_id=job["tenant_id"]) as conn:
                    await execute(
                        conn,
                        "UPDATE notification SET attempts = attempts + 1, last_error = :e,"
                        " status = CASE WHEN :final THEN 'failed' ELSE status END WHERE id = :n",
                        e=str(exc)[:500], final=final, n=job["ref_id"],
                    )
    # Tâches bloquées (worker arrêté en cours de traitement) : remises en file après 10 minutes.
    async with tx() as conn:
        await execute(
            conn, "UPDATE job SET status = 'pending' WHERE status = 'running' AND locked_at < now() - interval '10 minutes'"
        )
    return len(jobs)


async def worker_loop(interval_s: float = 10.0) -> None:
    while True:
        try:
            await run_due_jobs()
        except Exception:  # noqa: BLE001
            log.exception("boucle worker")
        await asyncio.sleep(interval_s)
