"""API de la récupération des appels manqués : réglages, lignes, exclusions, historique, statistiques, essai.

Plus deux points d'entrée sans session : le lien court du SMS (/api/public/links/{code}) et le webhook
des fournisseurs de téléphonie (/api/telephony/{provider}/{token}).
"""
from __future__ import annotations

import json
import uuid
from datetime import timedelta
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from pydantic import BaseModel, Field, ValidationError

from ..config import get_settings
from ..db import execute, fetch_all, fetch_one, j, tx
from ..deps import Auth, current_auth, require_role
from ..errors import api_error
from ..ratelimit import limit
from ..security import new_token, token_hash
from ..telephony import phone, sms
from ..telephony.adapters import CallEventType, SimulatorAdapter, WebhookRejected, get_adapter
from ..telephony.rules import REASONS, MissedCallConfig
from ..telephony.service import ingest, link_url, load_settings, utcnow, webhook_secret

router = APIRouter(prefix="/api/missed-calls", tags=["appels manqués"])
public_router = APIRouter(tags=["appels manqués — public"])
admin = require_role("admin")


async def _entitlement(conn, key: str) -> Any:
    row = await fetch_one(
        conn, "SELECT pe.value FROM subscription s JOIN plan_entitlement pe ON pe.plan_id = s.plan_id AND pe.key = :k", k=key)
    return row["value"] if row else None


async def _credits(conn) -> dict[str, Any]:
    tz = (await fetch_one(conn, "SELECT timezone FROM tenant"))["timezone"]
    used = await fetch_one(
        conn, "SELECT value FROM usage_counter WHERE key = 'sms_credits'"
        " AND period = date_trunc('month', now() AT TIME ZONE :tz)::date", tz=tz)
    return {"limit": await _entitlement(conn, "limit.sms_credits_per_month"), "used": int(used["value"]) if used else 0}


def _preview(cfg: MissedCallConfig, company: str) -> dict[str, Any]:
    text = sms.render(cfg.template_text(), company, link_url("Ab3dEf9h"), cfg.stop_mention)
    return {"text": text, **sms.segments(text)}


# ----------------------------------------------------------------------------- réglages

class SettingsIn(BaseModel):
    enabled: bool
    config: dict[str, Any]


def _validate_config(raw: dict[str, Any]) -> MissedCallConfig:
    try:
        cfg = MissedCallConfig.model_validate(raw)
    except ValidationError as exc:
        first = exc.errors()[0]
        raise api_error(422, "invalid_config", str(first.get("msg", "Réglages invalides.")).replace("Value error, ", ""))
    return cfg


@router.get("/settings")
async def get_settings_(auth: Auth = Depends(current_auth)) -> dict:
    async with tx(tenant_id=auth.tenant_id) as conn:
        enabled, cfg = await load_settings(conn)
        tenant = await fetch_one(conn, "SELECT name FROM tenant")
        credits = await _credits(conn)
    return {
        "enabled": enabled, "config": cfg.model_dump(mode="json"), "preview": _preview(cfg, tenant["name"]),
        "templates": [{"tone": k, "label": v["label"], "text": v["text"]} for k, v in sms.TEMPLATES.items()],
        "credits": credits, "paid_sending_enabled": get_settings().paid_sending_enabled,
        "max_segments": sms.MAX_SEGMENTS,
    }


@router.put("/settings")
async def put_settings(body: SettingsIn, auth: Auth = Depends(admin)) -> dict:
    cfg = _validate_config(body.config)
    async with tx(tenant_id=auth.tenant_id) as conn:
        tenant = await fetch_one(conn, "SELECT name FROM tenant")
        prev = _preview(cfg, tenant["name"])
        if prev["segments"] > sms.MAX_SEGMENTS:
            raise api_error(422, "sms_too_long", f"Message trop long : {prev['segments']} SMS facturés par envoi (maximum {sms.MAX_SEGMENTS}).")
        await execute(
            conn,
            "INSERT INTO missed_call_settings (tenant_id, enabled, config) VALUES (:t, :e, CAST(:c AS jsonb))"
            " ON CONFLICT (tenant_id) DO UPDATE SET enabled = EXCLUDED.enabled, config = EXCLUDED.config, updated_at = now()",
            t=auth.tenant_id, e=body.enabled, c=j(cfg.model_dump(mode="json")))
    return await get_settings_(auth)


class PreviewIn(BaseModel):
    tone: str = "professionnel"
    custom_text: str | None = Field(default=None, max_length=480)
    stop_mention: str | None = Field(default=None, max_length=40)


@router.post("/preview")
async def preview(body: PreviewIn, auth: Auth = Depends(current_auth)) -> dict:
    cfg = _validate_config({"tone": body.tone, "custom_text": body.custom_text, "stop_mention": body.stop_mention})
    async with tx(tenant_id=auth.tenant_id) as conn:
        tenant = await fetch_one(conn, "SELECT name FROM tenant")
    return _preview(cfg, tenant["name"])


# ----------------------------------------------------------------------------- lignes

class LineIn(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    business_number: str | None = Field(default=None, max_length=30)
    mode: Literal["simulator", "forward_no_answer", "hosted", "pbx"] = "simulator"


class LinePatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=80)
    business_number: str | None = Field(default=None, max_length=30)
    status: Literal["active", "paused"] | None = None


def _line_out(r: dict[str, Any]) -> dict[str, Any]:
    return {"id": str(r["id"]), "label": r["label"], "mode": r["mode"], "provider": r["provider"], "status": r["status"],
            "business_number": phone.display(r["business_number"]) if r["business_number"] else None,
            "last_event_at": r["last_event_at"], "is_test": r["provider"] == "simulator"}


def _norm_business(raw: str | None) -> str | None:
    if not raw:
        return None
    n = phone.normalize(raw)
    if not n:
        raise api_error(422, "invalid_number", "Numéro de téléphone invalide.")
    return n


@router.get("/lines")
async def list_lines(auth: Auth = Depends(current_auth)) -> list[dict]:
    async with tx(tenant_id=auth.tenant_id) as conn:
        rows = await fetch_all(conn, "SELECT * FROM telephony_line ORDER BY created_at")
    return [_line_out(r) for r in rows]


@router.post("/lines", status_code=201)
async def create_line(body: LineIn, auth: Auth = Depends(admin)) -> dict:
    if body.mode != "simulator":
        raise api_error(422, "provider_not_available",
                        "Les lignes réelles seront disponibles une fois le fournisseur de téléphonie choisi. Utilisez une ligne de test en attendant.")
    async with tx(tenant_id=auth.tenant_id) as conn:
        max_lines = await _entitlement(conn, "limit.phone_lines")
        count = (await fetch_one(conn, "SELECT count(*) AS n FROM telephony_line"))["n"]
        if max_lines is not None and count >= int(max_lines):
            raise api_error(409, "limit_reached", f"Votre offre comprend {max_lines} ligne(s) suivie(s).")
        row = await fetch_one(
            conn,
            "INSERT INTO telephony_line (tenant_id, label, business_number, mode, provider) VALUES (:t, :l, :b, 'simulator', 'simulator')"
            " RETURNING *", t=auth.tenant_id, l=body.label.strip(), b=_norm_business(body.business_number))
        token = new_token()
        await execute(conn, "INSERT INTO telephony_endpoint (token_hash, tenant_id, line_id) VALUES (:h, :t, :l)",
                      h=token_hash(token), t=auth.tenant_id, l=row["id"])
    # L'adresse du webhook (avec son jeton secret) n'est affichée qu'une fois, à la création.
    return {**_line_out(row), "webhook_path": f"/api/telephony/{row['provider']}/{token}"}


@router.patch("/lines/{line_id}")
async def patch_line(line_id: UUID, body: LinePatch, auth: Auth = Depends(admin)) -> dict:
    upd: dict[str, Any] = {}
    if body.label is not None:
        upd["label"] = body.label.strip()
    if "business_number" in body.model_fields_set:
        upd["business_number"] = _norm_business(body.business_number)
    if body.status is not None:
        upd["status"] = body.status
    async with tx(tenant_id=auth.tenant_id) as conn:
        if upd:
            sets = ", ".join(f"{k} = :{k}" for k in upd)
            await execute(conn, f"UPDATE telephony_line SET {sets} WHERE id = :id", id=line_id, **upd)
        row = await fetch_one(conn, "SELECT * FROM telephony_line WHERE id = :id", id=line_id)
    if not row:
        raise api_error(404, "not_found", "Ligne introuvable.")
    return _line_out(row)


# ----------------------------------------------------------------------------- exclusions

class ExclusionIn(BaseModel):
    number: str = Field(max_length=30)
    label: str | None = Field(default=None, max_length=80)
    kind: Literal["excluded", "opt_out"] = "excluded"


@router.get("/exclusions")
async def list_exclusions(auth: Auth = Depends(current_auth)) -> list[dict]:
    async with tx(tenant_id=auth.tenant_id) as conn:
        rows = await fetch_all(conn, "SELECT number, kind, label, created_at FROM phone_exclusion ORDER BY created_at DESC")
    return [{**r, "display": phone.display(r["number"])} for r in rows]


@router.post("/exclusions", status_code=201)
async def add_exclusion(body: ExclusionIn, auth: Auth = Depends(current_auth)) -> dict:
    n = phone.normalize(body.number)
    if not n:
        raise api_error(422, "invalid_number", "Numéro de téléphone invalide.")
    async with tx(tenant_id=auth.tenant_id) as conn:
        await execute(
            conn,
            "INSERT INTO phone_exclusion (tenant_id, number, kind, label) VALUES (:t, :n, :k, :l)"
            " ON CONFLICT (tenant_id, number) DO UPDATE SET kind = EXCLUDED.kind, label = COALESCE(EXCLUDED.label, phone_exclusion.label)",
            t=auth.tenant_id, n=n, k=body.kind, l=body.label)
    return {"number": n, "display": phone.display(n), "kind": body.kind, "label": body.label}


@router.delete("/exclusions/{number}", status_code=204, response_class=Response, response_model=None)
async def delete_exclusion(number: str, auth: Auth = Depends(current_auth)) -> None:
    n = phone.normalize(number)
    async with tx(tenant_id=auth.tenant_id) as conn:
        await execute(conn, "DELETE FROM phone_exclusion WHERE number = :n", n=n)


# ----------------------------------------------------------------------------- historique et statistiques

DELIVERY = {"sent": "sent", "logged": "not_delivered", "failed": "failed", "scheduled": "pending", "sending": "pending"}


@router.get("/calls")
async def list_calls(auth: Auth = Depends(current_auth), limit_: int = 100) -> list[dict]:
    async with tx(tenant_id=auth.tenant_id) as conn:
        rows = await fetch_all(
            conn,
            "SELECT c.id AS call_id, c.from_number, c.outcome, c.started_at, c.ended_at, l.label AS line_label,"
            " l.provider AS line_provider, r.id AS recovery_id, r.decision, r.reason, r.decided_at, r.clicked_at,"
            " r.click_count, r.form_started_at, r.booked_at, r.booking_id, r.handled_at, r.credits,"
            " r.callback_requested_at, r.callback_name, r.callback_note, r.visitor_intent,"
            " n.status AS sms_status, n.provider AS sms_provider, n.body AS sms_body, n.last_error AS sms_error,"
            " b.case_file_id"
            " FROM call c JOIN telephony_line l ON l.id = c.line_id"
            " LEFT JOIN missed_call_recovery r ON r.call_id = c.id"
            " LEFT JOIN notification n ON n.id = r.notification_id"
            " LEFT JOIN booking b ON b.id = r.booking_id"
            " ORDER BY c.started_at DESC LIMIT :n", n=max(1, min(limit_, 500)))
    out = []
    for r in rows:
        out.append({
            **{k: r[k] for k in ("outcome", "started_at", "ended_at", "line_label", "decision", "decided_at",
                                 "clicked_at", "click_count", "form_started_at", "booked_at", "handled_at", "credits",
                                 "sms_status", "sms_provider", "sms_body", "sms_error",
                                 "callback_requested_at", "callback_name", "callback_note", "visitor_intent")},
            "call_id": str(r["call_id"]), "recovery_id": str(r["recovery_id"]) if r["recovery_id"] else None,
            "case_file_id": str(r["case_file_id"]) if r["case_file_id"] else None,
            "is_test": r["line_provider"] == "simulator",
            "number_masked": phone.mask(r["from_number"]), "number_display": phone.display(r["from_number"]),
            "number_tel": r["from_number"], "reason": r["reason"], "reason_label": REASONS.get(r["reason"] or "", None),
        })
    return out


@router.post("/recoveries/{recovery_id}/handled")
async def mark_handled(recovery_id: UUID, auth: Auth = Depends(current_auth)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        row = await fetch_one(
            conn, "UPDATE missed_call_recovery SET handled_at = COALESCE(handled_at, now()), handled_by = :u"
            " WHERE id = :r RETURNING handled_at", u=auth.user_id, r=recovery_id)
    if not row:
        raise api_error(404, "not_found", "Appel introuvable.")
    return {"handled_at": row["handled_at"]}


@router.get("/stats")
async def stats(auth: Auth = Depends(current_auth), days: int = 30) -> dict:
    days = max(1, min(days, 365))
    since = utcnow() - timedelta(days=days)
    async with tx(tenant_id=auth.tenant_id) as conn:
        c = await fetch_one(
            conn,
            "SELECT count(*) FILTER (WHERE outcome IN ('missed','abandoned')) AS missed,"
            " count(*) FILTER (WHERE outcome IN ('answered','transferred')) AS answered, count(*) AS total"
            " FROM call WHERE started_at > :s", s=since)
        r = await fetch_one(
            conn,
            "SELECT count(*) FILTER (WHERE r.decision = 'sent') AS triggered,"
            " count(*) FILTER (WHERE n.status = 'sent') AS sent,"
            " count(*) FILTER (WHERE n.status = 'logged') AS not_delivered,"
            " count(*) FILTER (WHERE n.status = 'failed') AS failed,"
            " count(*) FILTER (WHERE r.clicked_at IS NOT NULL) AS clicked,"
            " count(*) FILTER (WHERE r.form_started_at IS NOT NULL) AS started,"
            " count(*) FILTER (WHERE r.booked_at IS NOT NULL) AS booked,"
            " count(*) FILTER (WHERE r.decision = 'pending') AS pending"
            " FROM missed_call_recovery r JOIN call cl ON cl.id = r.call_id"
            " LEFT JOIN notification n ON n.id = r.notification_id WHERE cl.started_at > :s", s=since)
        reasons = await fetch_all(
            conn,
            "SELECT r.reason, count(*) AS n FROM missed_call_recovery r JOIN call cl ON cl.id = r.call_id"
            " WHERE r.decision = 'not_sent' AND cl.started_at > :s GROUP BY r.reason ORDER BY n DESC", s=since)
        credits = await _credits(conn)
    missed = c["missed"]
    return {
        "days": days, "calls": c["total"], "answered": c["answered"], "missed": missed, **r,
        # Pas de taux de livraison inventé : seuls les SMS réellement envoyés et confirmés comptent.
        "recovery_rate": (r["booked"] / missed) if missed else None,
        "reliable": missed >= 20,
        "not_sent_reasons": [{"reason": x["reason"], "label": REASONS.get(x["reason"], x["reason"]), "count": x["n"]} for x in reasons],
        "credits": credits,
    }


# ----------------------------------------------------------------------------- essai par simulation

class SimulateIn(BaseModel):
    from_number: str | None = Field(default="06 12 34 56 78", max_length=30)
    scenario: Literal["missed", "answered", "abandoned", "masked"] = "missed"
    line_id: UUID | None = None


@router.post("/simulate", status_code=201, dependencies=[Depends(limit("mc_simulate", 20, 600))])
async def simulate(body: SimulateIn, auth: Auth = Depends(current_auth)) -> dict:
    """Rejoue un appel par la vraie chaîne de traitement, sur une ligne de test : aucun SMS réel possible."""
    async with tx(tenant_id=auth.tenant_id) as conn:
        q = "SELECT * FROM telephony_line WHERE provider = 'simulator'" + (" AND id = :id" if body.line_id else "") + " ORDER BY created_at LIMIT 1"
        line = await fetch_one(conn, q, **({"id": body.line_id} if body.line_id else {}))
        if not line:
            raise api_error(409, "no_test_line", "Ajoutez d'abord une ligne de test.")
        call_id = f"sim-{uuid.uuid4()}"
        now = utcnow()
        frm = None if body.scenario == "masked" else body.from_number
        kind = {"missed": CallEventType.MISSED, "masked": CallEventType.MISSED,
                "answered": CallEventType.ANSWERED, "abandoned": CallEventType.ABANDONED}[body.scenario]
        events = [
            {"id": f"{call_id}-1", "call_id": call_id, "type": CallEventType.INBOUND.value, "from": frm, "to": line["business_number"], "at": (now - timedelta(seconds=25)).isoformat()},
            {"id": f"{call_id}-2", "call_id": call_id, "type": kind.value, "from": frm, "to": line["business_number"], "at": (now - timedelta(seconds=5)).isoformat()},
            {"id": f"{call_id}-3", "call_id": call_id, "type": CallEventType.COMPLETED.value, "from": frm, "to": line["business_number"], "at": now.isoformat()},
        ]
        raw = json.dumps({"events": events}).encode()
        parsed = SimulatorAdapter().parse(raw, {})
        await ingest(conn, auth.tenant_id, line, parsed)
        demo = await fetch_one(conn, "SELECT is_demo FROM tenant")
        if demo["is_demo"]:
            # Démonstration : la décision et l'envoi (simulé) sont traités tout de suite, sans attendre le worker.
            from ..telephony.service import evaluate
            from .notifications import deliver
            rec = await fetch_one(conn, "SELECT r.id FROM missed_call_recovery r JOIN call c ON c.id = r.call_id"
                                        " WHERE c.provider_call_id = :c", c=call_id)
            if rec:
                await evaluate(conn, rec["id"])
                n = await fetch_one(conn, "SELECT notification_id FROM missed_call_recovery WHERE id = :r", r=rec["id"])
                if n and n["notification_id"]:
                    await deliver(conn, n["notification_id"])
    return {"call_id": call_id, "scenario": body.scenario}


# ----------------------------------------------------------------------------- points d'entrée publics

@public_router.get("/api/public/links/{code}", dependencies=[Depends(limit("mc_link", 60, 600))])
async def open_link(code: str) -> dict:
    """Lien court du SMS : compte l'ouverture et renvoie la page de réservation à ouvrir."""
    if not code.isalnum() or len(code) > 16:
        raise api_error(404, "not_found", "Lien introuvable.")
    async with tx() as conn:
        link = await fetch_one(conn, "SELECT tenant_id, recovery_id FROM recovery_link WHERE code = :c", c=code)
    if not link:
        raise api_error(404, "not_found", "Lien introuvable ou expiré.")
    async with tx(tenant_id=link["tenant_id"]) as conn:
        await execute(
            conn, "UPDATE missed_call_recovery SET clicked_at = COALESCE(clicked_at, now()), click_count = click_count + 1"
            " WHERE id = :r", r=link["recovery_id"])
        tenant = await fetch_one(conn, "SELECT slug, name FROM tenant")
    return {"slug": tenant["slug"], "ref": code, "name": tenant["name"]}


class IntentIn(BaseModel):
    intent: Literal["new", "existing", "callback"]


class CallbackIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    note: str | None = Field(default=None, max_length=300)


async def _recovery_for(conn, code: str) -> dict:
    if not code.isalnum() or len(code) > 16:
        raise api_error(404, "not_found", "Lien introuvable.")
    link = await fetch_one(conn, "SELECT tenant_id, recovery_id FROM recovery_link WHERE code = :c", c=code)
    if not link:
        raise api_error(404, "not_found", "Lien introuvable ou expiré.")
    return link


@public_router.post("/api/public/links/{code}/intent", dependencies=[Depends(limit("mc_intent", 30, 600))])
async def link_intent(code: str, body: IntentIn) -> dict:
    """Ce que l'appelant voulait (nouveau besoin, rendez-vous existant, autre) : mesure du filtrage, sans donnée personnelle."""
    async with tx() as conn:
        link = await _recovery_for(conn, code)
    async with tx(tenant_id=link["tenant_id"]) as conn:
        await execute(conn, "UPDATE missed_call_recovery SET visitor_intent = :i WHERE id = :r", i=body.intent, r=link["recovery_id"])
    return {"ok": True}


@public_router.post("/api/public/links/{code}/callback", status_code=201, dependencies=[Depends(limit("mc_callback", 5, 3600))])
async def link_callback(code: str, body: CallbackIn, background: BackgroundTasks) -> dict:
    """Demande de rappel : l'entreprise la voit dans l'historique des appels et reçoit une alerte par email."""
    async with tx() as conn:
        link = await _recovery_for(conn, code)
    async with tx(tenant_id=link["tenant_id"]) as conn:
        row = await fetch_one(
            conn, "UPDATE missed_call_recovery SET callback_requested_at = now(), callback_name = :n, callback_note = :o,"
            " visitor_intent = 'callback' WHERE id = :r AND callback_requested_at IS NULL RETURNING from_number",
            n=body.name.strip(), o=(body.note or "").strip() or None, r=link["recovery_id"])
        tenant = await fetch_one(conn, "SELECT name, notification_email, is_demo FROM tenant")
    if row and tenant["notification_email"] and not tenant["is_demo"]:
        from . import account_mail
        note = f"\nMotif : {body.note.strip()}" if body.note and body.note.strip() else ""
        background.add_task(
            account_mail.send, tenant["notification_email"], f"Demande de rappel : {body.name.strip()}",
            f"{body.name.strip()} ({phone.display(row['from_number'])}) vous a appelé sans réussir à vous joindre et demande à "
            f"être rappelé.{note}\n\nHistorique des appels : {get_settings().public_base_url}/app/appels\n\n— Venio")
    return {"ok": True, "company": tenant["name"]}


@public_router.post("/api/telephony/{provider}/{token}", dependencies=[Depends(limit("telephony_webhook", 600, 60))])
async def telephony_webhook(provider: str, token: str, request: Request) -> dict:
    adapter = get_adapter(provider)
    if not adapter:
        raise api_error(404, "not_found", "Fournisseur inconnu.")
    async with tx() as conn:
        ep = await fetch_one(conn, "SELECT tenant_id, line_id FROM telephony_endpoint WHERE token_hash = :h", h=token_hash(token))
    if not ep:
        raise api_error(404, "not_found", "Ligne inconnue.")
    body = await request.body()
    headers = {k.lower(): v for k, v in request.headers.items()}
    try:
        adapter.verify(body, headers, webhook_secret(ep["line_id"]))
        events = adapter.parse(body, headers)
    except WebhookRejected as exc:
        raise api_error(401, "rejected", str(exc))
    async with tx(tenant_id=ep["tenant_id"]) as conn:
        line = await fetch_one(conn, "SELECT * FROM telephony_line WHERE id = :l", l=ep["line_id"])
        if not line or line["provider"] != provider:
            raise api_error(404, "not_found", "Ligne inconnue.")
        touched = await ingest(conn, ep["tenant_id"], line, events)
    return {"accepted": len(events), "calls": len(set(touched))}
