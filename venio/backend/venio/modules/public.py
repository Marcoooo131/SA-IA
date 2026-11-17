"""API publique : page de l'entreprise, parcours, créneaux, réservation, lien de gestion.

Aucun compte n'est demandé au client final. Un parcours est protégé par un jeton de reprise
(conservé par le navigateur) ; un rendez-vous par un lien de gestion signé.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Header, Query, Response, UploadFile
from pydantic import BaseModel, EmailStr, Field

from .. import storage
from ..config import get_settings
from ..db import execute, fetch_all, fetch_one, j, tx
from ..errors import api_error
from ..flows.engine import (
    AnswerError, is_answered, resolve_service_key, summarize, summary_text, validate_answer, walk,
)
from ..flows.schema import FlowDefinition
from ..ratelimit import limit
from ..security import new_token, token_hash, unsign_token
from . import notifications
from .booking_core import (
    MAX_DAYS_PER_QUERY, SlotUnavailable, create_hold, group_slots_by_day, load_default_flow,
    load_flow_version, load_public_tenant, log_booking_event, reschedule, service_by_id, service_by_key,
    service_slots, utcnow,
)

router = APIRouter(prefix="/api/public", tags=["public"])
PHONE_RE = re.compile(r"^\+?[0-9 .()-]{6,20}$")
POSTAL_RE = re.compile(r"^[0-9A-Za-z -]{3,10}$")


# ----------------------------------------------------------------------------- utilitaires

async def _tenant_or_404(conn, slug: str) -> dict[str, Any]:
    tenant = await load_public_tenant(conn, slug)
    if not tenant or tenant["status"] in ("suspended", "pending_deletion"):
        raise api_error(404, "not_found", "Cette page n'existe pas.")
    return tenant


def _ensure_accepting(tenant: dict[str, Any]) -> None:
    if tenant["status"] != "active":
        raise api_error(423, "not_accepting", "Les réservations en ligne sont momentanément indisponibles. Contactez directement l'entreprise.")


async def _session(conn, session_id: UUID, token: str | None) -> dict[str, Any]:
    if not token:
        raise api_error(401, "missing_token", "Lien de reprise manquant.")
    row = await fetch_one(
        conn,
        "SELECT id, flow_version_id, answers, status, case_file_id, expires_at FROM intake_session"
        " WHERE id = :i AND resume_token_hash = :h",
        i=session_id, h=token_hash(token),
    )
    if not row:
        raise api_error(404, "not_found", "Demande introuvable.")
    if row["status"] == "in_progress" and row["expires_at"] < utcnow():
        raise api_error(410, "expired", "Cette demande a expiré, merci de recommencer.")
    return row


def _state(defn: FlowDefinition, answers: dict[str, Any]) -> dict[str, Any]:
    st = walk(defn, answers)
    done = st.current is None
    return {
        "current_step": st.current,
        "visited": st.visited,
        "answered": len(st.visited),
        "estimated_total": st.estimated_total,
        "progress": round(100 * len(st.visited) / max(st.estimated_total, 1)),
        "qualification_done": done,
        "service_key": resolve_service_key(defn, answers) if done else None,
    }


async def _active_hold(conn, session_id: UUID) -> dict[str, Any] | None:
    return await fetch_one(
        conn,
        "SELECT id, starts_at, ends_at, hold_expires_at, service_id FROM booking"
        " WHERE intake_session_id = :s AND status = 'held' AND hold_expires_at > now()",
        s=session_id,
    )


async def _track(conn, tenant_id, session_id, flow_version_id, type_: str, step: str | None = None, props=None):
    await execute(
        conn,
        "INSERT INTO analytics_event (tenant_id, session_id, flow_version_id, type, step_key, props)"
        " VALUES (:t, :s, :f, :ty, :st, CAST(:p AS jsonb))",
        t=tenant_id, s=session_id, f=flow_version_id, ty=type_, st=step, p=j(props or {}),
    )


def _public_service(s: dict[str, Any]) -> dict[str, Any]:
    return {k: s[k] for k in ("key", "name", "description", "meeting_type", "duration_min", "price_display")}


# ----------------------------------------------------------------------------- page publique

@router.get("/{slug}", dependencies=[Depends(limit("public_page", 120, 60))])
async def public_page(slug: str) -> dict:
    async with tx(public_slug=slug) as conn:
        tenant = await _tenant_or_404(conn, slug)
    async with tx(tenant_id=tenant["id"]) as conn:
        flow = await load_default_flow(conn)
        services = await fetch_all(
            conn,
            "SELECT key, name, description, meeting_type, duration_min, price_display FROM service"
            " WHERE is_active ORDER BY created_at",
        )
        await _track(conn, tenant["id"], None, flow[0] if flow else None, "page_view")
    return {
        "slug": tenant["slug"], "name": tenant["name"], "vertical": tenant["vertical"],
        "timezone": tenant["timezone"], "branding": tenant["branding"], "profile": tenant["public_profile"],
        "accepting_bookings": tenant["status"] == "active" and flow is not None,
        "services": services,
        "flow": {"version_id": str(flow[0]), "intro": flow[1].intro} if flow else None,
    }


# ----------------------------------------------------------------------------- parcours

class StartIn(BaseModel):
    source: dict[str, str] = Field(default_factory=dict)


@router.post("/{slug}/sessions", status_code=201, dependencies=[Depends(limit("session_start", 30, 600))])
async def start_session(slug: str, body: StartIn) -> dict:
    async with tx(public_slug=slug) as conn:
        tenant = await _tenant_or_404(conn, slug)
    _ensure_accepting(tenant)
    source = {k[:40]: str(v)[:200] for k, v in list(body.source.items())[:10]}
    token = new_token()
    async with tx(tenant_id=tenant["id"]) as conn:
        flow = await load_default_flow(conn)
        if not flow:
            raise api_error(423, "not_accepting", "Aucun parcours n'est publié.")
        version_id, defn = flow
        row = await fetch_one(
            conn,
            "INSERT INTO intake_session (tenant_id, flow_version_id, resume_token_hash, source)"
            " VALUES (:t, :v, :h, CAST(:s AS jsonb)) RETURNING id",
            t=tenant["id"], v=version_id, h=token_hash(token), s=j(source),
        )
        await _track(conn, tenant["id"], row["id"], version_id, "flow_start", props={"device": source.get("device")})
    return {"session_id": str(row["id"]), "resume_token": token,
            "definition": defn.model_dump(by_alias=True, exclude_none=True), "state": _state(defn, {}), "answers": {}}


@router.get("/{slug}/sessions/{session_id}")
async def get_session(slug: str, session_id: UUID, x_resume_token: str | None = Header(default=None)) -> dict:
    async with tx(public_slug=slug) as conn:
        tenant = await _tenant_or_404(conn, slug)
    async with tx(tenant_id=tenant["id"]) as conn:
        sess = await _session(conn, session_id, x_resume_token)
        defn = await load_flow_version(conn, sess["flow_version_id"])
        hold = await _active_hold(conn, session_id)
        files = await fetch_all(
            conn, "SELECT id, original_name, mime_type FROM file_object WHERE intake_session_id = :s", s=session_id
        )
    return {"session_id": str(session_id), "status": sess["status"],
            "definition": defn.model_dump(by_alias=True, exclude_none=True),
            "answers": sess["answers"], "state": _state(defn, sess["answers"]),
            "hold": hold, "files": [{**f, "id": str(f["id"])} for f in files]}


class AnswerIn(BaseModel):
    step: str = Field(max_length=40)
    value: Any = None


@router.put("/{slug}/sessions/{session_id}/answers", dependencies=[Depends(limit("answers", 300, 600))])
async def answer(slug: str, session_id: UUID, body: AnswerIn, x_resume_token: str | None = Header(default=None)) -> dict:
    async with tx(public_slug=slug) as conn:
        tenant = await _tenant_or_404(conn, slug)
    async with tx(tenant_id=tenant["id"]) as conn:
        sess = await _session(conn, session_id, x_resume_token)
        if sess["status"] != "in_progress":
            raise api_error(409, "already_completed", "Cette demande est déjà envoyée.")
        defn = await load_flow_version(conn, sess["flow_version_id"])
        answers: dict[str, Any] = dict(sess["answers"])
        st = walk(defn, answers)
        # On ne peut répondre qu'à l'étape courante ou modifier une étape déjà vue (récapitulatif).
        if body.step != st.current and body.step not in st.visited:
            raise api_error(409, "step_not_reachable", "Cette question n'est pas encore accessible.")
        try:
            step = defn.step(body.step)
        except KeyError:
            raise api_error(404, "unknown_step", "Question inconnue.") from None
        try:
            value = validate_answer(step, body.value)
        except AnswerError as exc:
            raise api_error(422, "invalid_answer", str(exc), step=exc.step_id) from None
        if step.type == "photos" and value:
            try:
                value = [str(UUID(v)) for v in value]
            except ValueError:
                raise api_error(422, "invalid_answer", "Fichier inconnu.", step=step.id) from None
            owned = await fetch_all(
                conn, "SELECT id FROM file_object WHERE intake_session_id = :s AND id = ANY(:ids)",
                s=session_id, ids=[UUID(v) for v in value],
            )
            if len(owned) != len(value):
                raise api_error(422, "invalid_answer", "Fichier inconnu.", step=step.id)
        answers[step.id] = value
        await execute(
            conn,
            "UPDATE intake_session SET answers = CAST(:a AS jsonb), current_step = :c, updated_at = now() WHERE id = :i",
            a=j(answers), c=walk(defn, answers).current, i=session_id,
        )
        await _track(conn, tenant["id"], session_id, sess["flow_version_id"], "step_answer", step.id)
        # Un changement de réponse peut changer la prestation : le créneau bloqué est alors libéré.
        hold = await _active_hold(conn, session_id)
        state = _state(defn, answers)
        if hold and state["service_key"]:
            svc = await service_by_key(conn, state["service_key"])
            if not svc or svc["id"] != hold["service_id"]:
                await execute(conn, "UPDATE booking SET status = 'expired' WHERE id = :b", b=hold["id"])
                hold = None
    return {"answers": answers, "state": state, "hold": hold}


@router.post("/{slug}/sessions/{session_id}/files", status_code=201, dependencies=[Depends(limit("upload", 30, 600))])
async def upload(slug: str, session_id: UUID, file: UploadFile = File(...),
                 x_resume_token: str | None = Header(default=None)) -> dict:
    async with tx(public_slug=slug) as conn:
        tenant = await _tenant_or_404(conn, slug)
    data = await file.read(storage.MAX_BYTES + 1)
    async with tx(tenant_id=tenant["id"]) as conn:
        sess = await _session(conn, session_id, x_resume_token)
        if sess["status"] != "in_progress":
            raise api_error(409, "already_completed", "Cette demande est déjà envoyée.")
        count = await fetch_one(conn, "SELECT count(*) AS n FROM file_object WHERE intake_session_id = :s", s=session_id)
        if count["n"] >= 20:
            raise api_error(422, "too_many_files", "Nombre maximum de fichiers atteint.")
        try:
            key = storage.save(str(tenant["id"]), data, file.content_type or "")
        except storage.StorageError as exc:
            raise api_error(422, "invalid_file", str(exc)) from None
        row = await fetch_one(
            conn,
            "INSERT INTO file_object (tenant_id, intake_session_id, storage_key, original_name, mime_type, size_bytes)"
            " VALUES (:t, :s, :k, :n, :m, :z) RETURNING id",
            t=tenant["id"], s=session_id, k=key, n=(file.filename or "fichier")[:120], m=file.content_type, z=len(data),
        )
    return {"id": str(row["id"]), "name": file.filename}


# ----------------------------------------------------------------------------- créneaux et réservation

async def _qualified_service(conn, sess) -> tuple[FlowDefinition, dict[str, Any]]:
    defn = await load_flow_version(conn, sess["flow_version_id"])
    state = _state(defn, sess["answers"])
    if not state["qualification_done"]:
        raise api_error(409, "qualification_incomplete", "Merci de répondre d'abord aux questions.")
    service = await service_by_key(conn, state["service_key"])
    if not service:
        raise api_error(409, "service_unavailable", "Cette prestation n'est plus proposée en ligne.")
    return defn, service


@router.get("/{slug}/sessions/{session_id}/slots", dependencies=[Depends(limit("slots", 120, 600))])
async def slots(slug: str, session_id: UUID, start: date | None = Query(default=None, alias="from"),
                days: int = Query(default=7, ge=1, le=MAX_DAYS_PER_QUERY),
                x_resume_token: str | None = Header(default=None)) -> dict:
    async with tx(public_slug=slug) as conn:
        tenant = await _tenant_or_404(conn, slug)
    _ensure_accepting(tenant)
    async with tx(tenant_id=tenant["id"]) as conn:
        sess = await _session(conn, session_id, x_resume_token)
        _, service = await _qualified_service(conn, sess)
        today = datetime.now(ZoneInfo(tenant["timezone"])).date()
        day_from = max(start or today, today)
        day_to = day_from + timedelta(days=days - 1)
        found = await service_slots(conn, tenant, service, day_from, day_to)
        horizon_end = today + timedelta(days=service["max_horizon_days"])
        await _track(conn, tenant["id"], session_id, sess["flow_version_id"], "slots_view", props={"count": len(found)})
    return {"service": _public_service(service), "from": day_from.isoformat(), "to": day_to.isoformat(),
            "has_more": day_to < horizon_end, "days": group_slots_by_day(found, tenant["timezone"])}


class HoldIn(BaseModel):
    start: datetime


@router.post("/{slug}/sessions/{session_id}/hold", dependencies=[Depends(limit("hold", 30, 600))])
async def hold(slug: str, session_id: UUID, body: HoldIn, x_resume_token: str | None = Header(default=None)) -> dict:
    if body.start.tzinfo is None:
        raise api_error(422, "invalid_start", "Horaire invalide.")
    async with tx(public_slug=slug) as conn:
        tenant = await _tenant_or_404(conn, slug)
    _ensure_accepting(tenant)
    async with tx(tenant_id=tenant["id"]) as conn:
        sess = await _session(conn, session_id, x_resume_token)
        if sess["status"] != "in_progress":
            raise api_error(409, "already_completed", "Cette demande est déjà envoyée.")
        _, service = await _qualified_service(conn, sess)
        try:
            booking = await create_hold(conn, tenant, service, body.start, session_id)
        except SlotUnavailable:
            raise api_error(409, "slot_taken", "Ce créneau vient d'être pris. Choisissez-en un autre.") from None
        await _track(conn, tenant["id"], session_id, sess["flow_version_id"], "hold")
    return {"hold": {k: booking[k] for k in ("id", "starts_at", "ends_at", "hold_expires_at")}}


class AddressIn(BaseModel):
    line: str = Field(min_length=3, max_length=200)
    postal_code: str = Field(min_length=3, max_length=10)
    city: str = Field(min_length=1, max_length=100)


class ConfirmIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    email: EmailStr
    phone: str = Field(default="", max_length=30)
    address: AddressIn | None = None
    preferred_channel: Literal["email", "sms", "phone"] = "email"
    consent_sms_reminders: bool = False
    accept_privacy: bool


def _in_area(tenant: dict[str, Any], postal_code: str) -> bool:
    prefixes = (tenant.get("settings") or {}).get("postal_prefixes") or []
    return not prefixes or any(postal_code.replace(" ", "").startswith(p) for p in prefixes)


def _completeness(items: list[dict[str, Any]], has_phone: bool) -> int:
    if not items:
        return 0
    answered = sum(1 for i in items if is_answered(i["value"]))
    return min(100, round(85 * answered / len(items)) + (15 if has_phone else 0))


@router.post("/{slug}/sessions/{session_id}/confirm", dependencies=[Depends(limit("confirm", 20, 600))])
async def confirm(slug: str, session_id: UUID, body: ConfirmIn, x_resume_token: str | None = Header(default=None)) -> dict:
    if not body.accept_privacy:
        raise api_error(422, "privacy_required", "Merci d'accepter le traitement de vos données pour ce rendez-vous.")
    if body.phone and not PHONE_RE.match(body.phone):
        raise api_error(422, "invalid_phone", "Numéro de téléphone invalide.")
    async with tx(public_slug=slug) as conn:
        tenant = await _tenant_or_404(conn, slug)
    _ensure_accepting(tenant)
    async with tx(tenant_id=tenant["id"]) as conn:
        sess = await _session(conn, session_id, x_resume_token)
        if sess["status"] == "completed":  # double clic / nouvel essai réseau : réponse idempotente
            booking = await fetch_one(
                conn, "SELECT id FROM booking WHERE intake_session_id = :s AND status = 'confirmed'", s=session_id
            )
            if booking:
                return await _booking_view(conn, tenant, booking["id"], include_link=True)
            raise api_error(409, "already_completed", "Cette demande est déjà envoyée.")
        defn, service = await _qualified_service(conn, sess)
        held = await fetch_one(
            conn,
            "SELECT id, starts_at, ends_at, service_id FROM booking WHERE intake_session_id = :s AND status = 'held'"
            " AND hold_expires_at > now() FOR UPDATE",
            s=session_id,
        )
        if not held or held["service_id"] != service["id"]:
            raise api_error(409, "hold_expired", "Le créneau n'est plus réservé pour vous. Merci d'en choisir un nouveau.")
        if service["meeting_type"] == "on_site":
            if not body.address:
                raise api_error(422, "address_required", "L'adresse du rendez-vous est nécessaire.")
            if not POSTAL_RE.match(body.address.postal_code):
                raise api_error(422, "invalid_postal_code", "Code postal invalide.")
            if not _in_area(tenant, body.address.postal_code):
                raise api_error(422, "out_of_area", "Désolé, cette adresse est en dehors de notre zone d'intervention.")
        if service["meeting_type"] in ("on_site", "phone") and not body.phone:
            raise api_error(422, "phone_required", "Un numéro de téléphone est nécessaire pour ce rendez-vous.")

        items = summarize(defn, sess["answers"])
        address = body.address.model_dump() if body.address else None
        contact = await fetch_one(
            conn,
            "INSERT INTO contact (tenant_id, first_name, last_name, email, phone, address, preferred_channel)"
            " VALUES (:t, :f, :l, :e, :p, CAST(:a AS jsonb), :c) RETURNING id, first_name, last_name, email, phone",
            t=tenant["id"], f=body.first_name.strip(), l=body.last_name.strip() or None, e=body.email,
            p=body.phone.strip() or None, a=j(address), c=body.preferred_channel,
        )
        case = await fetch_one(
            conn,
            "INSERT INTO case_file (tenant_id, contact_id, service_id, status, summary, answers, completeness, source)"
            " VALUES (:t, :c, :s, 'new', :sum, CAST(:a AS jsonb), :comp, (SELECT source FROM intake_session WHERE id = :i))"
            " RETURNING id",
            t=tenant["id"], c=contact["id"], s=service["id"], sum=summary_text(items), a=j(items),
            comp=_completeness(items, bool(body.phone)), i=session_id,
        )
        await execute(conn, "UPDATE file_object SET case_file_id = :c WHERE intake_session_id = :s", c=case["id"], s=session_id)
        proof = {"text": "Acceptation du traitement des données pour la gestion du rendez-vous", "at": utcnow().isoformat()}
        await execute(
            conn,
            "INSERT INTO consent (tenant_id, contact_id, channel, purpose, granted, proof)"
            " VALUES (:t, :c, 'email', 'transactional', true, CAST(:p AS jsonb))",
            t=tenant["id"], c=contact["id"], p=j(proof),
        )
        if body.phone:
            await execute(
                conn,
                "INSERT INTO consent (tenant_id, contact_id, channel, purpose, granted, proof)"
                " VALUES (:t, :c, 'sms', 'transactional', :g, CAST(:p AS jsonb))",
                t=tenant["id"], c=contact["id"], g=body.consent_sms_reminders,
                p=j({"text": "Recevoir les rappels de rendez-vous par SMS", "at": utcnow().isoformat()}),
            )
        booking = await fetch_one(
            conn,
            "UPDATE booking SET status = 'confirmed', hold_expires_at = NULL, case_file_id = :c, location = CAST(:l AS jsonb)"
            " WHERE id = :b RETURNING id, starts_at, ends_at",
            c=case["id"], l=j(address), b=held["id"],
        )
        await execute(
            conn, "UPDATE intake_session SET status = 'completed', case_file_id = :c, updated_at = now() WHERE id = :i",
            c=case["id"], i=session_id,
        )
        await log_booking_event(conn, tenant["id"], booking["id"], "client", "confirmed")
        await execute(
            conn,
            "INSERT INTO usage_counter (tenant_id, key, period, value) VALUES (:t, 'bookings', date_trunc('month', now())::date, 1)"
            " ON CONFLICT (tenant_id, key, period) DO UPDATE SET value = usage_counter.value + 1",
            t=tenant["id"],
        )
        await _track(conn, tenant["id"], session_id, sess["flow_version_id"], "booking")
        await notifications.on_booking_confirmed(conn, tenant, booking, contact)
        return await _booking_view(conn, tenant, booking["id"], include_link=True)


# ----------------------------------------------------------------------------- lien de gestion

async def _booking_view(conn, tenant, booking_id: UUID, include_link: bool = False) -> dict[str, Any]:
    b = await fetch_one(
        conn,
        "SELECT b.id, b.starts_at, b.ends_at, b.status, b.location, s.name AS service_name, s.meeting_type,"
        " s.duration_min, c.first_name FROM booking b JOIN service s ON s.id = b.service_id"
        " LEFT JOIN case_file cf ON cf.id = b.case_file_id LEFT JOIN contact c ON c.id = cf.contact_id WHERE b.id = :b",
        b=booking_id,
    )
    cutoff = b["starts_at"] - timedelta(minutes=int((tenant.get("settings") or {}).get("cancel_notice_min", 120)))
    view = {
        "booking": {**b, "id": str(b["id"])},
        "tenant": {"name": tenant["name"], "slug": tenant["slug"], "timezone": tenant["timezone"],
                   "phone": (tenant["public_profile"] or {}).get("phone")},
        "can_modify": b["status"] == "confirmed" and utcnow() < cutoff,
    }
    if include_link:
        view["manage_url"] = notifications.manage_url(tenant["slug"], b["id"])
        view["manage_token"] = view["manage_url"].rsplit("/", 1)[-1]
    return view


def _booking_id_from(token: str) -> UUID:
    value = unsign_token(get_settings().secret_key, "manage", token)
    try:
        return UUID(value) if value else None  # type: ignore[return-value]
    except ValueError:
        return None  # type: ignore[return-value]


async def _managed(conn, tenant, token: str) -> dict[str, Any]:
    booking_id = _booking_id_from(token)
    booking = booking_id and await fetch_one(
        conn, "SELECT id, service_id, resource_id, case_file_id, starts_at, ends_at, status FROM booking WHERE id = :b",
        b=booking_id,
    )
    if not booking:
        raise api_error(404, "not_found", "Rendez-vous introuvable.")
    return booking


@router.get("/{slug}/manage/{token}", dependencies=[Depends(limit("manage", 60, 600))])
async def manage(slug: str, token: str) -> dict:
    async with tx(public_slug=slug) as conn:
        tenant = await _tenant_or_404(conn, slug)
    async with tx(tenant_id=tenant["id"]) as conn:
        booking = await _managed(conn, tenant, token)
        return await _booking_view(conn, tenant, booking["id"])


async def _contact_of(conn, booking) -> dict[str, Any] | None:
    if not booking["case_file_id"]:
        return None
    return await fetch_one(
        conn, "SELECT c.id, c.first_name, c.last_name, c.email, c.phone FROM contact c"
        " JOIN case_file cf ON cf.contact_id = c.id WHERE cf.id = :c", c=booking["case_file_id"],
    )


@router.post("/{slug}/manage/{token}/cancel", dependencies=[Depends(limit("manage", 60, 600))])
async def cancel(slug: str, token: str) -> dict:
    async with tx(public_slug=slug) as conn:
        tenant = await _tenant_or_404(conn, slug)
    async with tx(tenant_id=tenant["id"]) as conn:
        booking = await _managed(conn, tenant, token)
        view = await _booking_view(conn, tenant, booking["id"])
        if not view["can_modify"]:
            raise api_error(409, "too_late", "Ce rendez-vous ne peut plus être modifié en ligne. Contactez l'entreprise.")
        await execute(conn, "UPDATE booking SET status = 'cancelled', cancelled_by = 'client' WHERE id = :b", b=booking["id"])
        if booking["case_file_id"]:
            await execute(conn, "UPDATE case_file SET status = 'cancelled' WHERE id = :c", c=booking["case_file_id"])
        await log_booking_event(conn, tenant["id"], booking["id"], "client", "cancelled")
        await notifications.on_booking_cancelled(conn, tenant, booking, await _contact_of(conn, booking), by="client")
        return await _booking_view(conn, tenant, booking["id"])


@router.get("/{slug}/manage/{token}/slots", dependencies=[Depends(limit("slots", 120, 600))])
async def manage_slots(slug: str, token: str, start: date | None = Query(default=None, alias="from"),
                       days: int = Query(default=7, ge=1, le=MAX_DAYS_PER_QUERY)) -> dict:
    async with tx(public_slug=slug) as conn:
        tenant = await _tenant_or_404(conn, slug)
    async with tx(tenant_id=tenant["id"]) as conn:
        booking = await _managed(conn, tenant, token)
        service = await service_by_id(conn, booking["service_id"])
        today = datetime.now(ZoneInfo(tenant["timezone"])).date()
        day_from = max(start or today, today)
        day_to = day_from + timedelta(days=days - 1)
        found = await service_slots(conn, tenant, service, day_from, day_to, ignore_booking_id=booking["id"])
    return {"service": _public_service(service), "from": day_from.isoformat(), "to": day_to.isoformat(),
            "has_more": day_to < today + timedelta(days=service["max_horizon_days"]),
            "days": group_slots_by_day(found, tenant["timezone"])}


@router.post("/{slug}/manage/{token}/reschedule", dependencies=[Depends(limit("manage", 60, 600))])
async def manage_reschedule(slug: str, token: str, body: HoldIn) -> dict:
    if body.start.tzinfo is None:
        raise api_error(422, "invalid_start", "Horaire invalide.")
    async with tx(public_slug=slug) as conn:
        tenant = await _tenant_or_404(conn, slug)
    async with tx(tenant_id=tenant["id"]) as conn:
        booking = await _managed(conn, tenant, token)
        view = await _booking_view(conn, tenant, booking["id"])
        if not view["can_modify"]:
            raise api_error(409, "too_late", "Ce rendez-vous ne peut plus être modifié en ligne. Contactez l'entreprise.")
        try:
            updated = await reschedule(conn, tenant, booking, body.start, actor="client")
        except SlotUnavailable:
            raise api_error(409, "slot_taken", "Ce créneau n'est plus disponible. Choisissez-en un autre.") from None
        await notifications.on_booking_rescheduled(
            conn, tenant, {**booking, **updated}, await _contact_of(conn, booking)
        )
        return await _booking_view(conn, tenant, booking["id"])


# ----------------------------------------------------------------------------- mesure d'audience

class EventIn(BaseModel):
    session_id: UUID
    type: Literal["step_view"]
    step: str = Field(max_length=40)


@router.post("/{slug}/events", status_code=204, response_class=Response, response_model=None, dependencies=[Depends(limit("events", 600, 600))])
async def event(slug: str, body: EventIn, x_resume_token: str | None = Header(default=None)) -> None:
    async with tx(public_slug=slug) as conn:
        tenant = await _tenant_or_404(conn, slug)
    async with tx(tenant_id=tenant["id"]) as conn:
        sess = await _session(conn, body.session_id, x_resume_token)
        await _track(conn, tenant["id"], body.session_id, sess["flow_version_id"], body.type, body.step)
