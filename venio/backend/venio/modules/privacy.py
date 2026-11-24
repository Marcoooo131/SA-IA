"""Données personnelles : suppression d'un prospect, export des données de l'entreprise, journal d'activité,
et application quotidienne des durées de conservation (fonction SQL purge_retention, migration 0009)."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from .. import storage
from ..db import execute, fetch_all, fetch_one, tx
from ..deps import Auth, require_role
from ..errors import api_error
from ..telephony.phone import normalize

router = APIRouter(prefix="/api", tags=["données personnelles"])
admin = require_role("admin")
owner = require_role("owner")
log = logging.getLogger("venio.privacy")

ACTION_LABELS = {
    "case_file.view": "Consultation d'un dossier",
    "file.download": "Ouverture d'un fichier",
    "contact.delete": "Suppression d'un client et de ses données",
    "data.export": "Export des données de l'entreprise",
    "flow.publish": "Publication du parcours",
    "case_file.status": "Changement de statut d'un dossier",
}


async def audit(conn, auth: Auth, action: str, target: str | None = None, data: dict | None = None) -> None:
    await execute(
        conn,
        "INSERT INTO audit_log (tenant_id, actor_user_id, actor_kind, action, target, data)"
        " VALUES (:t, :u, 'user', :a, :c, CAST(:d AS jsonb))",
        t=auth.tenant_id, u=auth.user_id, a=action, c=target, d=json.dumps(data or {}),
    )


def _delete_files(keys: list[str]) -> None:
    for key in keys:
        try:
            storage.delete(key)
        except Exception:
            log.exception("Fichier non supprimé du stockage : %s", key)


@router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: UUID, auth: Auth = Depends(admin)) -> dict:
    """Droit à l'effacement : le client, ses demandes, réponses, photos, rendez-vous, messages et appels."""
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        contact = await fetch_one(conn, "SELECT id, phone FROM contact WHERE id = :c", c=contact_id)
        if not contact:
            raise api_error(404, "not_found", "Client introuvable.")
        cases = "SELECT id FROM case_file WHERE contact_id = :c"
        sessions = f"SELECT id FROM intake_session WHERE case_file_id IN ({cases})"
        keys = [r["storage_key"] for r in await fetch_all(
            conn, f"SELECT storage_key FROM file_object WHERE case_file_id IN ({cases}) OR intake_session_id IN ({sessions})",
            c=contact_id)]
        await execute(conn, f"DELETE FROM file_object WHERE case_file_id IN ({cases}) OR intake_session_id IN ({sessions})", c=contact_id)
        bookings = await fetch_one(conn, f"WITH d AS (DELETE FROM booking WHERE case_file_id IN ({cases}) RETURNING 1) SELECT count(*) AS n FROM d",
                                   c=contact_id)
        await execute(conn, f"DELETE FROM intake_session WHERE id IN ({sessions})", c=contact_id)
        calls = {"n": 0}
        phone = normalize(contact["phone"]) if contact["phone"] else None
        if phone:
            calls = await fetch_one(conn, "WITH d AS (DELETE FROM call WHERE from_number = :p RETURNING 1) SELECT count(*) AS n FROM d", p=phone)
        await execute(conn, "DELETE FROM contact WHERE id = :c", c=contact_id)   # demandes, notes, consentements, messages
        await audit(conn, auth, "contact.delete", str(contact_id),
                    {"rendez_vous": bookings["n"], "fichiers": len(keys), "appels": calls["n"]})
    await asyncio.to_thread(_delete_files, keys)
    return {"deleted": True, "bookings": bookings["n"], "files": len(keys), "calls": calls["n"]}


# Tables exportées (toutes celles de l'entreprise courante, la RLS limitant la lecture à celle-ci).
EXPORT_TABLES = ["tenant", "service", "resource", "availability_rule", "time_off", "flow", "flow_version", "contact",
                 "case_file", "intake_session", "booking", "booking_event", "note", "consent", "notification", "file_object",
                 "call", "missed_call_settings", "phone_exclusion", "subscription", "sms_credit_grant", "audit_log"]
SECRET_COLUMNS = {"resume_token_hash", "token_hash", "stripe_customer_id", "stripe_subscription_id"}


def _json(v: Any) -> Any:
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, (UUID, Decimal)):
        return str(v)
    if isinstance(v, (bytes, memoryview)):
        return None
    return v


@router.get("/export")
async def export(auth: Auth = Depends(owner)) -> Response:
    """Portabilité et réversibilité : toutes les données de l'entreprise, en JSON lisible."""
    out: dict[str, Any] = {"exported_at": datetime.now().isoformat(), "format": "venio-export-1"}
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        for table in EXPORT_TABLES:
            where = "id = :t" if table == "tenant" else "tenant_id = :t"
            rows = await fetch_all(conn, f"SELECT * FROM {table} WHERE {where}", t=auth.tenant_id)
            out[table] = [{k: _json(v) for k, v in r.items() if k not in SECRET_COLUMNS} for r in rows]
        await audit(conn, auth, "data.export", None, {k: len(v) for k, v in out.items() if isinstance(v, list)})
    body = json.dumps(out, ensure_ascii=False, indent=1, default=str)
    stamp = datetime.now().strftime("%Y-%m-%d")
    return Response(content=body, media_type="application/json", headers={
        "Content-Disposition": f'attachment; filename="venio-export-{stamp}.json"'})


@router.get("/audit")
async def audit_log(limit: int = Query(default=200, ge=1, le=500), auth: Auth = Depends(admin)) -> list[dict]:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        rows = await fetch_all(
            conn,
            "SELECT a.created_at, a.action, a.target, a.data, u.full_name AS actor FROM audit_log a"
            " LEFT JOIN app_user u ON u.id = a.actor_user_id ORDER BY a.created_at DESC LIMIT :n", n=limit)
    return [{"created_at": r["created_at"].isoformat(), "action": r["action"],
             "label": ACTION_LABELS.get(r["action"].split(":")[0], r["action"]), "target": r["target"],
             "data": r["data"], "actor": r["actor"] or "Système"} for r in rows]


async def purge(conn) -> int:
    """Durées de conservation : appelé chaque jour par le worker."""
    keys = [r["purge_retention"] for r in await fetch_all(conn, "SELECT purge_retention()")]
    if keys:
        await asyncio.to_thread(_delete_files, keys)
    return len(keys)
