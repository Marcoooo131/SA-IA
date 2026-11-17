"""Espace entreprise : tableau de bord, rendez-vous, dossiers, notes, fichiers, historique d'envois."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .. import storage
from ..db import execute, fetch_all, fetch_one, tx
from ..deps import Auth, current_auth
from ..errors import api_error
from . import notifications
from .booking_core import SlotUnavailable, log_booking_event, reschedule

router = APIRouter(prefix="/api", tags=["entreprise"])

MIN_FUNNEL_SESSIONS = 30  # en dessous, on affiche des tendances, pas des conclusions


def _sid(rows: list[dict]) -> list[dict]:
    return [{k: (str(v) if isinstance(v, UUID) else v) for k, v in r.items()} for r in rows]


@router.get("/dashboard")
async def dashboard(auth: Auth = Depends(current_auth)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        tenant = await fetch_one(conn, "SELECT timezone FROM tenant WHERE id = :t", t=auth.tenant_id)
        tz = ZoneInfo(tenant["timezone"])
        today = datetime.now(tz).date()
        day_start = datetime.combine(today, datetime.min.time(), tz)
        bookings_sql = (
            "SELECT b.id, b.starts_at, b.ends_at, b.status, b.case_file_id, s.name AS service_name, s.meeting_type,"
            " c.first_name, c.last_name, c.phone, cf.summary, r.name AS resource_name"
            " FROM booking b JOIN service s ON s.id = b.service_id JOIN resource r ON r.id = b.resource_id"
            " LEFT JOIN case_file cf ON cf.id = b.case_file_id LEFT JOIN contact c ON c.id = cf.contact_id"
        )
        today_rows = await fetch_all(
            conn, bookings_sql + " WHERE b.status IN ('confirmed','completed','no_show') AND b.starts_at >= :a AND b.starts_at < :b"
            " ORDER BY b.starts_at", a=day_start, b=day_start + timedelta(days=1),
        )
        upcoming = await fetch_all(
            conn, bookings_sql + " WHERE b.status = 'confirmed' AND b.starts_at >= :a ORDER BY b.starts_at LIMIT 10",
            a=day_start + timedelta(days=1),
        )
        new_cases = await fetch_all(
            conn,
            "SELECT cf.id, cf.created_at, cf.summary, cf.completeness, c.first_name, c.last_name, s.name AS service_name"
            " FROM case_file cf JOIN contact c ON c.id = cf.contact_id LEFT JOIN service s ON s.id = cf.service_id"
            " WHERE cf.status = 'new' ORDER BY cf.created_at DESC LIMIT 10",
        )
        since = datetime.now(timezone.utc) - timedelta(days=30)
        counts = await fetch_one(
            conn,
            "SELECT"
            " (SELECT count(*) FROM analytics_event WHERE type = 'page_view' AND occurred_at >= :s) AS visits,"
            " (SELECT count(*) FROM analytics_event WHERE type = 'flow_start' AND occurred_at >= :s) AS starts,"
            " (SELECT count(*) FROM analytics_event WHERE type = 'booking' AND occurred_at >= :s) AS bookings,"
            " (SELECT count(*) FROM booking WHERE status = 'cancelled' AND created_at >= :s) AS cancelled,"
            " (SELECT count(*) FROM booking WHERE status = 'no_show' AND starts_at >= :s) AS no_show,"
            " (SELECT count(*) FROM booking WHERE status IN ('completed','no_show') AND starts_at >= :s) AS past,"
            " (SELECT count(*) FROM case_file WHERE status = 'new') AS new_requests,"
            " (SELECT count(*) FROM case_file WHERE status IN ('to_process','waiting','to_recontact')) AS pending",
            s=since,
        )
    starts = counts["starts"]
    return {
        "today": _sid(today_rows),
        "upcoming": _sid(upcoming),
        "new_cases": _sid(new_cases),
        "counts": counts,
        "rates_30d": {
            "conversion": round(counts["bookings"] / starts, 3) if starts else None,
            "abandon": round(1 - counts["bookings"] / starts, 3) if starts else None,
            "no_show": round(counts["no_show"] / counts["past"], 3) if counts["past"] else None,
            "sample_size": starts,
            "reliable": starts >= MIN_FUNNEL_SESSIONS,
        },
    }


@router.get("/funnel")
async def funnel(days: int = Query(default=30, ge=1, le=365), auth: Auth = Depends(current_auth)) -> dict:
    """Entonnoir par étape du parcours publié : combien de sessions ont vu / répondu à chaque question."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        flow = await fetch_one(
            conn, "SELECT v.id, v.definition FROM flow f JOIN flow_version v ON v.id = f.published_version_id WHERE f.is_default"
        )
        rows = await fetch_all(
            conn,
            "SELECT step_key, type, count(DISTINCT session_id) AS sessions FROM analytics_event"
            " WHERE flow_version_id = :v AND occurred_at >= :s AND session_id IS NOT NULL"
            " AND type IN ('step_view','step_answer') GROUP BY step_key, type",
            v=flow["id"], s=since,
        ) if flow else []
        totals = await fetch_one(
            conn,
            "SELECT count(DISTINCT session_id) FILTER (WHERE type = 'flow_start') AS starts,"
            " count(DISTINCT session_id) FILTER (WHERE type = 'slots_view') AS slots,"
            " count(DISTINCT session_id) FILTER (WHERE type = 'booking') AS bookings"
            " FROM analytics_event WHERE occurred_at >= :s" + (" AND flow_version_id = :v" if flow else ""),
            s=since, **({"v": flow["id"]} if flow else {}),
        )
    by = {(r["step_key"], r["type"]): r["sessions"] for r in rows}
    steps = []
    if flow:
        for step in flow["definition"]["steps"]:
            viewed, answered = by.get((step["id"], "step_view"), 0), by.get((step["id"], "step_answer"), 0)
            steps.append({"step": step["id"], "title": step["title"], "viewed": viewed, "answered": answered,
                          "drop_rate": round(1 - answered / viewed, 3) if viewed else None})
    return {"days": days, "totals": totals, "steps": steps, "reliable": (totals["starts"] or 0) >= MIN_FUNNEL_SESSIONS,
            "note": "Les taux sont indicatifs tant que le volume reste faible ; une corrélation n'est pas une cause."}


@router.get("/bookings")
async def list_bookings(
    start: date = Query(alias="from"), end: date = Query(alias="to"),
    status: str | None = None, auth: Auth = Depends(current_auth),
) -> list[dict]:
    if (end - start).days > 62:
        raise api_error(422, "range_too_large", "Période limitée à 62 jours.")
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        tz = ZoneInfo((await fetch_one(conn, "SELECT timezone FROM tenant WHERE id = :t", t=auth.tenant_id))["timezone"])
        rows = await fetch_all(
            conn,
            "SELECT b.id, b.starts_at, b.ends_at, b.status, b.case_file_id, b.resource_id, r.name AS resource_name,"
            " s.name AS service_name, s.meeting_type, c.first_name, c.last_name, c.phone, b.location"
            " FROM booking b JOIN service s ON s.id = b.service_id JOIN resource r ON r.id = b.resource_id"
            " LEFT JOIN case_file cf ON cf.id = b.case_file_id LEFT JOIN contact c ON c.id = cf.contact_id"
            " WHERE b.starts_at >= :a AND b.starts_at < :b AND b.status NOT IN ('held','expired')"
            " AND (CAST(:st AS text) IS NULL OR b.status = :st) ORDER BY b.starts_at",
            a=datetime.combine(start, datetime.min.time(), tz),
            b=datetime.combine(end + timedelta(days=1), datetime.min.time(), tz), st=status,
        )
    return _sid(rows)


class BookingPatch(BaseModel):
    status: Literal["confirmed", "completed", "no_show", "cancelled"] | None = None
    start: datetime | None = None


@router.patch("/bookings/{booking_id}")
async def patch_booking(booking_id: UUID, body: BookingPatch, auth: Auth = Depends(current_auth)) -> dict:
    actor = f"user:{auth.user_id}"
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        tenant = await fetch_one(
            conn, "SELECT id, slug, name, timezone, holidays_country, settings, notification_email FROM tenant WHERE id = :t",
            t=auth.tenant_id,
        )
        booking = await fetch_one(
            conn, "SELECT id, service_id, resource_id, case_file_id, starts_at, ends_at, status FROM booking WHERE id = :b"
            " AND status NOT IN ('held','expired') FOR UPDATE", b=booking_id,
        )
        if not booking:
            raise api_error(404, "not_found", "Rendez-vous introuvable.")
        contact = await fetch_one(
            conn, "SELECT c.id, c.first_name, c.last_name, c.email, c.phone FROM contact c"
            " JOIN case_file cf ON cf.contact_id = c.id WHERE cf.id = :c", c=booking["case_file_id"],
        ) if booking["case_file_id"] else None
        if body.start is not None:
            if booking["status"] != "confirmed":
                raise api_error(409, "not_confirmed", "Seul un rendez-vous confirmé peut être déplacé.")
            try:
                updated = await reschedule(conn, tenant, booking, body.start, actor)
            except SlotUnavailable:
                raise api_error(409, "slot_taken", "Ce créneau n'est pas disponible.") from None
            await notifications.on_booking_rescheduled(conn, tenant, {**booking, **updated}, contact)
        if body.status and body.status != booking["status"]:
            if body.status == "confirmed":
                raise api_error(422, "invalid_status", "Un rendez-vous ne peut pas être reconfirmé ici.")
            await execute(
                conn, "UPDATE booking SET status = :s, cancelled_by = CASE WHEN :s = 'cancelled' THEN 'business' END WHERE id = :b",
                s=body.status, b=booking_id,
            )
            await log_booking_event(conn, auth.tenant_id, booking_id, actor, body.status)
            case_status = {"cancelled": "cancelled", "completed": "done", "no_show": "no_show"}[body.status]
            if booking["case_file_id"]:
                await execute(conn, "UPDATE case_file SET status = :s WHERE id = :c", s=case_status, c=booking["case_file_id"])
            if body.status == "cancelled":
                await notifications.on_booking_cancelled(conn, tenant, booking, contact, by="business")
        row = await fetch_one(conn, "SELECT id, starts_at, ends_at, status FROM booking WHERE id = :b", b=booking_id)
    return _sid([row])[0]


@router.get("/case-files")
async def list_cases(status: str | None = None, q: str | None = Query(default=None, max_length=80),
                     limit: int = Query(default=50, le=200), auth: Auth = Depends(current_auth)) -> list[dict]:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        rows = await fetch_all(
            conn,
            "SELECT cf.id, cf.created_at, cf.status, cf.summary, cf.completeness, c.first_name, c.last_name, c.email,"
            " c.phone, s.name AS service_name,"
            " (SELECT min(b.starts_at) FROM booking b WHERE b.case_file_id = cf.id AND b.status = 'confirmed') AS next_booking"
            " FROM case_file cf JOIN contact c ON c.id = cf.contact_id LEFT JOIN service s ON s.id = cf.service_id"
            " WHERE (CAST(:st AS text) IS NULL OR cf.status = :st)"
            " AND (CAST(:q AS text) IS NULL OR c.first_name ILIKE :like OR c.last_name ILIKE :like"
            "      OR c.email ILIKE :like OR c.phone ILIKE :like OR cf.summary ILIKE :like)"
            " ORDER BY cf.created_at DESC LIMIT :n",
            st=status, q=q, like=f"%{q}%" if q else None, n=limit,
        )
    return _sid(rows)


@router.get("/case-files/{case_id}")
async def get_case(case_id: UUID, auth: Auth = Depends(current_auth)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        case = await fetch_one(
            conn,
            "SELECT cf.*, s.name AS service_name, s.meeting_type FROM case_file cf"
            " LEFT JOIN service s ON s.id = cf.service_id WHERE cf.id = :c", c=case_id,
        )
        if not case:
            raise api_error(404, "not_found", "Dossier introuvable.")
        contact = await fetch_one(
            conn, "SELECT id, first_name, last_name, email, phone, address, preferred_channel FROM contact WHERE id = :c",
            c=case["contact_id"],
        )
        bookings = await fetch_all(
            conn, "SELECT b.id, b.starts_at, b.ends_at, b.status, b.location, r.name AS resource_name FROM booking b"
            " JOIN resource r ON r.id = b.resource_id WHERE b.case_file_id = :c ORDER BY b.starts_at", c=case_id,
        )
        notes = await fetch_all(
            conn, "SELECT n.id, n.body, n.created_at, u.full_name AS author FROM note n"
            " LEFT JOIN app_user u ON u.id = n.author_id WHERE n.case_file_id = :c ORDER BY n.created_at DESC", c=case_id,
        )
        files = await fetch_all(
            conn, "SELECT id, original_name, mime_type, size_bytes FROM file_object WHERE case_file_id = :c", c=case_id
        )
        history = await fetch_all(
            conn,
            "SELECT e.created_at, e.actor, e.action, e.data FROM booking_event e JOIN booking b ON b.id = e.booking_id"
            " WHERE b.case_file_id = :c ORDER BY e.created_at", c=case_id,
        )
        sent = await fetch_all(
            conn,
            "SELECT n.template_key, n.channel, n.to_address, n.status, n.scheduled_for, n.sent_at, n.provider, n.last_error"
            " FROM notification n JOIN booking b ON b.id = n.booking_id WHERE b.case_file_id = :c ORDER BY n.scheduled_for",
            c=case_id,
        )
        consents = await fetch_all(
            conn, "SELECT channel, purpose, granted, created_at FROM consent WHERE contact_id = :c ORDER BY created_at",
            c=case["contact_id"],
        )
    return {"case": _sid([case])[0], "contact": _sid([contact])[0], "bookings": _sid(bookings),
            "notes": _sid(notes), "files": _sid(files), "history": history, "notifications": sent, "consents": consents}


class CasePatch(BaseModel):
    status: Literal["new", "to_process", "waiting", "confirmed", "to_recontact", "postponed", "cancelled", "done", "no_show"]


@router.patch("/case-files/{case_id}")
async def patch_case(case_id: UUID, body: CasePatch, auth: Auth = Depends(current_auth)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        row = await fetch_one(
            conn, "UPDATE case_file SET status = :s WHERE id = :c RETURNING id, status", s=body.status, c=case_id
        )
        if not row:
            raise api_error(404, "not_found", "Dossier introuvable.")
        await execute(
            conn, "INSERT INTO audit_log (tenant_id, actor_user_id, actor_kind, action, target) VALUES (:t, :u, 'user', :a, :c)",
            t=auth.tenant_id, u=auth.user_id, a=f"case_file.status:{body.status}", c=str(case_id),
        )
    return _sid([row])[0]


class NoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=10000)


@router.post("/case-files/{case_id}/notes", status_code=201)
async def add_note(case_id: UUID, body: NoteIn, auth: Auth = Depends(current_auth)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        if not await fetch_one(conn, "SELECT 1 FROM case_file WHERE id = :c", c=case_id):
            raise api_error(404, "not_found", "Dossier introuvable.")
        row = await fetch_one(
            conn, "INSERT INTO note (tenant_id, case_file_id, author_id, body) VALUES (:t, :c, :u, :b) RETURNING id, created_at",
            t=auth.tenant_id, c=case_id, u=auth.user_id, b=body.body.strip(),
        )
    return _sid([row])[0]


@router.get("/files/{file_id}")
async def download(file_id: UUID, auth: Auth = Depends(current_auth)) -> Response:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        f = await fetch_one(conn, "SELECT storage_key, mime_type, original_name FROM file_object WHERE id = :f", f=file_id)
    if not f:
        raise api_error(404, "not_found", "Fichier introuvable.")
    data = storage.read(f["storage_key"])
    safe_name = "".join(ch for ch in f["original_name"] if ch.isalnum() or ch in "._- ") or "fichier"
    return Response(content=data, media_type=f["mime_type"], headers={
        "Content-Disposition": f'inline; filename="{safe_name}"', "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300"})


@router.get("/notifications")
async def list_notifications(limit: int = Query(default=100, le=500), auth: Auth = Depends(current_auth)) -> list[dict]:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        rows = await fetch_all(
            conn,
            "SELECT id, template_key, channel, to_address, status, provider, scheduled_for, sent_at, attempts, last_error"
            " FROM notification ORDER BY scheduled_for DESC LIMIT :n", n=limit,
        )
    return _sid(rows)
