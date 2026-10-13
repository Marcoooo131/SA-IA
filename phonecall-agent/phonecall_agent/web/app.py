"""FastAPI application: Twilio webhook, supervision / validation UI, metrics."""

from __future__ import annotations

import difflib
import json
import logging
import secrets
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import select, text
from starlette.middleware.sessions import SessionMiddleware

from ..audit import audit
from ..config import Environment
from ..container import Container, get_container
from ..crm_service import crm_enabled
from ..db import init_db, session_scope
from ..errors import PermanentError
from ..intake import IntakeResult, handle_recording_event
from ..metrics import compute_metrics, prometheus_text
from ..models import AuditLog, Call, CallStatus, Report, ReportStatus, Review
from ..pipeline import regenerate, report_structured
from ..retention import delete_call_data, purge_expired
from ..transcription.base import TranscriptResult
from ..twilio.webhook import InvalidPayload, parse_recording_status, verify_signature
from .auth import Authenticator, Role, User, check_csrf, csrf_token, current_user, require

log = logging.getLogger(__name__)
HERE = Path(__file__).parent

STATUS_LABELS = {
    "received": "Reçu", "downloading": "Téléchargement", "downloaded": "Audio récupéré",
    "transcribed": "Transcrit", "needs_review": "À valider", "ready": "Prêt (contrôles OK)",
    "approved": "Validé – à saisir", "crm_pending": "Envoi CRM en cours", "crm_confirmed": "Enregistré dans le CRM",
    "copied_manually": "Saisi manuellement", "rejected": "Rejeté", "no_content": "Sans contenu exploitable",
    "recording_absent": "Enregistrement indisponible", "failed": "Échec",
}
SECTION_LABELS = {
    "customer_statements": "Propos du client",
    "advisor_information": "Informations du conseiller",
    "actions_done": "Actions réalisées",
    "actions_todo": "Actions restant à faire",
}


def create_app(container: Container | None = None) -> FastAPI:
    c = container or get_container()
    settings = c.settings
    init_db()

    app = FastAPI(title="Phone Call Agent", docs_url=None, redoc_url=None, openapi_url=None)
    session_secret = settings.session_secret.get_secret_value()
    if not session_secret:
        if settings.environment not in (Environment.DEV, Environment.TEST):
            raise RuntimeError("PCA_SESSION_SECRET is required")
        session_secret = secrets.token_urlsafe(32)
    app.add_middleware(
        SessionMiddleware,
        secret_key=session_secret,
        session_cookie="pca_session",
        max_age=8 * 3600,
        same_site="strict",
        https_only=settings.cookie_secure,
    )
    app.mount("/static", StaticFiles(directory=HERE / "static"), name="static")
    templates = Jinja2Templates(directory=HERE / "templates")
    templates.env.globals.update(
        STATUS_LABELS=STATUS_LABELS, SECTION_LABELS=SECTION_LABELS, Role=Role, MAX_CHARS=c.business.report.max_chars
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
        if exc.status_code == 401 and request.method == "GET" and not request.url.path.startswith(("/twilio", "/metrics")):
            return RedirectResponse("/login", status_code=303)
        return PlainTextResponse(str(exc.detail), status_code=exc.status_code)

    def render(request: Request, name: str, user: User | None, **ctx) -> HTMLResponse:
        return templates.TemplateResponse(
            request, name, {"user": user, "csrf": csrf_token(request), "settings": settings, **ctx}
        )

    # ------------------------------------------------------------------ health

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    @app.get("/readyz")
    def readyz():
        with session_scope() as s:
            s.execute(text("SELECT 1"))
        return {"status": "ready", "crm": c.crm.health_check().available}

    # ------------------------------------------------------------------ Twilio webhook

    @app.post("/twilio/recording-status")
    async def twilio_recording_status(request: Request, background: BackgroundTasks):
        form = await request.form()
        params = {k: str(v) for k, v in form.items()}
        if settings.twilio_validate_signature:
            url = settings.public_base_url.rstrip("/") + request.url.path
            if request.url.query:
                url += "?" + request.url.query
            if not verify_signature(
                settings.twilio_auth_token.get_secret_value(), url, params, request.headers.get("X-Twilio-Signature")
            ):
                log.warning("rejected webhook: invalid signature")
                return Response(status_code=403)
        try:
            event = parse_recording_status(params)
        except InvalidPayload as exc:
            log.warning("rejected webhook: %s", exc)
            return Response(status_code=400)
        if event.account_sid not in settings.allowed_account_sids:
            log.warning("rejected webhook: account not allowed")
            return Response(status_code=403)
        result, call_id = handle_recording_event(event)
        if result == IntakeResult.QUEUED and call_id:
            background.add_task(c.queue.enqueue_process, call_id)
        return Response(status_code=204)

    # ------------------------------------------------------------------ authentication

    @app.get("/login", response_class=HTMLResponse)
    def login_form(request: Request):
        return render(request, "login.html", None, error=None)

    @app.post("/login")
    def login(request: Request, login: str = Form(...), password: str = Form(...), csrf: str = Form("")):
        check_csrf(request, csrf)
        user = auth.authenticate(login, password)
        with session_scope() as s:
            audit(s, login, "login_success" if user else "login_failure")
        if not user:
            return render(request, "login.html", None, error="Identifiants invalides ou compte temporairement verrouillé.")
        request.session.clear()  # new session (and new CSRF token) after authentication
        request.session["user"] = {"login": user.login, "role": int(user.role)}
        return RedirectResponse("/calls", status_code=303)

    @app.post("/logout")
    def logout(request: Request, csrf: str = Form("")):
        check_csrf(request, csrf)
        request.session.clear()
        return RedirectResponse("/login", status_code=303)

    # ------------------------------------------------------------------ calls

    @app.get("/")
    def index(request: Request):
        return RedirectResponse("/calls" if current_user(request) else "/login", status_code=303)

    @app.get("/calls", response_class=HTMLResponse)
    def calls(request: Request, status: str | None = None, user: User = Depends(require(Role.ADVISOR))):
        with session_scope() as s:
            q = select(Call).order_by(Call.received_at.desc()).limit(200)
            if status:
                try:
                    q = q.where(Call.status == CallStatus(status))
                except ValueError as exc:
                    raise HTTPException(400, "unknown status") from exc
            rows = list(s.scalars(q))
            items = [
                {
                    "id": r.id, "status": r.status.value, "category": r.category, "received_at": r.received_at,
                    "score": r.latest_report.quality_score if r.latest_report else None,
                    "duration": r.recording_duration, "detail": r.status_detail,
                }
                for r in rows
            ]
        return render(request, "calls.html", user, items=items, status=status, crm=c.crm.health_check())

    def _load_call(s, call_id: str) -> Call:
        call = s.get(Call, call_id)
        if call is None:
            raise HTTPException(404, "call not found")
        return call

    @app.get("/calls/{call_id}", response_class=HTMLResponse)
    def call_detail(request: Request, call_id: str, user: User = Depends(require(Role.ADVISOR))):
        with session_scope() as s:
            call = _load_call(s, call_id)
            report = call.latest_report
            transcript = None
            if call.transcript and call.transcript.segments_json:
                transcript = TranscriptResult.from_json(call.transcript.segments_json)
            audit(s, user.login, "view_call", call.id)
            ctx = {
                "call": call,
                "report": report,
                "structured": report_structured(report) if report else None,
                "transcript": transcript,
                "errors": list(call.errors)[-10:],
                "crm_writes": list(call.crm_writes),
                "reviews": [rv for r in call.reports for rv in r.reviews],
                "crm_enabled": crm_enabled(c),
                "crm_health": c.crm.health_check(),
            }
            return render(request, "call_detail.html", user, **ctx)

    @app.post("/calls/{call_id}/approve")
    def approve(
        request: Request,
        background: BackgroundTasks,
        call_id: str,
        text_: str = Form(..., alias="text"),
        mark_copied: str = Form(""),
        ack_blocking: str = Form(""),
        csrf: str = Form(""),
        user: User = Depends(require(Role.ADVISOR)),
    ):
        check_csrf(request, csrf)
        text_ = text_.replace("\r\n", "\n").strip()
        if not text_:
            raise HTTPException(400, "empty text")
        if len(text_) > c.business.report.max_chars:
            raise HTTPException(400, "text too long")
        push = False
        with session_scope() as s:
            call = _load_call(s, call_id)
            report = call.latest_report
            if report is None or call.status not in (CallStatus.NEEDS_REVIEW, CallStatus.READY):
                raise HTTPException(409, "nothing to approve")
            edited = text_ != report.text.strip()
            blocking = [f for f in report.quality_flags or [] if f.get("severity") == "blocking"]
            if blocking and not ack_blocking:
                raise HTTPException(400, "blocking quality flags must be checked and acknowledged")
            ratio = 1 - difflib.SequenceMatcher(None, report.text, text_).ratio() if edited else 0.0
            report.reviews.append(
                Review(reviewer=user.login, action="edit_approve" if edited else "approve", edited=edited, edit_ratio=round(ratio, 4))
            )
            if edited:
                report.status = ReportStatus.SUPERSEDED
                final = Report(
                    version=len(call.reports) + 1, generator="human_edit", model=None,
                    prompt_version=report.prompt_version, business_config_version=report.business_config_version,
                    text=text_, structured_json=report.structured_json, category=report.category,
                    quality_score=report.quality_score, quality_flags=report.quality_flags, status=ReportStatus.APPROVED,
                )
                call.reports.append(final)
            else:
                report.status = ReportStatus.APPROVED
            if mark_copied:
                call.status = CallStatus.COPIED_MANUALLY
            elif crm_enabled(c):
                call.status = CallStatus.CRM_PENDING
                push = True
            else:
                call.status = CallStatus.APPROVED
            call.status_detail = None
            audit(s, user.login, "approve_report", call.id, edited=edited, copied=bool(mark_copied),
                  acknowledged_blocking=[f["code"] for f in blocking])
        if push:
            background.add_task(c.queue.enqueue_crm_push, call_id)
        return RedirectResponse(f"/calls/{call_id}", status_code=303)

    @app.post("/calls/{call_id}/copied")
    def mark_copied(request: Request, call_id: str, csrf: str = Form(""), user: User = Depends(require(Role.ADVISOR))):
        check_csrf(request, csrf)
        with session_scope() as s:
            call = _load_call(s, call_id)
            if call.status != CallStatus.APPROVED:
                raise HTTPException(409, "report must be approved first")
            call.status = CallStatus.COPIED_MANUALLY
            call.latest_report.reviews.append(Review(reviewer=user.login, action="copy"))
            audit(s, user.login, "mark_copied", call.id)
        return RedirectResponse(f"/calls/{call_id}", status_code=303)

    @app.post("/calls/{call_id}/reject")
    def reject(
        request: Request, call_id: str, comment: str = Form(""), csrf: str = Form(""),
        user: User = Depends(require(Role.SUPERVISOR)),
    ):
        check_csrf(request, csrf)
        with session_scope() as s:
            call = _load_call(s, call_id)
            report = call.latest_report
            if report is None:
                raise HTTPException(409, "no report")
            report.status = ReportStatus.REJECTED
            report.reviews.append(Review(reviewer=user.login, action="reject", comment=comment[:2000] or None))
            call.status = CallStatus.REJECTED
            audit(s, user.login, "reject_report", call.id)
        return RedirectResponse(f"/calls/{call_id}", status_code=303)

    @app.post("/calls/{call_id}/regenerate")
    def regenerate_report(request: Request, call_id: str, csrf: str = Form(""), user: User = Depends(require(Role.SUPERVISOR))):
        check_csrf(request, csrf)
        try:
            regenerate(call_id, c)
        except PermanentError as exc:
            raise HTTPException(409, exc.code) from exc
        with session_scope() as s:
            audit(s, user.login, "regenerate_report", call_id)
        return RedirectResponse(f"/calls/{call_id}", status_code=303)

    @app.post("/calls/{call_id}/crm-retry")
    def crm_retry(request: Request, background: BackgroundTasks, call_id: str, csrf: str = Form(""),
                  user: User = Depends(require(Role.SUPERVISOR))):
        check_csrf(request, csrf)
        if not crm_enabled(c):
            raise HTTPException(409, "CRM integration disabled")
        background.add_task(c.queue.enqueue_crm_push, call_id)
        with session_scope() as s:
            audit(s, user.login, "crm_retry", call_id)
        return RedirectResponse(f"/calls/{call_id}", status_code=303)

    # ------------------------------------------------------------------ metrics

    @app.get("/dashboard", response_class=HTMLResponse)
    def dashboard(request: Request, user: User = Depends(require(Role.SUPERVISOR))):
        with session_scope() as s:
            m = compute_metrics(s)
        return render(request, "dashboard.html", user, m=m)

    @app.get("/metrics")
    def metrics(request: Request):
        token = settings.metrics_token.get_secret_value()
        provided = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        user = current_user(request)
        if not ((token and secrets.compare_digest(token, provided)) or (user and user.role >= Role.SUPERVISOR)):
            return Response(status_code=401)
        with session_scope() as s:
            return PlainTextResponse(prometheus_text(compute_metrics(s)), media_type="text/plain; version=0.0.4")

    # ------------------------------------------------------------------ administration

    @app.get("/admin/audit", response_class=HTMLResponse)
    def audit_log(request: Request, user: User = Depends(require(Role.ADMIN))):
        with session_scope() as s:
            rows = list(s.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(500)))
            entries = [
                {"at": r.created_at, "actor": r.actor, "action": r.action, "target": r.target, "details": json.dumps(r.details, ensure_ascii=False)}
                for r in rows
            ]
        return render(request, "audit.html", user, entries=entries)

    @app.post("/admin/calls/{call_id}/delete")
    def admin_delete(request: Request, call_id: str, confirm: str = Form(""), csrf: str = Form(""),
                     user: User = Depends(require(Role.ADMIN))):
        check_csrf(request, csrf)
        if confirm != "SUPPRIMER":
            raise HTTPException(400, "confirmation required")
        if not delete_call_data(call_id, c, actor=user.login):
            raise HTTPException(404, "call not found")
        return RedirectResponse("/calls", status_code=303)

    @app.post("/admin/purge")
    def admin_purge(request: Request, csrf: str = Form(""), user: User = Depends(require(Role.ADMIN))):
        check_csrf(request, csrf)
        purge_expired(c, actor=user.login)
        return RedirectResponse("/admin/audit", status_code=303)

    return app
