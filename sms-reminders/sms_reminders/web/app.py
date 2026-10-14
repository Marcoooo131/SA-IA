"""FastAPI application: server-rendered UI (no data in the browser beyond the current page),
delivery-status webhook, health checks. All rules are enforced server side."""

from __future__ import annotations

import logging
import secrets
from datetime import date, datetime, time, timedelta
from pathlib import Path
from urllib.parse import urlencode

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import ValidationError
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session, selectinload
from starlette.middleware.sessions import SessionMiddleware

from .. import appointments as ops
from .. import importer, stats, template_admin
from ..audit import record
from ..config import Environment
from ..container import Container, get_container
from ..db import init_db, session_scope
from ..models import (
    Appointment,
    AppointmentStatus,
    BlockedNumber,
    Confirmation,
    ConfirmationSource,
    Event,
    ImportBatch,
    JobStatus,
    Service,
    ServiceConfig,
    SmsJob,
    Step,
    TemplateSlot,
    TemplateVersion,
)
from ..phone import check_mobile, display as phone_display
from ..policy import Policy, load_policy, save_policy
from ..scheduler import execute_job, planning_blocker
from ..templating import VARIABLES, context_for, render, sample_context, segment_info, validate
from ..timeutil import LocalTimeError, PARIS, fmt, fmt_short, local_to_utc
from .auth import ROLE_LABELS, Authenticator, Role, User, check_csrf, csrf_token, current_user, require

log = logging.getLogger(__name__)
HERE = Path(__file__).parent
PAGE_SIZE = 50

JOB_LABELS = {
    JobStatus.SCHEDULED: "Programmé", JobStatus.RETRY_WAIT: "Nouvelle tentative", JobStatus.BLOCKED: "Bloqué",
    JobStatus.SENDING: "En cours", JobStatus.SENT: "Envoyé", JobStatus.SIMULATED: "Simulé — non envoyé",
    JobStatus.FAILED: "Erreur", JobStatus.CANCELLED: "Annulé", JobStatus.SKIPPED_LATE: "Non envoyé (trop tard)",
    JobStatus.EXPIRED: "Expiré", JobStatus.UNCERTAIN: "À vérifier",
}
JOB_CLASS = {
    JobStatus.SCHEDULED: "info", JobStatus.RETRY_WAIT: "warn", JobStatus.BLOCKED: "err", JobStatus.SENDING: "info",
    JobStatus.SENT: "ok", JobStatus.SIMULATED: "sim", JobStatus.FAILED: "err", JobStatus.CANCELLED: "muted",
    JobStatus.SKIPPED_LATE: "muted", JobStatus.EXPIRED: "warn", JobStatus.UNCERTAIN: "err",
}
DELIVERY_LABELS = {"queued": "En file", "sent": "Transmis à l'opérateur", "delivered": "Remis", "undelivered": "Non remis", "failed": "Échec"}
SOURCE_LABELS = {
    ConfirmationSource.TEAM: "confirmation interne de l'équipe (pas une réponse du client)",
    ConfirmationSource.IMPORT: "statut repris du fichier importé",
    ConfirmationSource.CUSTOMER_REPLY: "réponse du client",
}
FLAGS = {
    "sms_error": "SMS en erreur / à vérifier",
    "cancelled": "Rendez-vous annulés",
    "past": "Rendez-vous passés",
    "suspended": "Relances suspendues",
    "resume_pending": "Reprise à valider",
    "no_service": "Service manquant",
}
VIEWS = {
    "all": "Tous les rendez-vous",
    "movers": "Movers",
    "takeovers": "Takeovers",
    "confirmed": "Confirmés",
    "to_confirm": "À confirmer",
}


def _parse_date(value: str | None) -> date | None:
    try:
        return date.fromisoformat(value) if value else None
    except ValueError:
        return None


def _safe_next(value: str | None, default: str) -> str:
    return value if value and value.startswith("/") and not value.startswith("//") else default


def create_app(container: Container | None = None) -> FastAPI:
    c = container or get_container()
    settings = c.settings
    init_db()

    app = FastAPI(title="Relances SMS", docs_url=None, redoc_url=None, openapi_url=None)
    session_secret = settings.session_secret.get_secret_value()
    if not session_secret:
        if settings.environment not in (Environment.DEV, Environment.TEST, Environment.DESKTOP):
            raise RuntimeError("SMR_SESSION_SECRET is required")
        session_secret = secrets.token_urlsafe(32)
    app.add_middleware(SessionMiddleware, secret_key=session_secret, session_cookie="smr_session",
                       max_age=8 * 3600, same_site="strict", https_only=settings.cookie_secure)
    app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")
    templates = Jinja2Templates(directory=HERE / "templates")
    templates.env.globals.update(
        Role=Role, ROLE_LABELS=ROLE_LABELS, Service=Service, Step=Step, JobStatus=JobStatus, JOB_LABELS=JOB_LABELS,
        JOB_CLASS=JOB_CLASS, DELIVERY_LABELS=DELIVERY_LABELS, SOURCE_LABELS=SOURCE_LABELS, FLAGS=FLAGS, VIEWS=VIEWS,
        VARIABLES=VARIABLES, fmt=fmt, fmt_short=fmt_short, phone_display=phone_display, Confirmation=Confirmation,
        AppointmentStatus=AppointmentStatus,
    )
    auth = Authenticator(settings)
    app.state.container = c

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'; form-action 'self'"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        if not request.url.path.startswith("/static"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        if exc.status_code == 401 and request.method == "GET" and not request.url.path.startswith("/webhooks"):
            return RedirectResponse("/login", status_code=303)
        return PlainTextResponse(str(exc.detail), status_code=exc.status_code)

    def flash(request: Request, message: str, kind: str = "ok") -> None:
        request.session.setdefault("flash", []).append([kind, message])

    def render_page(request: Request, name: str, user: User | None, **ctx) -> HTMLResponse:
        messages = request.session.pop("flash", [])
        return templates.TemplateResponse(request, name, {
            "user": user, "csrf": csrf_token(request), "settings": settings, "provider": c.provider,
            "messages": messages, "now": c.now(), **ctx,
        })

    def back(url: str) -> RedirectResponse:
        return RedirectResponse(url, status_code=303)

    async def form_user(request: Request, role: Role) -> tuple[User, dict]:
        user = require(role)(request)
        form = await request.form()
        check_csrf(request, form.get("csrf"))
        return user, {k: v for k, v in form.multi_items()}

    def get_appt(s: Session, appt_id: int) -> Appointment:
        appt = s.scalars(select(Appointment).options(selectinload(Appointment.jobs)).where(Appointment.id == appt_id)).first()
        if appt is None:
            raise HTTPException(404, "rendez-vous introuvable")
        return appt

    # ------------------------------------------------------------------ health

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    @app.get("/readyz")
    def readyz():
        with session_scope() as s:
            s.execute(text("SELECT 1"))
        return {"status": "ready", "sms_provider": c.provider.name, "simulated": c.provider.simulated}

    # ------------------------------------------------------------------ auth

    @app.get("/login", response_class=HTMLResponse)
    def login_form(request: Request):
        return render_page(request, "login.html", None, error=None)

    @app.post("/login")
    def login(request: Request, login: str = Form(...), password: str = Form(...), csrf: str = Form("")):
        check_csrf(request, csrf)
        user = auth.authenticate(login.strip(), password)
        if user is None:
            with session_scope() as s:
                record(s, login.strip()[:80] or "?", "login_failed", "Échec de connexion.")
            return render_page(request, "login.html", None, error="Identifiants invalides ou compte temporairement verrouillé.")
        request.session.clear()
        request.session["user"] = {"login": user.login, "role": int(user.role)}
        with session_scope() as s:
            record(s, user.login, "login", "Connexion.")
        return back("/")

    @app.get("/local-login")
    def local_login(request: Request, t: str = ""):
        """Desktop application: one-time token from the launcher logs in the Windows user."""
        expected = settings.local_login_token.get_secret_value()
        if settings.environment != Environment.DESKTOP or not expected or not secrets.compare_digest(t, expected):
            raise HTTPException(403, "lien de connexion invalide")
        login = (settings.local_user or "poste local")[:80]
        request.session.clear()
        request.session["user"] = {"login": login, "role": int(Role.ADMIN)}
        with session_scope() as s:
            record(s, login, "login", "Connexion (application de bureau).")
        return back("/")

    @app.post("/logout")
    async def logout(request: Request):
        form = await request.form()
        check_csrf(request, form.get("csrf"))
        request.session.clear()
        return back("/login")

    # ------------------------------------------------------------------ dashboard

    @app.get("/", response_class=HTMLResponse)
    def dashboard(request: Request, period: int = 30):
        user = require(Role.ADVISOR)(request)
        period = period if period in (7, 30, 90) else 30
        now = c.now()
        with session_scope() as s:
            overall = stats.compute(s, now, period_days=period)
            per_service = {sv: stats.compute(s, now, service=sv, period_days=period) for sv in Service.ALL}
            no_service = s.scalar(select(func.count(Appointment.id)).where(
                Appointment.service.is_(None), Appointment.status == AppointmentStatus.ACTIVE, Appointment.appointment_at >= now)) or 0
            config_issues = _config_issues(s, c)
            upcoming = s.scalars(
                select(Appointment).options(selectinload(Appointment.jobs))
                .where(Appointment.status == AppointmentStatus.ACTIVE, Appointment.confirmation == Confirmation.TO_CONFIRM,
                       Appointment.appointment_at >= now, Appointment.appointment_at < now + timedelta(hours=48))
                .order_by(Appointment.appointment_at).limit(20)
            ).all()
        return render_page(request, "dashboard.html", user, overall=overall, per_service=per_service, period=period,
                           no_service=no_service, config_issues=config_issues, upcoming=upcoming)

    # ------------------------------------------------------------------ appointment lists

    @app.get("/appointments", response_class=HTMLResponse)
    def appointment_list(request: Request, view: str = "all", q: str = "", service: str = "", confirmation: str = "",
                         flag: str = "", date_from: str = "", date_to: str = "", sms: str = "", page: int = 1):
        user = require(Role.ADVISOR)(request)
        view = view if view in VIEWS else "all"
        now = c.now()
        stmt = select(Appointment).options(selectinload(Appointment.jobs))
        if view in Service.ALL:
            service = view
        if view == "confirmed":
            confirmation = Confirmation.CONFIRMED
        if view == "to_confirm":
            confirmation = Confirmation.TO_CONFIRM
        if service in Service.ALL:
            stmt = stmt.where(Appointment.service == service)
        if confirmation in (Confirmation.CONFIRMED, Confirmation.TO_CONFIRM):
            stmt = stmt.where(Appointment.confirmation == confirmation)
        if flag == "cancelled":
            stmt = stmt.where(Appointment.status == AppointmentStatus.CANCELLED)
        else:
            stmt = stmt.where(Appointment.status == AppointmentStatus.ACTIVE)
        if flag == "past":
            stmt = stmt.where(Appointment.appointment_at < now)
        elif flag != "cancelled" and not date_from:
            # Default: today's and upcoming appointments.
            today_start = datetime.combine(now.astimezone(PARIS).date(), time(0), tzinfo=PARIS)
            stmt = stmt.where(Appointment.appointment_at >= today_start)
        if flag == "suspended":
            stmt = stmt.where(Appointment.suspended.is_(True))
        if flag == "resume_pending":
            stmt = stmt.where(Appointment.resume_pending.is_(True))
        if flag == "no_service":
            stmt = stmt.where(Appointment.service.is_(None))
        if flag == "sms_error":
            sms = sms or "error"
        if sms:
            statuses = JobStatus.ERRORS if sms == "error" else (sms,)
            stmt = stmt.where(Appointment.id.in_(select(SmsJob.appointment_id).where(SmsJob.status.in_(statuses))))
        d_from, d_to = _parse_date(date_from), _parse_date(date_to)
        if d_from:
            stmt = stmt.where(Appointment.appointment_date >= d_from)
        if d_to:
            stmt = stmt.where(Appointment.appointment_date <= d_to)
        q = q.strip()[:80]
        if q:
            like = f"%{q}%"
            conds = [Appointment.last_name.ilike(like), Appointment.first_name.ilike(like),
                     Appointment.customer_ref.ilike(like), Appointment.phone_raw.ilike(like)]
            ph = check_mobile(q)
            if ph.e164:
                conds.append(Appointment.phone_e164 == ph.e164)
            stmt = stmt.where(or_(*conds))
        page = max(page, 1)
        with session_scope() as s:
            total = s.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
            rows = s.scalars(stmt.order_by(Appointment.appointment_at).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)).all()
        params = {"view": view, "q": q, "service": service if view not in Service.ALL else "", "confirmation": confirmation if view not in ("confirmed", "to_confirm") else "",
                  "flag": flag, "date_from": date_from, "date_to": date_to, "sms": sms}
        qs = urlencode({k: v for k, v in params.items() if v})
        return render_page(request, "appointments.html", user, rows=rows, total=total, page=page, page_size=PAGE_SIZE,
                           view=view, params=params, qs=qs, next_url=f"/appointments?{qs}&page={page}" if qs else f"/appointments?page={page}")

    @app.get("/appointments/new", response_class=HTMLResponse)
    def appointment_new_form(request: Request):
        user = require(Role.SUPERVISOR)(request)
        return render_page(request, "appointment_form.html", user, appt=None, values={}, errors=[])

    def _form_to_data(values: dict) -> tuple[ops.AppointmentData | None, list[str]]:
        errors = []
        try:
            d = importer.parse_date(values.get("appointment_date", ""))
        except ValueError as exc:
            errors.append(str(exc)); d = None
        try:
            t = importer.parse_time(values.get("appointment_time", ""))
        except ValueError as exc:
            errors.append(str(exc)); t = None
        service = values.get("service") or None
        if service and service not in Service.ALL:
            errors.append("service inconnu")
        for key, label in (("customer_ref", "numéro client"), ("last_name", "nom"), ("phone", "téléphone")):
            if not values.get(key, "").strip():
                errors.append(f"{label} obligatoire")
        if d and t:
            try:
                local_to_utc(d, t)
            except LocalTimeError as exc:
                errors.append(str(exc))
        if errors:
            return None, errors
        return ops.AppointmentData(
            customer_ref=values["customer_ref"][:80], first_name=values.get("first_name", "")[:120],
            last_name=values["last_name"][:120], phone=values["phone"][:40], appointment_date=d, appointment_time=t,
            service=service, external_ref=(values.get("external_ref") or "")[:80] or None,
        ), []

    @app.post("/appointments/new")
    async def appointment_create(request: Request):
        user, values = await form_user(request, Role.SUPERVISOR)
        data, errors = _form_to_data(values)
        if data:
            with session_scope() as s:
                key = ops.business_key(data.external_ref, data.customer_ref, data.service, data.appointment_date, data.appointment_time)
                if s.scalar(select(Appointment.id).where(Appointment.business_key == key)):
                    errors.append("Ce rendez-vous existe déjà.")
                elif local_to_utc(data.appointment_date, data.appointment_time)[0] <= c.now():
                    errors.append("Le rendez-vous est déjà passé.")
                else:
                    appt = ops.create_appointment(s, data, actor=user.login, policy=load_policy(s), now=c.now(), origin="saisie manuelle")
                    appt_id = appt.id
        if errors:
            return render_page(request, "appointment_form.html", user, appt=None, values=values, errors=errors)
        flash(request, "Rendez-vous créé.")
        return back(f"/appointments/{appt_id}")

    # ------------------------------------------------------------------ appointment detail & actions

    @app.get("/appointments/{appt_id}", response_class=HTMLResponse)
    def appointment_detail(request: Request, appt_id: int):
        user = require(Role.ADVISOR)(request)
        now = c.now()
        with session_scope() as s:
            appt = get_appt(s, appt_id)
            policy = load_policy(s)
            events = s.scalars(select(Event).where(Event.appointment_id == appt_id).order_by(Event.at.desc(), Event.id.desc())).all()
            for j in appt.jobs:
                _ = j.template_version
            blocker = planning_blocker(appt)
            preview = ops.resume_preview(appt, policy, now) if appt.resume_pending or appt.suspended else []
            blocked_number = bool(appt.phone_e164 and s.scalar(select(BlockedNumber.id).where(BlockedNumber.phone_e164 == appt.phone_e164)))
        return render_page(request, "appointment_detail.html", user, appt=appt, events=events, blocker=blocker,
                           preview=preview, blocked_number=blocked_number, nonce=secrets.token_hex(8))

    @app.post("/appointments/{appt_id}/confirm")
    async def appointment_confirm(request: Request, appt_id: int):
        user, values = await form_user(request, Role.ADVISOR)
        target = _safe_next(values.get("next"), f"/appointments/{appt_id}")
        wanted = values.get("confirmed") in ("on", "1", "true")
        with session_scope() as s:
            appt = get_appt(s, appt_id)
            if appt.status != AppointmentStatus.ACTIVE:
                flash(request, "Rendez-vous annulé : réactivez-le avant de le confirmer.", "err")
                return back(target)
            if wanted:
                n = ops.confirm(s, appt, actor=user.login, now=c.now())
                flash(request, f"Rendez-vous confirmé ({n} relance(s) annulée(s)).")
            elif appt.confirmation == Confirmation.CONFIRMED:
                ops.unconfirm(s, appt, actor=user.login, now=c.now())
                flash(request, "Confirmation retirée. Aucune relance n'est relancée automatiquement : validez la reprise sur la fiche.", "warn")
                target = f"/appointments/{appt_id}#reprise"
        return back(target)

    @app.post("/appointments/{appt_id}/edit")
    async def appointment_edit(request: Request, appt_id: int):
        user, values = await form_user(request, Role.ADVISOR)
        data, errors = _form_to_data(values)
        with session_scope() as s:
            appt = get_appt(s, appt_id)
            if data:
                try:
                    changed = ops.update_appointment(s, appt, data, actor=user.login, policy=load_policy(s), now=c.now())
                    flash(request, "Modifications enregistrées." if changed else "Aucune modification.")
                except ops.OperationError as exc:
                    errors.append(str(exc))
        if errors:
            flash(request, "Modification refusée : " + " ; ".join(errors), "err")
        return back(f"/appointments/{appt_id}")

    @app.post("/appointments/{appt_id}/suspend")
    async def appointment_suspend(request: Request, appt_id: int):
        user, values = await form_user(request, Role.ADVISOR)
        with session_scope() as s:
            appt = get_appt(s, appt_id)
            n = ops.suspend(s, appt, reason=values.get("reason", "")[:255], actor=user.login)
        flash(request, f"Relances suspendues ({n} annulée(s)).")
        return back(f"/appointments/{appt_id}")

    @app.post("/appointments/{appt_id}/resume")
    async def appointment_resume(request: Request, appt_id: int):
        user, values = await form_user(request, Role.ADVISOR)
        if values.get("acknowledge") != "on":
            flash(request, "Cochez la case de validation pour reprendre les relances.", "err")
            return back(f"/appointments/{appt_id}#reprise")
        with session_scope() as s:
            appt = get_appt(s, appt_id)
            try:
                n = ops.resume(s, appt, actor=user.login, policy=load_policy(s), now=c.now())
                flash(request, f"Reprise validée : {n} relance(s) programmée(s).")
            except ops.OperationError as exc:
                flash(request, str(exc), "err")
        return back(f"/appointments/{appt_id}")

    @app.post("/appointments/{appt_id}/cancel")
    async def appointment_cancel(request: Request, appt_id: int):
        user, values = await form_user(request, Role.SUPERVISOR)
        with session_scope() as s:
            appt = get_appt(s, appt_id)
            n = ops.cancel_appointment(s, appt, reason=values.get("reason", "")[:255], actor=user.login, now=c.now())
        flash(request, f"Rendez-vous annulé ({n} relance(s) annulée(s)).")
        return back(f"/appointments/{appt_id}")

    @app.post("/appointments/{appt_id}/reactivate")
    async def appointment_reactivate(request: Request, appt_id: int):
        user, _ = await form_user(request, Role.SUPERVISOR)
        with session_scope() as s:
            ops.reactivate(s, get_appt(s, appt_id), actor=user.login)
        flash(request, "Rendez-vous réactivé : validez la reprise des relances.", "warn")
        return back(f"/appointments/{appt_id}#reprise")

    @app.post("/appointments/{appt_id}/manual")
    async def appointment_manual(request: Request, appt_id: int):
        user, values = await form_user(request, Role.SUPERVISOR)
        if values.get("acknowledge") != "on":
            flash(request, "Cochez la case de vérification avant une relance manuelle.", "err")
            return back(f"/appointments/{appt_id}")
        nonce = (values.get("nonce") or "")[:40]
        if not nonce:
            raise HTTPException(400, "nonce manquant")
        with session_scope() as s:
            appt = get_appt(s, appt_id)
            try:
                job = ops.request_manual(s, appt, template_step=values.get("template_step", ""), actor=user.login,
                                         policy=load_policy(s), now=c.now(), nonce=nonce)
                job_id = job.id
            except ops.OperationError as exc:
                flash(request, str(exc), "err")
                return back(f"/appointments/{appt_id}")
        status = execute_job(c, job_id)
        with session_scope() as s:
            job = s.get(SmsJob, job_id)
            label, reason = JOB_LABELS.get(job.status, job.status), job.status_reason or ""
        kind = "ok" if job.status in (JobStatus.SENT, JobStatus.SIMULATED) else "err"
        flash(request, f"Relance manuelle : {label}{(' — ' + reason) if reason and kind == 'err' else ''}.", kind)
        return back(f"/appointments/{appt_id}")

    @app.post("/appointments/{appt_id}/delete")
    async def appointment_delete(request: Request, appt_id: int):
        user, values = await form_user(request, Role.ADMIN)
        if values.get("confirm_text") != "SUPPRIMER":
            flash(request, "Saisissez SUPPRIMER pour confirmer l'effacement.", "err")
            return back(f"/appointments/{appt_id}")
        with session_scope() as s:
            ops.delete_appointment(s, get_appt(s, appt_id), actor=user.login, reason=values.get("reason", ""))
        flash(request, "Rendez-vous et historique supprimés.")
        return back("/appointments")

    # ------------------------------------------------------------------ SMS history

    @app.get("/sms", response_class=HTMLResponse)
    def sms_history(request: Request, service: str = "", status: str = "", step: str = "", date_from: str = "",
                    date_to: str = "", q: str = "", page: int = 1):
        user = require(Role.ADVISOR)(request)
        stmt = select(SmsJob).join(Appointment).options(selectinload(SmsJob.appointment), selectinload(SmsJob.template_version))
        if service in Service.ALL:
            stmt = stmt.where(Appointment.service == service)
        if status == "error":
            stmt = stmt.where(SmsJob.status.in_(JobStatus.ERRORS))
        elif status in JOB_LABELS:
            stmt = stmt.where(SmsJob.status == status)
        if step in Step.LABELS:
            stmt = stmt.where(SmsJob.step == step)
        d_from, d_to = _parse_date(date_from), _parse_date(date_to)
        if d_from:
            stmt = stmt.where(SmsJob.scheduled_at >= datetime.combine(d_from, time(0), tzinfo=PARIS))
        if d_to:
            stmt = stmt.where(SmsJob.scheduled_at < datetime.combine(d_to + timedelta(days=1), time(0), tzinfo=PARIS))
        q = q.strip()[:80]
        if q:
            like = f"%{q}%"
            stmt = stmt.where(or_(Appointment.last_name.ilike(like), Appointment.customer_ref.ilike(like), Appointment.phone_raw.ilike(like)))
        page = max(page, 1)
        with session_scope() as s:
            total = s.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
            rows = s.scalars(stmt.order_by(SmsJob.scheduled_at.desc()).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)).all()
        params = {"service": service, "status": status, "step": step, "date_from": date_from, "date_to": date_to, "q": q}
        return render_page(request, "sms.html", user, rows=rows, total=total, page=page, page_size=PAGE_SIZE, params=params,
                           qs=urlencode({k: v for k, v in params.items() if v}))

    # ------------------------------------------------------------------ import

    @app.get("/import", response_class=HTMLResponse)
    def import_home(request: Request):
        user = require(Role.SUPERVISOR)(request)
        with session_scope() as s:
            batches = s.scalars(select(ImportBatch).order_by(ImportBatch.id.desc()).limit(20)).all()
        return render_page(request, "import.html", user, batches=batches, error=None)

    @app.get("/import/exemple.csv")
    def import_example(request: Request):
        require(Role.SUPERVISOR)(request)
        return FileResponse(HERE / "static" / "exemple-import.csv", media_type="text/csv", filename="exemple-import.csv")

    @app.post("/import")
    async def import_upload(request: Request, file: UploadFile = File(...), csrf: str = Form("")):
        user = require(Role.SUPERVISOR)(request)
        check_csrf(request, csrf)
        content = await file.read(settings.import_max_bytes + 1)
        error = None
        if len(content) > settings.import_max_bytes:
            error = f"Fichier trop volumineux (maximum {settings.import_max_bytes // 1024 // 1024} Mo)."
        else:
            try:
                with session_scope() as s:
                    batch = importer.create_batch(s, filename=file.filename or "import", content=content, actor=user.login,
                                                  max_rows=settings.import_max_rows)
                    batch_id = batch.id
            except importer.ImportFileError as exc:
                error = str(exc)
        if error:
            with session_scope() as s:
                batches = s.scalars(select(ImportBatch).order_by(ImportBatch.id.desc()).limit(20)).all()
            return render_page(request, "import.html", user, batches=batches, error=error)
        return back(f"/import/{batch_id}")

    @app.get("/import/{batch_id}", response_class=HTMLResponse)
    def import_review(request: Request, batch_id: int):
        user = require(Role.SUPERVISOR)(request)
        with session_scope() as s:
            batch = s.get(ImportBatch, batch_id)
            if batch is None:
                raise HTTPException(404, "import introuvable")
            results, map_errors = [], []
            if batch.status == "uploaded" and batch.rows is not None:
                map_errors = importer.mapping_errors(batch.mapping or {})
                if not map_errors:
                    results = importer.validate_rows(s, batch.headers, batch.rows, batch.mapping, c.now())
        summary = importer.summarize(results) if results else None
        return render_page(request, "import_review.html", user, batch=batch, fields=importer.FIELDS, map_errors=map_errors,
                           results=results, summary=summary, row_labels=importer.STATUS_LABELS,
                           sample=(batch.rows or [])[:3])

    @app.post("/import/{batch_id}/mapping")
    async def import_mapping(request: Request, batch_id: int):
        user, values = await form_user(request, Role.SUPERVISOR)
        with session_scope() as s:
            batch = s.get(ImportBatch, batch_id)
            if batch is None or batch.status != "uploaded":
                raise HTTPException(404, "import introuvable ou déjà traité")
            batch.mapping = {k: (values.get(f"map_{k}") if values.get(f"map_{k}") in batch.headers else None) for k in importer.FIELDS}
        return back(f"/import/{batch_id}#apercu")

    @app.post("/import/{batch_id}/commit")
    async def import_commit(request: Request, batch_id: int):
        user, _ = await form_user(request, Role.SUPERVISOR)
        with session_scope() as s:
            batch = s.get(ImportBatch, batch_id)
            if batch is None:
                raise HTTPException(404, "import introuvable")
            if importer.mapping_errors(batch.mapping or {}):
                flash(request, "Correspondance des colonnes incomplète.", "err")
                return back(f"/import/{batch_id}")
            try:
                summary = importer.commit_batch(s, batch, actor=user.login, policy=load_policy(s), now=c.now())
            except importer.ImportFileError as exc:
                flash(request, str(exc), "err")
                return back(f"/import/{batch_id}")
        flash(request, f"Import validé : {summary['created']} rendez-vous créés, {summary['duplicate_existing']} déjà enregistrés, "
                       f"{summary['duplicate_file']} doublons, {summary['error']} lignes en erreur.")
        return back(f"/import/{batch_id}")

    @app.post("/import/{batch_id}/discard")
    async def import_discard(request: Request, batch_id: int):
        user, _ = await form_user(request, Role.SUPERVISOR)
        with session_scope() as s:
            batch = s.get(ImportBatch, batch_id)
            if batch is None or batch.status != "uploaded":
                raise HTTPException(404, "import introuvable ou déjà traité")
            importer.discard_batch(s, batch, actor=user.login)
        flash(request, "Import abandonné, données du fichier supprimées.")
        return back("/import")

    # ------------------------------------------------------------------ settings

    @app.get("/settings", response_class=HTMLResponse)
    def settings_page(request: Request):
        user = require(Role.SUPERVISOR)(request)
        with session_scope() as s:
            policy = load_policy(s)
            services = {sc.service: sc for sc in s.scalars(select(ServiceConfig)).all()}
            slots = s.scalars(select(TemplateSlot).options(selectinload(TemplateSlot.active_version), selectinload(TemplateSlot.versions))
                              .order_by(TemplateSlot.service, TemplateSlot.id)).all()
            config_issues = _config_issues(s, c)
        return render_page(request, "settings.html", user, policy=policy, services=services, slots=slots, config_issues=config_issues)

    @app.post("/settings/services")
    async def settings_services(request: Request):
        user, values = await form_user(request, Role.ADMIN)
        with session_scope() as s:
            for sv in Service.ALL:
                cfg = s.get(ServiceConfig, sv)
                sender = (values.get(f"sender_{sv}") or "").strip()[:40] or None
                enabled = values.get(f"enabled_{sv}") == "on"
                if sender != cfg.sender_id or enabled != cfg.enabled:
                    cfg.sender_id, cfg.enabled, cfg.updated_by = sender, enabled, user.login
                    record(s, user.login, "service_config", f"Paramètres {Service.LABELS[sv]} modifiés (expéditeur {'renseigné' if sender else 'vide'}, envois {'actifs' if enabled else 'désactivés'}).")
        flash(request, "Numéros d'expédition enregistrés.")
        return back("/settings#services")

    @app.post("/settings/policy")
    async def settings_policy(request: Request):
        user, values = await form_user(request, Role.ADMIN)
        with session_scope() as s:
            current = load_policy(s).model_dump()
            bools = {"sending_enabled", "quiet_hours_enabled", "compliance_validated"}
            section = values.get("section", "policy")
            for key in Policy.model_fields:
                if key in ("compliance_validated", "compliance_note") and section != "compliance":
                    continue
                if section == "compliance" and key not in ("compliance_validated", "compliance_note"):
                    continue
                if key in bools:
                    current[key] = values.get(key) == "on"
                elif key == "retry_delays_minutes" and key in values:
                    try:
                        current[key] = [int(x) for x in values[key].replace(" ", "").split(",") if x]
                    except ValueError:
                        current[key] = []
                elif key in values:
                    current[key] = values[key]
            try:
                policy = Policy.model_validate(current)
            except ValidationError as exc:
                flash(request, "Paramètres refusés : " + "; ".join(e["msg"] for e in exc.errors()), "err")
                return back("/settings#politique")
            save_policy(s, policy, user.login)
            record(s, user.login, "policy_updated", "Politique de relance modifiée." if section != "compliance"
                   else f"Validation de conformité {'enregistrée' if policy.compliance_validated else 'retirée'}.")
        flash(request, "Paramètres enregistrés.")
        return back("/settings#politique" if section != "compliance" else "/settings#conformite")

    @app.get("/settings/templates/{slot_id}", response_class=HTMLResponse)
    def template_page(request: Request, slot_id: int, version: int | None = None, appointment: int | None = None):
        user = require(Role.SUPERVISOR)(request)
        with session_scope() as s:
            slot = s.get(TemplateSlot, slot_id)
            if slot is None:
                raise HTTPException(404, "emplacement inconnu")
            policy = load_policy(s)
            versions = list(slot.versions)
            shown = next((v for v in versions if v.id == version), None) or (slot.active_version or (versions[-1] if versions else None))
            usage = {v.id: template_admin.usage_count(s, v.id) for v in versions}
            preview = None
            if shown:
                ctx = sample_context(service=slot.service)
                appt_label = "données d'exemple"
                if appointment:
                    a = s.get(Appointment, appointment)
                    if a and a.service == slot.service:
                        ctx, appt_label = context_for(a), f"rendez-vous #{a.id}"
                r = render(shown.body, ctx)
                preview = {"text": r.text, "missing": r.missing, "info": r.info, "errors": validate(shown.body, policy.max_segments),
                           "label": appt_label}
            candidates = s.scalars(select(Appointment).where(Appointment.service == slot.service, Appointment.appointment_at >= c.now())
                                   .order_by(Appointment.appointment_at).limit(20)).all()
            label = template_admin.slot_label(slot)
            _ = slot.active_version
        return render_page(request, "template.html", user, slot=slot, label=label, versions=versions, shown=shown, usage=usage,
                           preview=preview, candidates=candidates, max_segments=policy.max_segments)

    @app.post("/settings/templates/{slot_id}")
    async def template_save(request: Request, slot_id: int):
        user, values = await form_user(request, Role.ADMIN)
        with session_scope() as s:
            slot = s.get(TemplateSlot, slot_id)
            if slot is None:
                raise HTTPException(404, "emplacement inconnu")
            try:
                v = template_admin.save_version(s, slot, values.get("body", "")[:2000], actor=user.login)
                vid = v.id
            except template_admin.TemplateError as exc:
                flash(request, str(exc), "err")
                return back(f"/settings/templates/{slot_id}")
        flash(request, "Version enregistrée (non active). Vérifiez l'aperçu puis activez-la.", "warn")
        return back(f"/settings/templates/{slot_id}?version={vid}")

    @app.post("/settings/templates/{slot_id}/activate/{version_id}")
    async def template_activate(request: Request, slot_id: int, version_id: int):
        user, values = await form_user(request, Role.ADMIN)
        if values.get("acknowledge") != "on":
            flash(request, "Cochez la case confirmant la relecture de l'aperçu.", "err")
            return back(f"/settings/templates/{slot_id}?version={version_id}")
        with session_scope() as s:
            slot, version = s.get(TemplateSlot, slot_id), s.get(TemplateVersion, version_id)
            if slot is None or version is None:
                raise HTTPException(404, "version inconnue")
            try:
                template_admin.activate(s, slot, version, actor=user.login, policy=load_policy(s))
                flash(request, f"Version {version.version} activée.")
            except template_admin.TemplateError as exc:
                flash(request, "Activation refusée : " + str(exc), "err")
        return back(f"/settings/templates/{slot_id}?version={version_id}")

    @app.post("/settings/templates/{slot_id}/deactivate")
    async def template_deactivate(request: Request, slot_id: int):
        user, _ = await form_user(request, Role.ADMIN)
        with session_scope() as s:
            slot = s.get(TemplateSlot, slot_id)
            if slot is None:
                raise HTTPException(404, "emplacement inconnu")
            template_admin.deactivate(s, slot, actor=user.login)
        flash(request, "Template désactivé : les envois correspondants sont bloqués.", "warn")
        return back(f"/settings/templates/{slot_id}")

    # ------------------------------------------------------------------ opt-outs

    @app.get("/optouts", response_class=HTMLResponse)
    def optouts(request: Request):
        user = require(Role.ADVISOR)(request)
        with session_scope() as s:
            rows = s.scalars(select(BlockedNumber).order_by(BlockedNumber.created_at.desc())).all()
        return render_page(request, "optouts.html", user, rows=rows)

    @app.post("/optouts")
    async def optout_add(request: Request):
        user, values = await form_user(request, Role.ADVISOR)
        phone = check_mobile(values.get("phone", ""))
        target = _safe_next(values.get("next"), "/optouts")
        if not phone.e164:
            flash(request, phone.error or "Numéro invalide.", "err")
            return back(target)
        with session_scope() as s:
            if not s.scalar(select(BlockedNumber.id).where(BlockedNumber.phone_e164 == phone.e164)):
                s.add(BlockedNumber(phone_e164=phone.e164, reason=(values.get("reason") or "Demande de désinscription")[:255],
                                    source=values.get("source") if values.get("source") in ("opt_out", "manual") else "opt_out",
                                    created_by=user.login))
                record(s, user.login, "optout_added", "Numéro ajouté à la liste d'opposition.")
        flash(request, "Numéro ajouté à la liste d'opposition : plus aucun SMS ne lui sera envoyé.")
        return back(target)

    @app.post("/optouts/{row_id}/delete")
    async def optout_delete(request: Request, row_id: int):
        user, _ = await form_user(request, Role.ADMIN)
        with session_scope() as s:
            row = s.get(BlockedNumber, row_id)
            if row:
                s.delete(row)
                record(s, user.login, "optout_removed", "Numéro retiré de la liste d'opposition.")
        flash(request, "Numéro retiré de la liste d'opposition.", "warn")
        return back("/optouts")

    # ------------------------------------------------------------------ audit / maintenance

    @app.get("/audit", response_class=HTMLResponse)
    def audit_page(request: Request, page: int = 1):
        user = require(Role.ADMIN)(request)
        page = max(page, 1)
        with session_scope() as s:
            rows = s.scalars(select(Event).order_by(Event.id.desc()).offset((page - 1) * 100).limit(100)).all()
        return render_page(request, "audit.html", user, rows=rows, page=page)

    @app.post("/admin/purge")
    async def admin_purge(request: Request):
        user, _ = await form_user(request, Role.ADMIN)
        from ..retention import purge_expired

        out = purge_expired(c.now())
        flash(request, f"Purge effectuée : {out['appointments']} rendez-vous et {out['import_batches']} fichiers d'import supprimés.")
        return back("/settings#conservation")

    # ------------------------------------------------------------------ provider webhook

    @app.post("/webhooks/sms/{provider_name}/status")
    async def delivery_status(request: Request, provider_name: str):
        if provider_name != c.provider.name or c.provider.simulated:
            raise HTTPException(404, "unknown provider")
        form = await request.form()
        params = {k: str(v) for k, v in form.items()}
        url = (settings.public_base_url.rstrip("/") + request.url.path) if settings.public_base_url else str(request.url)
        try:
            upd = c.provider.parse_status_callback(url, params, {k.lower(): v for k, v in request.headers.items()})
        except PermissionError:
            raise HTTPException(403, "invalid signature")
        if upd is None:
            return Response(status_code=204)
        with session_scope() as s:
            job = s.scalar(select(SmsJob).where(SmsJob.provider_message_id == upd.provider_message_id))
            if job:
                job.delivery_status = upd.status
                job.delivery_updated_at = c.now()
                if upd.error_code:
                    job.error_code = upd.error_code
                if upd.status in ("undelivered", "failed"):
                    record(s, "fournisseur", "delivery_failed", f"{Step.LABELS[job.step]} non remis par l'opérateur (code {upd.error_code or '?'}).",
                           appointment_id=job.appointment_id, job_id=job.id)
        return Response(status_code=204)

    return app


def _config_issues(s: Session, c: Container) -> list[str]:
    """What still blocks real sending — shown on the dashboard and the settings page."""
    issues = []
    policy = load_policy(s)
    if c.provider.simulated:
        issues.append("Mode SIMULATION : aucun SMS réel n'est envoyé (fournisseur non configuré).")
    elif c.provider.name == "disabled":
        issues.append("Aucun fournisseur SMS configuré : tous les envois sont bloqués.")
    elif not policy.compliance_validated:
        issues.append("Validation de conformité non enregistrée : les envois réels sont bloqués.")
    if not policy.sending_enabled:
        issues.append("Envois désactivés par un administrateur.")
    for sc in s.scalars(select(ServiceConfig)).all():
        if not sc.sender_id:
            issues.append(f"Numéro d'expédition {Service.LABELS[sc.service]} non configuré.")
        if not sc.enabled:
            issues.append(f"Envois {Service.LABELS[sc.service]} désactivés.")
    missing = [f"{Service.LABELS[sl.service]} — {Step.LABELS[sl.step]}" for sl in s.scalars(select(TemplateSlot)).all() if sl.active_version_id is None]
    if missing:
        issues.append("Template non configuré : " + ", ".join(missing) + ".")
    return issues
