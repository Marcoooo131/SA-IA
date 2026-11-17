"""Paramètres de l'entreprise : page publique, prestations, disponibilités, absences, parcours."""
from __future__ import annotations

import re
from datetime import datetime, time
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, EmailStr, Field, ValidationError, model_validator

from ..db import execute, fetch_all, fetch_one, tx
from ..deps import Auth, current_auth, require_role
from ..errors import api_error
from ..flows.schema import FlowDefinition
from .business import _sid

router = APIRouter(prefix="/api/settings", tags=["paramètres"])
admin = require_role("admin")
COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


# ----------------------------------------------------------------------------- page publique

class Branding(BaseModel):
    primary_color: str = "#14213D"
    accent_color: str = "#F28C28"
    logo_url: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _colors(self) -> "Branding":
        for c in (self.primary_color, self.accent_color):
            if not COLOR_RE.match(c):
                raise ValueError("couleur attendue au format #RRGGBB")
        return self


class PublicProfile(BaseModel):
    tagline: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=1500)
    phone: str = Field(default="", max_length=30)
    email: str = Field(default="", max_length=120)
    address: str = Field(default="", max_length=200)
    service_area: str = Field(default="", max_length=200)
    opening_hours: str = Field(default="", max_length=300)
    reassurance: list[str] = Field(default_factory=list, max_length=6)


class TenantSettings(BaseModel):
    postal_prefixes: list[str] = Field(default_factory=list, max_length=200)
    cancel_notice_min: int = Field(default=120, ge=0, le=10080)


class ProfileIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    notification_email: EmailStr
    timezone: str = "Europe/Paris"
    holidays_country: Literal["FR"] | None = "FR"
    branding: Branding
    public_profile: PublicProfile
    settings: TenantSettings


@router.get("/profile")
async def get_profile(auth: Auth = Depends(current_auth)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        row = await fetch_one(
            conn,
            "SELECT name, slug, vertical, notification_email, timezone, holidays_country, branding, public_profile, settings"
            " FROM tenant WHERE id = :t", t=auth.tenant_id,
        )
    return row


@router.put("/profile")
async def put_profile(body: ProfileIn, auth: Auth = Depends(admin)) -> dict:
    try:
        from zoneinfo import ZoneInfo
        ZoneInfo(body.timezone)
    except Exception:  # noqa: BLE001
        raise api_error(422, "invalid_timezone", "Fuseau horaire inconnu.") from None
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        await execute(
            conn,
            "UPDATE tenant SET name = :n, notification_email = :e, timezone = :tz, holidays_country = :h,"
            " branding = CAST(:b AS jsonb), public_profile = CAST(:p AS jsonb), settings = CAST(:s AS jsonb) WHERE id = :t",
            n=body.name, e=body.notification_email, tz=body.timezone, h=body.holidays_country,
            b=body.branding.model_dump_json(), p=body.public_profile.model_dump_json(),
            s=body.settings.model_dump_json(), t=auth.tenant_id,
        )
    return {"ok": True}


# ----------------------------------------------------------------------------- prestations

class ServiceIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    meeting_type: Literal["on_site", "at_location", "video", "phone"]
    duration_min: int = Field(ge=5, le=600)
    buffer_before_min: int = Field(default=0, ge=0, le=240)
    buffer_after_min: int = Field(default=0, ge=0, le=240)
    slot_interval_min: int = Field(default=30, ge=5, le=240)
    min_notice_min: int = Field(default=120, ge=0, le=43200)
    max_horizon_days: int = Field(default=60, ge=1, le=365)
    price_display: str | None = Field(default=None, max_length=80)
    is_active: bool = True
    resource_ids: list[UUID] = Field(min_length=1)


class ServiceCreate(ServiceIn):
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")


async def _set_service_resources(conn, tenant_id, service_id, resource_ids: list[UUID]) -> None:
    found = await fetch_all(conn, "SELECT id FROM resource WHERE id = ANY(:ids)", ids=resource_ids)
    if len(found) != len(set(resource_ids)):
        raise api_error(422, "unknown_resource", "Collaborateur inconnu.")
    await execute(conn, "DELETE FROM service_resource WHERE service_id = :s", s=service_id)
    for rid in set(resource_ids):
        await execute(conn, "INSERT INTO service_resource (tenant_id, service_id, resource_id) VALUES (:t, :s, :r)",
                      t=tenant_id, s=service_id, r=rid)


SERVICE_FIELDS = ["name", "description", "meeting_type", "duration_min", "buffer_before_min", "buffer_after_min",
                  "slot_interval_min", "min_notice_min", "max_horizon_days", "price_display", "is_active"]


@router.get("/services")
async def list_services(auth: Auth = Depends(current_auth)) -> list[dict]:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        rows = await fetch_all(
            conn,
            "SELECT s.*, coalesce(array_agg(sr.resource_id) FILTER (WHERE sr.resource_id IS NOT NULL), '{}') AS resource_ids"
            " FROM service s LEFT JOIN service_resource sr ON sr.service_id = s.id GROUP BY s.id ORDER BY s.created_at",
        )
    return [{**r, "id": str(r["id"]), "tenant_id": None, "resource_ids": [str(x) for x in r["resource_ids"]]} for r in rows]


@router.post("/services", status_code=201)
async def create_service(body: ServiceCreate, auth: Auth = Depends(admin)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        if await fetch_one(conn, "SELECT 1 FROM service WHERE key = :k", k=body.key):
            raise api_error(409, "key_taken", "Cet identifiant de prestation existe déjà.")
        cols = ", ".join(SERVICE_FIELDS)
        vals = ", ".join(f":{f}" for f in SERVICE_FIELDS)
        row = await fetch_one(
            conn, f"INSERT INTO service (tenant_id, key, {cols}) VALUES (:t, :key, {vals}) RETURNING id",
            t=auth.tenant_id, key=body.key, **body.model_dump(include=set(SERVICE_FIELDS)),
        )
        await _set_service_resources(conn, auth.tenant_id, row["id"], body.resource_ids)
    return {"id": str(row["id"])}


@router.put("/services/{service_id}")
async def update_service(service_id: UUID, body: ServiceIn, auth: Auth = Depends(admin)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        sets = ", ".join(f"{f} = :{f}" for f in SERVICE_FIELDS)
        row = await fetch_one(
            conn, f"UPDATE service SET {sets} WHERE id = :id RETURNING id",
            id=service_id, **body.model_dump(include=set(SERVICE_FIELDS)),
        )
        if not row:
            raise api_error(404, "not_found", "Prestation introuvable.")
        await _set_service_resources(conn, auth.tenant_id, service_id, body.resource_ids)
    return {"ok": True}


# ----------------------------------------------------------------------------- collaborateurs et horaires

class RuleIn(BaseModel):
    weekday: int = Field(ge=1, le=7)
    start_time: time
    end_time: time

    @model_validator(mode="after")
    def _order(self) -> "RuleIn":
        if self.end_time <= self.start_time:
            raise ValueError("l'heure de fin doit suivre l'heure de début")
        return self


class AvailabilityIn(BaseModel):
    rules: list[RuleIn] = Field(max_length=50)

    @model_validator(mode="after")
    def _no_overlap(self) -> "AvailabilityIn":
        for d in range(1, 8):
            day = sorted((r.start_time, r.end_time) for r in self.rules if r.weekday == d)
            for (_, e1), (s2, _) in zip(day, day[1:]):
                if s2 < e1:
                    raise ValueError("plages horaires qui se chevauchent")
        return self


class ResourceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    is_active: bool = True


@router.get("/resources")
async def list_resources(auth: Auth = Depends(current_auth)) -> list[dict]:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        resources = await fetch_all(conn, "SELECT id, name, is_active, user_id FROM resource ORDER BY created_at")
        rules = await fetch_all(
            conn, "SELECT resource_id, weekday, start_time, end_time FROM availability_rule ORDER BY weekday, start_time"
        )
    out = []
    for r in resources:
        out.append({"id": str(r["id"]), "name": r["name"], "is_active": r["is_active"],
                    "user_id": str(r["user_id"]) if r["user_id"] else None,
                    "rules": [{"weekday": x["weekday"], "start_time": x["start_time"].strftime("%H:%M"),
                               "end_time": x["end_time"].strftime("%H:%M")} for x in rules if x["resource_id"] == r["id"]]})
    return out


@router.post("/resources", status_code=201)
async def create_resource(body: ResourceIn, auth: Auth = Depends(admin)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        row = await fetch_one(
            conn, "INSERT INTO resource (tenant_id, name, is_active) VALUES (:t, :n, :a) RETURNING id",
            t=auth.tenant_id, n=body.name, a=body.is_active,
        )
    return {"id": str(row["id"])}


@router.put("/resources/{resource_id}")
async def update_resource(resource_id: UUID, body: ResourceIn, auth: Auth = Depends(admin)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        row = await fetch_one(conn, "UPDATE resource SET name = :n, is_active = :a WHERE id = :r RETURNING id",
                              n=body.name, a=body.is_active, r=resource_id)
    if not row:
        raise api_error(404, "not_found", "Collaborateur introuvable.")
    return {"ok": True}


@router.put("/resources/{resource_id}/availability")
async def put_availability(resource_id: UUID, body: AvailabilityIn, auth: Auth = Depends(admin)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        if not await fetch_one(conn, "SELECT 1 FROM resource WHERE id = :r", r=resource_id):
            raise api_error(404, "not_found", "Collaborateur introuvable.")
        await execute(conn, "DELETE FROM availability_rule WHERE resource_id = :r", r=resource_id)
        for rule in body.rules:
            await execute(
                conn, "INSERT INTO availability_rule (tenant_id, resource_id, weekday, start_time, end_time)"
                " VALUES (:t, :r, :w, :s, :e)", t=auth.tenant_id, r=resource_id, w=rule.weekday,
                s=rule.start_time, e=rule.end_time,
            )
    return {"ok": True}


# ----------------------------------------------------------------------------- absences et blocages

class TimeOffIn(BaseModel):
    resource_id: UUID | None = None  # None = toute l'entreprise
    starts_at: datetime
    ends_at: datetime
    reason: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _order(self) -> "TimeOffIn":
        if self.starts_at.tzinfo is None or self.ends_at.tzinfo is None:
            raise ValueError("dates avec fuseau horaire attendues")
        if self.ends_at <= self.starts_at:
            raise ValueError("la fin doit suivre le début")
        return self


@router.get("/time-off")
async def list_time_off(auth: Auth = Depends(current_auth)) -> list[dict]:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        rows = await fetch_all(
            conn, "SELECT id, resource_id, lower(time_range) AS starts_at, upper(time_range) AS ends_at, reason"
            " FROM time_off WHERE upper(time_range) > now() ORDER BY lower(time_range)",
        )
    return _sid(rows)


@router.post("/time-off", status_code=201)
async def create_time_off(body: TimeOffIn, auth: Auth = Depends(current_auth)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        if body.resource_id and not await fetch_one(conn, "SELECT 1 FROM resource WHERE id = :r", r=body.resource_id):
            raise api_error(404, "not_found", "Collaborateur introuvable.")
        row = await fetch_one(
            conn, "INSERT INTO time_off (tenant_id, resource_id, time_range, reason) VALUES (:t, :r, tstzrange(:a, :b), :x)"
            " RETURNING id", t=auth.tenant_id, r=body.resource_id, a=body.starts_at, b=body.ends_at, x=body.reason,
        )
    return {"id": str(row["id"])}


@router.delete("/time-off/{time_off_id}", status_code=204, response_class=Response, response_model=None)
async def delete_time_off(time_off_id: UUID, auth: Auth = Depends(current_auth)) -> None:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        await execute(conn, "DELETE FROM time_off WHERE id = :i", i=time_off_id)


# ----------------------------------------------------------------------------- parcours

async def _default_flow(conn) -> dict[str, Any]:
    flow = await fetch_one(conn, "SELECT id, name, published_version_id FROM flow WHERE is_default")
    if not flow:
        raise api_error(404, "not_found", "Aucun parcours.")
    return flow


@router.get("/flow")
async def get_flow(auth: Auth = Depends(current_auth)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        flow = await _default_flow(conn)
        versions = await fetch_all(
            conn, "SELECT id, version, definition, published_at, created_at FROM flow_version WHERE flow_id = :f"
            " ORDER BY version DESC LIMIT 10", f=flow["id"],
        )
    published = next((v for v in versions if v["id"] == flow["published_version_id"]), None)
    draft = versions[0] if versions and versions[0]["published_at"] is None else None
    return {"name": flow["name"],
            "published": _sid([published])[0] if published else None,
            "draft": _sid([draft])[0] if draft else None,
            "history": [{"version": v["version"], "published_at": v["published_at"]} for v in versions]}


class DraftIn(BaseModel):
    definition: dict[str, Any]


async def _validate_definition(conn, raw: dict[str, Any]) -> FlowDefinition:
    try:
        defn = FlowDefinition.model_validate(raw)
    except ValidationError as exc:
        errors = [{"loc": ".".join(str(x) for x in e["loc"]), "message": e["msg"]} for e in exc.errors()]
        raise api_error(422, "invalid_flow", "Le parcours contient des erreurs.", errors=errors) from None
    keys = {r["key"] for r in await fetch_all(conn, "SELECT key FROM service WHERE is_active")}
    missing = defn.service_keys() - keys
    if missing:
        raise api_error(422, "invalid_flow", f"Prestation inconnue ou désactivée : {', '.join(sorted(missing))}.")
    return defn


@router.put("/flow/draft")
async def save_draft(body: DraftIn, auth: Auth = Depends(admin)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        flow = await _default_flow(conn)
        defn = await _validate_definition(conn, body.definition)
        payload = defn.model_dump_json(by_alias=True, exclude_none=True)
        draft = await fetch_one(
            conn, "SELECT id FROM flow_version WHERE flow_id = :f AND published_at IS NULL ORDER BY version DESC LIMIT 1",
            f=flow["id"],
        )
        if draft:
            await execute(conn, "UPDATE flow_version SET definition = CAST(:d AS jsonb) WHERE id = :i", d=payload, i=draft["id"])
            version_id = draft["id"]
        else:
            row = await fetch_one(
                conn, "INSERT INTO flow_version (tenant_id, flow_id, version, definition, created_by)"
                " VALUES (:t, :f, (SELECT coalesce(max(version), 0) + 1 FROM flow_version WHERE flow_id = :f),"
                " CAST(:d AS jsonb), :u) RETURNING id", t=auth.tenant_id, f=flow["id"], d=payload, u=auth.user_id,
            )
            version_id = row["id"]
    return {"draft_id": str(version_id)}


@router.post("/flow/publish")
async def publish(auth: Auth = Depends(admin)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        flow = await _default_flow(conn)
        draft = await fetch_one(
            conn, "SELECT id, version, definition FROM flow_version WHERE flow_id = :f AND published_at IS NULL"
            " ORDER BY version DESC LIMIT 1 FOR UPDATE", f=flow["id"],
        )
        if not draft:
            raise api_error(409, "no_draft", "Aucun brouillon à publier.")
        await _validate_definition(conn, draft["definition"])  # les prestations ont pu changer depuis
        await execute(conn, "UPDATE flow_version SET published_at = now() WHERE id = :i", i=draft["id"])
        await execute(conn, "UPDATE flow SET published_version_id = :v WHERE id = :f", v=draft["id"], f=flow["id"])
        await execute(
            conn, "INSERT INTO audit_log (tenant_id, actor_user_id, actor_kind, action, target) VALUES (:t, :u, 'user', 'flow.publish', :v)",
            t=auth.tenant_id, u=auth.user_id, v=str(draft["version"]),
        )
    return {"published_version": draft["version"]}
