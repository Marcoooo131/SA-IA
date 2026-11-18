import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import dispose_engine
from .modules import billing, business, identity, missed_calls, public, settings_api
from .modules.notifications import worker_loop

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.environment == "production":
        if settings.secret_key == "dev-only-change-me" or len(settings.secret_key) < 32:
            raise RuntimeError("VENIO_SECRET_KEY doit être défini (32 caractères minimum) en production.")
        if not settings.cookie_secure:
            raise RuntimeError("VENIO_COOKIE_SECURE doit valoir true en production.")
    from .billing.stripe_api import check_key_mode
    check_key_mode(settings.stripe_secret_key, settings.stripe_live_enabled)
    worker = asyncio.create_task(worker_loop()) if settings.run_worker else None
    yield
    if worker:
        worker.cancel()
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Venio API", version="0.1.0", lifespan=lifespan,
                  docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Content-Type", "X-Resume-Token"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        if request.url.path.startswith("/api/") and "cache-control" not in response.headers:
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    async def health() -> dict:
        return {"status": "ok"}

    # Le lien court et le webhook de téléphonie passent avant /api/public/{slug} (même préfixe).
    app.include_router(missed_calls.public_router)
    app.include_router(billing.public_router)
    app.include_router(billing.onboarding_router)
    for module in (identity, public, business, settings_api, missed_calls, billing):
        app.include_router(module.router)
    return app


app = create_app()
