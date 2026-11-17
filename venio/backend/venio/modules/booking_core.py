"""Logique de réservation partagée (parcours public, lien de gestion, espace entreprise)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from ..config import get_settings
from ..db import execute, fetch_all, fetch_one, is_sqlstate, j
from ..flows.schema import FlowDefinition
from ..scheduling.slots import ResourceSchedule, ServiceSpec, Slot, compute_slots

MAX_DAYS_PER_QUERY = 31


class SlotUnavailable(Exception):
    pass


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def load_public_tenant(conn: AsyncConnection, slug: str) -> dict[str, Any] | None:
    return await fetch_one(
        conn,
        "SELECT id, slug, name, vertical, timezone, holidays_country, branding, public_profile, settings,"
        " notification_email, status FROM tenant WHERE slug = :s",
        s=slug,
    )


async def load_default_flow(conn: AsyncConnection) -> tuple[UUID, FlowDefinition] | None:
    row = await fetch_one(
        conn,
        "SELECT v.id, v.definition FROM flow f JOIN flow_version v ON v.id = f.published_version_id"
        " WHERE f.is_default",
    )
    if not row:
        return None
    return row["id"], FlowDefinition.model_validate(row["definition"])


async def load_flow_version(conn: AsyncConnection, version_id: UUID) -> FlowDefinition:
    row = await fetch_one(conn, "SELECT definition FROM flow_version WHERE id = :v", v=version_id)
    return FlowDefinition.model_validate(row["definition"])


SERVICE_COLUMNS = (
    "id, key, name, description, meeting_type, duration_min, buffer_before_min, buffer_after_min,"
    " slot_interval_min, min_notice_min, max_horizon_days, price_display, is_active"
)


async def service_by_key(conn: AsyncConnection, key: str) -> dict[str, Any] | None:
    return await fetch_one(conn, f"SELECT {SERVICE_COLUMNS} FROM service WHERE key = :k AND is_active", k=key)


async def service_by_id(conn: AsyncConnection, service_id: UUID) -> dict[str, Any] | None:
    return await fetch_one(conn, f"SELECT {SERVICE_COLUMNS} FROM service WHERE id = :i", i=service_id)


def spec_of(service: dict[str, Any]) -> ServiceSpec:
    return ServiceSpec(
        duration_min=service["duration_min"], buffer_before_min=service["buffer_before_min"],
        buffer_after_min=service["buffer_after_min"], slot_interval_min=service["slot_interval_min"],
        min_notice_min=service["min_notice_min"], max_horizon_days=service["max_horizon_days"],
    )


async def service_slots(
    conn: AsyncConnection,
    tenant: dict[str, Any],
    service: dict[str, Any],
    day_from: date,
    day_to: date,
    *,
    ignore_booking_id: UUID | None = None,
    now: datetime | None = None,
) -> list[Slot]:
    now = now or utcnow()
    tz = ZoneInfo(tenant["timezone"])
    range_start = datetime.combine(day_from, datetime.min.time(), tz) - timedelta(days=1)
    range_end = datetime.combine(day_to, datetime.min.time(), tz) + timedelta(days=2)

    resources = await fetch_all(
        conn,
        "SELECT r.id FROM resource r JOIN service_resource sr ON sr.resource_id = r.id"
        " WHERE sr.service_id = :s AND r.is_active ORDER BY r.created_at",
        s=service["id"],
    )
    if not resources:
        return []
    ids = [r["id"] for r in resources]
    rules = await fetch_all(
        conn, "SELECT resource_id, weekday, start_time, end_time FROM availability_rule WHERE resource_id = ANY(:ids)",
        ids=ids,
    )
    busy = await fetch_all(
        conn,
        "SELECT resource_id, lower(time_range) AS s, upper(time_range) AS e FROM booking"
        " WHERE resource_id = ANY(:ids) AND time_range && tstzrange(:a, :b)"
        " AND (status = 'confirmed' OR (status = 'held' AND hold_expires_at > now()))"
        " AND (CAST(:ignore AS uuid) IS NULL OR id <> CAST(:ignore AS uuid))"
        " UNION ALL"
        " SELECT resource_id, lower(time_range), upper(time_range) FROM time_off"
        " WHERE (resource_id IS NULL OR resource_id = ANY(:ids)) AND time_range && tstzrange(:a, :b)",
        ids=ids, a=range_start, b=range_end, ignore=ignore_booking_id,
    )
    schedules = []
    for rid in ids:
        schedules.append(ResourceSchedule(
            resource_id=str(rid),
            rules=[(r["weekday"], r["start_time"], r["end_time"]) for r in rules if r["resource_id"] == rid],
            busy=[(b["s"], b["e"]) for b in busy if b["resource_id"] in (rid, None)],
        ))
    return compute_slots(spec_of(service), schedules, day_from, day_to, tenant["timezone"], now,
                         tenant["holidays_country"])


async def find_slot(conn, tenant, service, start: datetime, ignore_booking_id: UUID | None = None) -> Slot:
    local_day = start.astimezone(ZoneInfo(tenant["timezone"])).date()
    for slot in await service_slots(conn, tenant, service, local_day, local_day, ignore_booking_id=ignore_booking_id):
        if slot.start == start:
            return slot
    raise SlotUnavailable()


async def create_hold(
    conn: AsyncConnection, tenant: dict[str, Any], service: dict[str, Any], start: datetime, intake_session_id: UUID
) -> dict[str, Any]:
    """Bloque temporairement un créneau. La contrainte d'exclusion garantit l'absence de doublon."""
    start = start.astimezone(timezone.utc)
    # Un seul blocage actif par parcours (libéré d'abord : re-choisir le même créneau reste possible).
    await execute(
        conn, "UPDATE booking SET status = 'expired' WHERE intake_session_id = :s AND status = 'held'",
        s=intake_session_id,
    )
    slot = await find_slot(conn, tenant, service, start)
    block_start, block_end = spec_of(service).block(start)
    hold_until = utcnow() + timedelta(minutes=get_settings().hold_minutes)
    for resource_id in slot.resource_ids:
        # Les blocages expirés qui gêneraient encore la contrainte sont libérés.
        await execute(
            conn,
            "UPDATE booking SET status = 'expired' WHERE resource_id = :r AND status = 'held'"
            " AND hold_expires_at <= now() AND time_range && tstzrange(:a, :b)",
            r=UUID(resource_id), a=block_start, b=block_end,
        )
        try:
            async with conn.begin_nested():
                return await fetch_one(
                    conn,
                    "INSERT INTO booking (tenant_id, intake_session_id, service_id, resource_id, starts_at, ends_at,"
                    " time_range, status, hold_expires_at)"
                    " VALUES (:t, :s, :svc, :r, :st, :en, tstzrange(:a, :b), 'held', :h)"
                    " RETURNING id, starts_at, ends_at, hold_expires_at, resource_id",
                    t=tenant["id"], s=intake_session_id, svc=service["id"], r=UUID(resource_id),
                    st=start, en=slot.end, a=block_start, b=block_end, h=hold_until,
                )
        except IntegrityError as exc:
            if not is_sqlstate(exc, "23P01"):
                raise
            continue  # pris entre-temps : on essaie le collaborateur suivant
    raise SlotUnavailable()


async def reschedule(
    conn: AsyncConnection, tenant: dict[str, Any], booking: dict[str, Any], start: datetime, actor: str
) -> dict[str, Any]:
    service = await service_by_id(conn, booking["service_id"])
    start = start.astimezone(timezone.utc)
    slot = await find_slot(conn, tenant, service, start, ignore_booking_id=booking["id"])
    block_start, block_end = spec_of(service).block(start)
    resource_ids = list(slot.resource_ids)
    if str(booking["resource_id"]) in resource_ids:  # garder le même interlocuteur si possible
        resource_ids.remove(str(booking["resource_id"]))
        resource_ids.insert(0, str(booking["resource_id"]))
    for resource_id in resource_ids:
        try:
            async with conn.begin_nested():
                row = await fetch_one(
                    conn,
                    "UPDATE booking SET starts_at = :st, ends_at = :en, time_range = tstzrange(:a, :b), resource_id = :r"
                    " WHERE id = :id RETURNING id, starts_at, ends_at, resource_id",
                    st=start, en=slot.end, a=block_start, b=block_end, r=UUID(resource_id), id=booking["id"],
                )
            await log_booking_event(conn, tenant["id"], booking["id"], actor, "rescheduled",
                                    {"from": booking["starts_at"], "to": start})
            return row
        except IntegrityError as exc:
            if not is_sqlstate(exc, "23P01"):
                raise
    raise SlotUnavailable()


async def log_booking_event(conn, tenant_id, booking_id, actor: str, action: str, data: dict | None = None) -> None:
    await execute(
        conn,
        "INSERT INTO booking_event (tenant_id, booking_id, actor, action, data) VALUES (:t, :b, :a, :x, CAST(:d AS jsonb))",
        t=tenant_id, b=booking_id, a=actor, x=action, d=j(data or {}),
    )


def group_slots_by_day(slots: list[Slot], tz_name: str) -> list[dict[str, Any]]:
    tz = ZoneInfo(tz_name)
    days: dict[str, list[dict[str, str]]] = {}
    for s in slots:
        local = s.start.astimezone(tz)
        days.setdefault(local.date().isoformat(), []).append(
            {"start": s.start.isoformat(), "time": local.strftime("%H:%M")}
        )
    return [{"date": d, "slots": v} for d, v in days.items()]
