"""Création d'un espace entreprise complet à partir d'un modèle métier."""
import re
import unicodedata
from datetime import time
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from ..config import get_settings
from ..db import execute, fetch_one, is_sqlstate, j, set_tenant
from ..flows.templates import DEFAULT_HOURS, get_template, template_flow


def slugify(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    slug = slug[:50].strip("-")
    return slug if len(slug) >= 3 else f"{slug or 'entreprise'}-rdv"


async def _insert_tenant(conn: AsyncConnection, tid: UUID, name: str, vertical: str, email: str) -> str:
    base = slugify(name)
    for attempt in range(20):
        slug = base if attempt == 0 else f"{base}-{attempt + 1}"
        try:
            async with conn.begin_nested():
                await execute(
                    conn,
                    "INSERT INTO tenant (id, slug, name, vertical, notification_email, public_profile)"
                    " VALUES (:id, :slug, :name, :vertical, :email, CAST(:profile AS jsonb))",
                    id=tid, slug=slug, name=name, vertical=vertical, email=email,
                    profile=j({"tagline": "", "description": "", "phone": "", "email": "",
                               "address": "", "service_area": "", "reassurance": []}),
                )
            return slug
        except IntegrityError as exc:
            if not is_sqlstate(exc, "23505"):
                raise
    raise RuntimeError("impossible de générer un identifiant d'URL unique")


async def create_tenant(
    conn: AsyncConnection, *, name: str, vertical: str, owner_id: UUID, owner_name: str, owner_email: str
) -> tuple[UUID, str]:
    template = get_template(vertical)
    vertical = template["code"]
    tid = uuid4()
    await set_tenant(conn, tid)
    slug = await _insert_tenant(conn, tid, name, vertical, owner_email)
    await execute(conn, "INSERT INTO membership (tenant_id, user_id, role) VALUES (:t, :u, 'owner')", t=tid, u=owner_id)

    plan = await fetch_one(conn, "SELECT id FROM plan WHERE code = 'pro'")
    await execute(
        conn,
        "INSERT INTO subscription (tenant_id, plan_id, status, trial_ends_at)"
        " VALUES (:t, :p, 'trialing', now() + make_interval(days => :d))",
        t=tid, p=plan["id"], d=get_settings().trial_days,
    )

    res = await fetch_one(
        conn, "INSERT INTO resource (tenant_id, user_id, name) VALUES (:t, :u, :n) RETURNING id",
        t=tid, u=owner_id, n=owner_name,
    )
    for weekday, start, end in DEFAULT_HOURS:
        await execute(
            conn,
            "INSERT INTO availability_rule (tenant_id, resource_id, weekday, start_time, end_time)"
            " VALUES (:t, :r, :w, :s, :e)",
            t=tid, r=res["id"], w=weekday, s=time.fromisoformat(start), e=time.fromisoformat(end),
        )

    for svc in template["services"]:
        row = await fetch_one(
            conn,
            "INSERT INTO service (tenant_id, key, name, description, meeting_type, duration_min,"
            " buffer_before_min, buffer_after_min, min_notice_min, max_horizon_days)"
            " VALUES (:t, :key, :name, :description, :meeting_type, :duration_min, :bb, :ba, :mn, :mh) RETURNING id",
            t=tid, key=svc["key"], name=svc["name"], description=svc.get("description"),
            meeting_type=svc["meeting_type"], duration_min=svc["duration_min"],
            bb=svc.get("buffer_before_min", 0), ba=svc.get("buffer_after_min", 0),
            mn=svc.get("min_notice_min", 120), mh=svc.get("max_horizon_days", 60),
        )
        await execute(
            conn, "INSERT INTO service_resource (tenant_id, service_id, resource_id) VALUES (:t, :s, :r)",
            t=tid, s=row["id"], r=res["id"],
        )

    definition = template_flow(vertical)
    flow = await fetch_one(
        conn,
        "INSERT INTO flow (tenant_id, name, template_code, is_default) VALUES (:t, :n, :c, true) RETURNING id",
        t=tid, n=f"Parcours {template['label'].lower()}", c=vertical,
    )
    version = await fetch_one(
        conn,
        "INSERT INTO flow_version (tenant_id, flow_id, version, definition, published_at, created_by)"
        " VALUES (:t, :f, 1, CAST(:d AS jsonb), now(), :u) RETURNING id",
        t=tid, f=flow["id"], d=definition.model_dump_json(by_alias=True, exclude_none=True), u=owner_id,
    )
    await execute(conn, "UPDATE flow SET published_version_id = :v WHERE id = :f", v=version["id"], f=flow["id"])
    return tid, slug
