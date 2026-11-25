"""Interface locale (127.0.0.1 uniquement), ouverte avec le lien à usage unique affiché au lancement."""

from __future__ import annotations

import hmac
from pathlib import Path

from fastapi import Body, FastAPI
from fastapi.encoders import jsonable_encoder
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from ..parcours import Assistant

STATIC = Path(__file__).parent / "static"
COOKIE = "am_session"


def create_app(a: Assistant, token: str) -> FastAPI:
    app = FastAPI(title="Assistant Movers", docs_url=None, redoc_url=None, openapi_url=None)
    app.mount("/static", StaticFiles(directory=STATIC), name="static")

    @app.middleware("http")
    async def garde(request, call_next):
        path = request.url.path
        if path == "/" and request.query_params.get("token"):
            if not hmac.compare_digest(request.query_params["token"], token):
                return JSONResponse({"detail": "Lien invalide."}, status_code=403)
            r = RedirectResponse("/", status_code=303)
            r.set_cookie(COOKIE, token, httponly=True, samesite="strict")
            return r
        if path.startswith("/static/"):
            return await call_next(request)
        if not hmac.compare_digest(request.cookies.get(COOKIE, ""), token):
            return JSONResponse({"detail": "Ouvrez le lien affiché au lancement de l'assistant."}, status_code=401)
        if request.method == "POST" and request.headers.get("x-requested-with") != "assistant-movers":
            return JSONResponse({"detail": "Requête refusée."}, status_code=403)
        r = await call_next(request)
        r.headers["Cache-Control"] = "no-store"
        return r

    def etat():
        return JSONResponse(jsonable_encoder(a.etat()))

    @app.get("/")
    def index():
        return FileResponse(STATIC / "index.html")

    @app.get("/api/etat")
    def get_etat():
        return etat()

    @app.post("/api/compte")
    def compte(b: dict = Body(...)):
        a.ouvrir_compte(str(b.get("numero", "")))
        return etat()

    @app.post("/api/avertissement")
    def avertissement():
        a.accepter_avertissement()
        return etat()

    @app.post("/api/adresse")
    def adresse(b: dict = Body(...)):
        a.saisir_adresse(b.get("rue", ""), b.get("cp", ""), b.get("ville", ""), b.get("date", ""),
                         b.get("installation_id", ""), b.get("contrat_id", ""),
                         {k: str(v) for k, v in (b.get("infos") or {}).items()})
        return etat()

    @app.post("/api/case")
    def case():
        a.creer_case()
        return etat()

    @app.post("/api/case/reprendre")
    def case_reprendre():
        a.reprendre_wo()
        return etat()

    @app.post("/api/wo")
    def wo(b: dict = Body(...)):
        opts = {str(k): int(v) for k, v in (b.get("options") or {}).items() if str(v).isdigit()}
        a.completer_wo(b.get("description", ""), list(b.get("packs", [])), bool(b.get("produits_verifies")), opts)
        return etat()

    @app.post("/api/creneaux")
    def creneaux():
        a.recharger_creneaux()
        return etat()

    @app.post("/api/reserver")
    def reserver(b: dict = Body(...)):
        a.reserver(str(b.get("creneau_id", "")))
        return etat()

    @app.post("/api/verifier")
    def verifier():
        a.verifier_booking()
        return etat()

    @app.post("/api/nocap")
    def nocap(b: dict = Body(...)):
        return {"message": a.message_no_cap(str(b.get("dispos", "")))}

    @app.post("/api/sms")
    def sms(b: dict = Body(...)):
        a.envoyer_sms(str(b.get("texte", "")), bool(b.get("forcer")), str(b.get("mobile", "")))
        return etat()

    @app.post("/api/email/preparer")
    def email_preparer(b: dict = Body(...)):
        a.preparer_email({k: str(v) for k, v in (b or {}).items()})
        return etat()

    @app.post("/api/email/envoyer")
    def email_envoyer():
        a.envoyer_email()
        return etat()

    @app.post("/api/mode")
    def mode(b: dict = Body(...)):
        a.changer_mode(str(b.get("mode", "")))
        return etat()

    @app.post("/api/nouveau")
    def nouveau():
        a.nouveau()
        return etat()

    return app
