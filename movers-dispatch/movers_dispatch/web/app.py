"""Local dashboard (127.0.0.1 only): counters, one row per mail, mode choice, immediate stop,
approval of supervised proposals. Access with the one-time link printed at launch."""

from __future__ import annotations

import hmac
import threading
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from ..engine import Agent, RunBlocked
from ..models import Mode, Status

STATIC = Path(__file__).parent / "static"
COOKIE = "md_session"
AUTOMATIC_CONFIRMATION = "AUTOMATIQUE"
ITEM_FIELDS = ("queueitem_id", "subject", "account_name", "case_number", "owner_name", "worked_by_name",
               "status", "reason", "mode", "updated_at")


def create_app(agent: Agent, token: str, actor: str = "local") -> FastAPI:
    app = FastAPI(title="Dispatch Movers Emails", docs_url=None, redoc_url=None, openapi_url=None)
    app.mount("/static", StaticFiles(directory=STATIC), name="static")

    def authorized(request: Request) -> bool:
        return hmac.compare_digest(request.cookies.get(COOKIE, ""), token)

    @app.middleware("http")
    async def guard(request: Request, call_next):
        path = request.url.path
        if path == "/" and request.query_params.get("token"):
            if not hmac.compare_digest(request.query_params["token"], token):
                return JSONResponse({"detail": "Lien invalide."}, status_code=403)
            resp = RedirectResponse("/", status_code=303)
            resp.set_cookie(COOKIE, token, httponly=True, samesite="strict")
            return resp
        if path.startswith("/static/"):
            return await call_next(request)
        if not authorized(request):
            return JSONResponse({"detail": "Ouvrir le lien affiché au lancement de l'agent."}, status_code=401)
        # the custom header cannot be sent cross-site without a CORS pre-flight, which is never granted
        if request.method == "POST" and request.headers.get("x-requested-with") != "movers-dispatch":
            return JSONResponse({"detail": "Requête refusée."}, status_code=403)
        resp = await call_next(request)
        resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.get("/")
    def index():
        return FileResponse(STATIC / "index.html")

    @app.get("/api/state")
    def state():
        s = agent.state
        return {
            "state": {"running": s.running, "mode": s.mode, "run_id": s.run_id, "current": s.current,
                      "message": s.message, "problems": s.problems},
            "config": {"default_mode": agent.cfg.default_mode.value, "automatic_allowed": agent.cfg.automatic_allowed,
                       "connection": agent.cfg.connection.kind, "problems": agent.cfg.problems(),
                       "collaborators": [{"key": c.key, "first_name": c.first_name} for c in agent.cfg.collaborators]},
            "counters": agent.journal.counters(),
            # items already correctly filled in (« ignoré ») are counted but not listed
            "items": [{k: i[k] for k in ITEM_FIELDS} for i in agent.journal.items() if i["status"] != Status.SKIPPED.value],
        }

    @app.get("/api/events")
    def events(item: str | None = None):
        return agent.journal.events(item, limit=100)

    @app.post("/api/run")
    def run(payload: dict = Body(...)):
        try:
            mode = Mode(payload.get("mode", Mode.SIMULATION.value))
        except ValueError:
            raise HTTPException(400, "Mode inconnu.")
        confirmed = payload.get("confirmation") == AUTOMATIC_CONFIRMATION
        if mode is Mode.AUTOMATIC and not (agent.cfg.automatic_allowed and confirmed):
            raise HTTPException(409, "Mode Automatique non activé : autorisation dans la configuration et saisie de "
                                     f"« {AUTOMATIC_CONFIRMATION} » requises.")
        if agent.state.running:
            raise HTTPException(409, "Un traitement est déjà en cours.")

        def work():
            try:
                agent.run(mode, actor=actor, confirm_automatic=confirmed)
            except RunBlocked as e:
                agent.state.message = str(e)

        threading.Thread(target=work, name="dispatch-run", daemon=True).start()
        return {"started": mode.value}

    @app.post("/api/stop")
    def stop():
        agent.stop(actor)
        return {"stopping": True}

    @app.post("/api/items/{queueitem_id}/approve")
    def approve(queueitem_id: str):
        try:
            item = agent.approve(queueitem_id, actor)
        except RunBlocked as e:
            raise HTTPException(409, str(e))
        return {k: item[k] for k in ITEM_FIELDS}

    @app.post("/api/items/{queueitem_id}/assign")
    def assign(queueitem_id: str, payload: dict = Body(...)):
        try:
            item = agent.assign_manually(queueitem_id, str(payload.get("collaborator", "")), actor)
        except RunBlocked as e:
            raise HTTPException(409, str(e))
        return {k: item[k] for k in ITEM_FIELDS}

    @app.post("/api/items/{queueitem_id}/reject")
    def reject(queueitem_id: str, payload: dict = Body(default={})):
        try:
            item = agent.reject(queueitem_id, actor, str(payload.get("note", "")))
        except RunBlocked as e:
            raise HTTPException(409, str(e))
        return {k: item[k] for k in ITEM_FIELDS}

    return app
