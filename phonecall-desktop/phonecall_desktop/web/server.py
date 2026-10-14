"""Local web server for the interface (shown in a WebView2 window).

Security of a localhost server:
- bound to 127.0.0.1 on a random port;
- a random per-launch token: the window opens ``/?t=<token>``, which sets an HttpOnly,
  SameSite=Strict cookie; every API call must carry the cookie AND the ``X-PCD-Token`` header;
- the Host header must be 127.0.0.1:<port> (anti DNS-rebinding), the Origin must be ours;
- strict CSP, no external resources.
"""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
import threading
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .. import secrets_store
from ..errors import AppError, ErrorCode
from ..session import SessionController, StartRequest, State

log = logging.getLogger(__name__)
STATIC = Path(__file__).parent / "static"
COOKIE = "pcd_session"


class StartBody(BaseModel):
    use_system: bool = True
    use_mic: bool = True
    system_device: str | None = None
    mic_device: str | None = None
    consent: bool = False
    call_direction: str | None = Field(default=None, pattern=r"^(entrant|sortant)$")
    call_type: str | None = Field(default=None, pattern=r"^(movers|frontline|autre)$")


class NoteBody(BaseModel):
    text: str = Field(max_length=20_000)


class CopilotAnswerBody(BaseModel):
    text: str = Field(min_length=1, max_length=50_000)


class AIKeyBody(BaseModel):
    key: str = Field(max_length=2_000)
    check: bool = True


class Hub:
    """Bridges controller events (any thread) to the WebSocket clients (asyncio loop)."""

    def __init__(self):
        self.loop: asyncio.AbstractEventLoop | None = None
        self.clients: set[WebSocket] = set()
        self.last_client_seen = time.monotonic()

    def emit(self, kind: str, payload: dict) -> None:
        loop = self.loop
        if loop is None or not self.clients:
            return
        message = json.dumps({"type": kind, "data": payload}, ensure_ascii=False, default=str)
        asyncio.run_coroutine_threadsafe(self._broadcast(message), loop)

    async def _broadcast(self, message: str) -> None:
        for ws in list(self.clients):
            try:
                await ws.send_text(message)
            except Exception:  # noqa: BLE001
                self.clients.discard(ws)


def create_app(controller: SessionController, token: str, port_getter, hub: Hub) -> FastAPI:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.mount("/static", StaticFiles(directory=STATIC), name="static")

    def allowed_hosts() -> set[str]:
        port = port_getter()
        return {f"127.0.0.1:{port}", f"localhost:{port}"}

    @app.middleware("http")
    async def guard(request: Request, call_next):
        if request.headers.get("host") not in allowed_hosts():
            return Response("forbidden host", status_code=403)
        origin = request.headers.get("origin")
        if origin and origin.removeprefix("http://") not in allowed_hosts():
            return Response("forbidden origin", status_code=403)
        path = request.url.path
        if path.startswith("/api/"):
            cookie_ok = hmac.compare_digest(request.cookies.get(COOKIE, ""), token)
            header_ok = hmac.compare_digest(request.headers.get("x-pcd-token", ""), token)
            if not (cookie_ok and header_ok):
                return Response("unauthorized", status_code=401)
        response = await call_next(request)
        port = port_getter()
        response.headers["Content-Security-Policy"] = (
            f"default-src 'self'; connect-src 'self' ws://127.0.0.1:{port} ws://localhost:{port}; "
            "img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; form-action 'none'"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError):
        status = 409 if exc.code == ErrorCode.INVALID_STATE else 400
        return JSONResponse({"error": exc.to_dict()}, status_code=status)

    @app.get("/")
    def index(request: Request, t: str | None = None):
        if t is not None:
            if not hmac.compare_digest(t, token):
                raise HTTPException(401)
            resp = RedirectResponse("/", status_code=303)
            resp.set_cookie(COOKIE, token, httponly=True, samesite="strict", path="/")
            return resp
        if not hmac.compare_digest(request.cookies.get(COOKIE, ""), token):
            return HTMLResponse("<p>Session expirée : relancez l'application.</p>", status_code=401)
        html = (STATIC / "index.html").read_text(encoding="utf-8").replace("__TOKEN__", token)
        return HTMLResponse(html)

    # ------------------------------------------------------------------ API

    @app.get("/api/state")
    def state():
        return controller.snapshot()

    @app.get("/api/devices")
    def devices(refresh: bool = False):
        if controller.state == State.CAPTURING:
            refresh = False  # never re-initialise the audio layer under a running capture
        try:
            items = controller.backend.list_devices(refresh=refresh)
        except AppError as exc:
            return {"devices": [], "error": exc.to_dict()}
        return {"devices": [d.to_dict() for d in items], "backend": controller.backend.name}

    @app.post("/api/start")
    def start(body: StartBody):
        return controller.start(StartRequest(**body.model_dump()))

    @app.post("/api/stop")
    def stop():
        return controller.stop()

    @app.post("/api/regenerate")
    def regenerate():
        controller.regenerate()
        return {"ok": True}

    @app.post("/api/note")
    def edit_note(body: NoteBody):
        controller.update_note(body.text)
        return {"ok": True}

    @app.post("/api/copied")
    def copied():
        controller.mark_copied()
        return {"ok": True}

    @app.post("/api/new")
    def new():
        controller.new_conversation()
        return controller.snapshot()

    # Microsoft 365 Copilot Chat: prompt copied by the page, Copilot opened in the default browser,
    # answer pasted back by the advisor. The transcript never goes into a URL.

    def copilot_on():
        if not controller.settings.copilot_enabled:
            raise AppError(ErrorCode.INVALID_STATE, "Copilot est désactivé (PCD_COPILOT_ENABLED)")

    @app.post("/api/copilot/prompt")
    def copilot_prompt():
        copilot_on()
        return controller.copilot_prompt()

    @app.post("/api/copilot/open")
    def copilot_open():
        copilot_on()
        url = controller.settings.copilot_url
        if not url.startswith("https://"):
            raise AppError(ErrorCode.CONFIG, "PCD_COPILOT_URL doit commencer par https://")
        import webbrowser

        opened = webbrowser.open(url, new=2)
        return {"opened": bool(opened), "url": url}

    @app.post("/api/copilot/answer")
    def copilot_answer(body: CopilotAnswerBody):
        copilot_on()
        controller.apply_copilot_answer(body.text)
        return controller.snapshot()

    # The AI key is write-only: the interface can save, check or delete it, never read it back.

    def direct_client():
        client = controller.note_client
        if getattr(client, "name", None) != "anthropic":
            raise AppError(ErrorCode.INVALID_STATE, "le mode « clé API dans l'application » n'est pas activé")
        return client

    def ai_key_status() -> dict:
        settings = controller.settings
        return {"mode": settings.notes_client, "model": settings.anthropic_model,
                "configured": settings.notes_client == "anthropic" and bool(secrets_store.get_ai_key(settings))}

    @app.get("/api/ai-key")
    def ai_key_get():
        return ai_key_status()

    @app.put("/api/ai-key")
    def ai_key_put(body: AIKeyBody):
        client = direct_client()
        from ..notes.direct import validate_key_format

        key = validate_key_format(body.key)
        if body.check:
            client.check_key(key)
        secrets_store.set_ai_key(key)
        log.info("AI key saved in the credential vault")
        return ai_key_status()

    @app.delete("/api/ai-key")
    def ai_key_delete():
        direct_client()
        secrets_store.delete_ai_key()
        log.info("AI key deleted from the credential vault")
        return ai_key_status()

    # ------------------------------------------------------------------ calls of the session (queue)

    @app.get("/api/transcript/text")
    def transcript_text(call: str | None = None):
        """Transcription as plain text (live partials included), to copy into Copilot."""
        text = controller.transcript_text(call)
        return {"text": text, "chars": len(text)}

    @app.get("/api/calls")
    def calls():
        return {"calls": controller.calls_summary(), "current_id": controller.current.id}

    @app.get("/api/calls/{call_id}")
    def call_details(call_id: str):
        return controller.call_details(call_id)

    @app.post("/api/calls/{call_id}/select")
    def call_select(call_id: str):
        return controller.select(call_id)

    @app.delete("/api/calls/{call_id}")
    def call_remove(call_id: str):
        controller.remove(call_id)
        return {"ok": True}

    @app.get("/api/history")
    def history_list():
        if controller.history is None:
            return {"enabled": False, "items": []}
        return {"enabled": True, "items": controller.history.list()}

    @app.get("/api/history/{sid}")
    def history_get(sid: str):
        if controller.history is None or (item := controller.history.get(sid)) is None:
            raise HTTPException(404)
        return item

    @app.delete("/api/history/{sid}")
    def history_delete(sid: str):
        if controller.history is None:
            raise HTTPException(404)
        controller.history.delete(None if sid == "all" else sid)
        return {"ok": True}

    # ------------------------------------------------------------------ live events

    @app.websocket("/ws")
    async def ws(websocket: WebSocket):
        origin = websocket.headers.get("origin", "")
        if (websocket.headers.get("host") not in allowed_hosts()
                or origin.removeprefix("http://") not in allowed_hosts()
                or not hmac.compare_digest(websocket.cookies.get(COOKIE, ""), token)
                or not hmac.compare_digest(websocket.query_params.get("t", ""), token)):
            await websocket.close(code=1008)
            return
        await websocket.accept()
        hub.loop = asyncio.get_running_loop()
        hub.clients.add(websocket)
        await websocket.send_text(json.dumps({"type": "snapshot", "data": controller.snapshot()}, default=str))
        try:
            while True:
                await websocket.receive_text()  # keep-alive pings from the page
                hub.last_client_seen = time.monotonic()
        except WebSocketDisconnect:
            pass
        finally:
            hub.clients.discard(websocket)
            hub.last_client_seen = time.monotonic()

    return app


def start_ui_watchdog(controller: SessionController, hub: Hub, stop_after_s: float) -> threading.Thread:
    """Fail-safe: if the interface is closed or frozen during a capture, stop listening."""

    def run():
        while True:
            time.sleep(1.0)
            if controller.state == State.CAPTURING and not hub.clients and time.monotonic() - hub.last_client_seen > stop_after_s:
                log.warning("interface disconnected during capture: stopping")
                controller._notice("warning", "Interface fermée pendant la capture : capture arrêtée.")
                try:
                    controller.stop()
                except AppError:
                    pass

    t = threading.Thread(target=run, daemon=True, name="ui-watchdog")
    t.start()
    return t
