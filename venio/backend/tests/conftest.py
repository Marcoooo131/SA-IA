"""Tests sur un vrai PostgreSQL (RLS, contraintes d'exclusion et concurrence ne se simulent pas).

Variable requise : VENIO_TEST_ADMIN_URL, URL superutilisateur d'un serveur PostgreSQL 16
(ex. postgresql://postgres@localhost:5432/postgres). Une base jetable est créée puis supprimée.
Voir scripts/test-db.sh pour démarrer un serveur local.
"""
import os
import secrets
import tempfile
from datetime import date, timedelta
from urllib.parse import urlparse, urlunparse

import asyncpg
import pytest

ADMIN_URL = os.environ.get("VENIO_TEST_ADMIN_URL")
APP_ROLE, APP_PASSWORD = "venio_test_app", "venio_test_app_pw"


def _with_db(url: str, db: str, user: str | None = None, password: str | None = None) -> str:
    p = urlparse(url)
    netloc = p.netloc
    if user:
        host = netloc.split("@")[-1]
        netloc = f"{user}:{password}@{host}"
    return urlunparse(p._replace(path=f"/{db}", netloc=netloc))


@pytest.fixture(scope="session", autouse=True)
async def database():
    if not ADMIN_URL:
        pytest.exit("VENIO_TEST_ADMIN_URL non défini (voir tests/conftest.py)", returncode=2)
    db = f"venio_test_{secrets.token_hex(4)}"
    admin = await asyncpg.connect(ADMIN_URL)
    await admin.execute(f'CREATE DATABASE "{db}"')
    exists = await admin.fetchval("SELECT 1 FROM pg_roles WHERE rolname = $1", APP_ROLE)
    if not exists:
        await admin.execute(f"CREATE ROLE {APP_ROLE} LOGIN PASSWORD '{APP_PASSWORD}' NOBYPASSRLS")
    await admin.close()

    from venio.migrate import migrate
    admin_db_url = _with_db(ADMIN_URL, db)
    await migrate(admin_db_url)
    conn = await asyncpg.connect(admin_db_url)
    await conn.execute(f"GRANT venio_app TO {APP_ROLE}")
    await conn.close()

    app_url = _with_db(ADMIN_URL, db, APP_ROLE, APP_PASSWORD).replace("postgresql://", "postgresql+asyncpg://")
    os.environ["VENIO_DATABASE_URL"] = app_url
    os.environ["VENIO_ENVIRONMENT"] = "test"
    os.environ["VENIO_STORAGE_DIR"] = tempfile.mkdtemp(prefix="venio-files-")
    from venio.config import get_settings
    get_settings.cache_clear()
    yield {"admin_url": admin_db_url, "app_url": app_url}

    from venio.db import dispose_engine
    await dispose_engine()
    admin = await asyncpg.connect(ADMIN_URL)
    await admin.execute(f'DROP DATABASE "{db}" WITH (FORCE)')
    await admin.close()


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    from venio import ratelimit
    ratelimit.reset()


@pytest.fixture
async def client_factory():
    import httpx

    from venio.main import create_app

    app = create_app()
    clients = []

    def make():
        c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
        clients.append(c)
        return c

    yield make
    for c in clients:
        await c.aclose()


async def signup(client, vertical: str = "generique", company: str | None = None) -> dict:
    company = company or f"Entreprise {secrets.token_hex(3)}"
    r = await client.post("/api/auth/signup", json={
        "email": f"{secrets.token_hex(5)}@venio-tests.fr", "password": "motdepasse-solide",
        "full_name": "Camille Martin", "company_name": company, "vertical": vertical, "accept_terms": True,
    })
    assert r.status_code == 201, r.text
    return r.json()


def next_open_day(min_days_ahead: int = 3) -> date:
    from venio.scheduling.holidays import is_holiday
    d = date.today() + timedelta(days=min_days_ahead)
    while d.isoweekday() > 5 or is_holiday("FR", d):
        d += timedelta(days=1)
    return d


GENERIC_ANSWERS = [
    ("besoin", "premier_rdv"),
    ("description", "Je souhaite un premier échange."),
    ("delai", "moins_3_mois"),
    ("photos", None),
    ("precisions", None),
]


async def qualified_session(client, slug: str, answers=GENERIC_ANSWERS) -> dict:
    r = await client.post(f"/api/public/{slug}/sessions", json={"source": {"utm_source": "test"}})
    assert r.status_code == 201, r.text
    s = r.json()
    headers = {"X-Resume-Token": s["resume_token"]}
    for step, value in answers:
        r = await client.put(f"/api/public/{slug}/sessions/{s['session_id']}/answers",
                             json={"step": step, "value": value}, headers=headers)
        assert r.status_code == 200, r.text
    assert r.json()["state"]["qualification_done"] is True
    return {"id": s["session_id"], "headers": headers}
