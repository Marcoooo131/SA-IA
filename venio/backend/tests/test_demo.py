"""Démonstration interactive : espace jetable, aucun envoi réel, aucun paiement, suppression automatique."""
import asyncpg
import pytest

from conftest import GENERIC_ANSWERS, next_open_day, signup


@pytest.fixture
def real_providers_configured(monkeypatch):
    """Même avec de vrais fournisseurs configurés et les envois payants autorisés, une démo n'envoie rien."""
    from venio.config import get_settings
    from venio.modules import notifications
    monkeypatch.setenv("VENIO_EMAIL_PROVIDER", "brevo")
    monkeypatch.setenv("VENIO_BREVO_API_KEY", "test")
    monkeypatch.setenv("VENIO_PAID_SENDING_ENABLED", "true")
    get_settings.cache_clear()

    def forbidden(*a, **k):
        raise AssertionError("aucun envoi réel depuis une démonstration")
    monkeypatch.setattr(notifications.httpx, "post", forbidden)
    yield
    get_settings.cache_clear()


async def test_demo_full_scenario_never_sends(client_factory, database, real_providers_configured, monkeypatch):
    from venio.telephony import rules
    monkeypatch.setattr(rules, "in_window", lambda *a: False)   # même en pleine nuit, la démo fonctionne
    visitor = client_factory()
    r = await visitor.post("/api/demo/start")
    assert r.status_code == 201
    slug = r.json()["slug"]
    me = (await visitor.get("/api/auth/me")).json()
    assert me["tenant"]["is_demo"] is True and me["user"]["email"].endswith("@demo.venio.invalid")

    # 1-2. Appel manqué simulé → décision et SMS (simulé) immédiats.
    sim = await visitor.post("/api/missed-calls/simulate", json={"from_number": "06 39 98 12 34"})
    assert sim.status_code == 201
    [call] = (await visitor.get("/api/missed-calls/calls")).json()
    assert call["decision"] == "sent" and call["sms_status"] == "logged" and call["sms_provider"] == "demonstration"
    code = call["sms_body"].split("/c/")[1].split()[0]

    # 3-5. Le prospect ouvre le lien et réserve.
    prospect = client_factory()
    assert (await prospect.get(f"/api/public/links/{code}")).json()["slug"] == slug
    s = (await prospect.post(f"/api/public/{slug}/sessions", json={"source": {"mc": code}})).json()
    h = {"X-Resume-Token": s["resume_token"]}
    base = f"/api/public/{slug}/sessions/{s['session_id']}"
    answers = [("projet", "autre"), ("autre_description", "Rénover un séjour"), ("logement", "maison"), ("anciennete", True),
               ("delai", "moins_3_mois"), ("budget", None), ("photos", None), ("precisions", None)]
    for step, value in answers:
        assert (await prospect.put(f"{base}/answers", json={"step": step, "value": value}, headers=h)).status_code == 200, step
    day = next_open_day()
    slots = (await prospect.get(f"{base}/slots", headers=h, params={"from": day.isoformat(), "days": 7})).json()
    first = next(sl for d in slots["days"] for sl in d["slots"])
    assert (await prospect.post(f"{base}/hold", json={"start": first["start"]}, headers=h)).status_code == 200
    done = await prospect.post(f"{base}/confirm", headers=h, json={
        "first_name": "Léa", "email": "lea@exemple.fr", "phone": "06 39 98 12 34", "accept_privacy": True,
        "address": {"line": "1 rue de l'Exemple", "postal_code": "75001", "city": "Paris"}})
    assert done.status_code == 200, done.text

    # 6-7. Confirmation (jamais envoyée) et demande visible dans l'espace entreprise.
    from venio.modules.notifications import run_due_jobs
    await run_due_jobs()
    notifs = (await visitor.get("/api/notifications")).json()
    assert notifs and all(n["status"] in ("logged", "scheduled") for n in notifs)
    assert all(n["provider"] == "demonstration" for n in notifs if n["status"] == "logged")
    [call] = (await visitor.get("/api/missed-calls/calls")).json()
    assert call["booked_at"] and call["case_file_id"]
    assert (await visitor.get("/api/case-files")).json()[0]["first_name"] == "Léa"


async def test_demo_cannot_pay(client_factory):
    visitor = client_factory()
    await visitor.post("/api/demo/start")
    r = await visitor.post("/api/billing/checkout", json={"plan": "pro"})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "demo"
    assert (await visitor.post("/api/billing/sms-pack", json={"pack": "sms_100"})).status_code == 403


async def test_purge_removes_only_expired_demo_workspaces(client_factory, database):
    real, old_demo, new_demo = client_factory(), client_factory(), client_factory()
    t = await signup(real)
    await old_demo.post("/api/demo/start")
    await new_demo.post("/api/demo/start")
    old_id = (await old_demo.get("/api/auth/me")).json()["tenant"]["id"]
    conn = await asyncpg.connect(database["admin_url"])
    try:
        await conn.execute("UPDATE tenant SET created_at = now() - interval '3 hours' WHERE id = $1::uuid", old_id)
        # Une vraie entreprise ancienne n'est jamais concernée.
        await conn.execute("UPDATE tenant SET created_at = now() - interval '3 hours' WHERE id = $1::uuid", t["tenant_id"])
    finally:
        await conn.close()
    from venio.db import tx
    from venio.modules.demo import purge
    async with tx() as c:
        assert await purge(c) == 1
    assert (await old_demo.get("/api/auth/me")).status_code == 401      # session et compte supprimés
    assert (await new_demo.get("/api/auth/me")).status_code == 200
    assert (await real.get("/api/auth/me")).status_code == 200
    conn = await asyncpg.connect(database["admin_url"])
    try:
        assert await conn.fetchval("SELECT count(*) FROM tenant WHERE id = $1::uuid", old_id) == 0
        assert await conn.fetchval("SELECT count(*) FROM tenant WHERE id = $1::uuid", t["tenant_id"]) == 1
    finally:
        await conn.close()
