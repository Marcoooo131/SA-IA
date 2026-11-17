"""Isolation multi-tenant : vérifiée par l'API ET directement en base (RLS)."""
import asyncpg

from conftest import next_open_day, qualified_session, signup


async def _book(client, slug):
    sess = await qualified_session(client, slug)
    base = f"/api/public/{slug}/sessions/{sess['id']}"
    slots = (await client.get(f"{base}/slots", params={"from": next_open_day().isoformat(), "days": 1},
                              headers=sess["headers"])).json()
    await client.post(f"{base}/hold", json={"start": slots["days"][0]["slots"][-1]["start"]}, headers=sess["headers"])
    r = await client.post(f"{base}/confirm", headers=sess["headers"], json={
        "first_name": "Client", "email": "c@venio-tests.fr", "accept_privacy": True})
    assert r.status_code == 200, r.text
    return r.json()


async def test_api_isolation_between_tenants(client_factory):
    a, b, visitor = client_factory(), client_factory(), client_factory()
    ta, tb = await signup(a), await signup(b)
    await _book(visitor, tb["slug"])
    b_case = (await b.get("/api/case-files")).json()[0]
    b_booking = (await b.get("/api/bookings", params={"from": "2020-01-01", "to": "2020-02-01"})).json()
    assert b_booking == []  # (période vide) sanity

    assert (await a.get("/api/case-files")).json() == []
    assert (await a.get(f"/api/case-files/{b_case['id']}")).status_code == 404
    assert (await a.patch(f"/api/case-files/{b_case['id']}", json={"status": "done"})).status_code == 404
    assert (await a.post(f"/api/case-files/{b_case['id']}/notes", json={"body": "x"})).status_code == 404
    detail = (await b.get(f"/api/case-files/{b_case['id']}")).json()
    booking_id = detail["bookings"][0]["id"]
    assert (await a.patch(f"/api/bookings/{booking_id}", json={"status": "cancelled"})).status_code == 404
    # Le lien de gestion d'une réservation de B ne fonctionne pas sur la page de A
    token = (await _book(visitor, tb["slug"]))["manage_token"]
    assert (await visitor.get(f"/api/public/{ta['slug']}/manage/{token}")).status_code == 404
    # Basculer vers un espace dont on n'est pas membre est refusé
    assert (await a.post("/api/auth/switch", json={"tenant_id": tb["tenant_id"]})).status_code == 404
    assert (await b.get(f"/api/case-files/{b_case['id']}")).json()["case"]["status"] == "new"


async def test_database_rls(client_factory, database):
    a, b, visitor = client_factory(), client_factory(), client_factory()
    ta, tb = await signup(a), await signup(b)
    await _book(visitor, ta["slug"])
    await _book(visitor, tb["slug"])
    conn = await asyncpg.connect(database["app_url"].replace("postgresql+asyncpg://", "postgresql://"))
    try:
        async with conn.transaction():
            await conn.execute("SELECT set_config('app.tenant_id', $1, true)", ta["tenant_id"])
            tables = ["booking", "case_file", "contact", "notification", "intake_session", "service", "flow"]
            for t in tables:
                other = await conn.fetchval(f"SELECT count(*) FROM {t} WHERE tenant_id <> $1", ta["tenant_id"])
                assert other == 0, t
            assert await conn.fetchval("SELECT count(*) FROM booking") >= 1
            assert await conn.fetchval("SELECT count(*) FROM tenant") == 1
        async with conn.transaction():  # sans contexte : rien n'est visible
            for t in ("booking", "case_file", "contact", "tenant"):
                assert await conn.fetchval(f"SELECT count(*) FROM {t}") == 0
        try:  # écrire chez un autre est refusé
            async with conn.transaction():
                await conn.execute("SELECT set_config('app.tenant_id', $1, true)", ta["tenant_id"])
                await conn.execute("INSERT INTO resource (tenant_id, name) VALUES ($1, 'intrus')", tb["tenant_id"])
            raise AssertionError("insertion inter-tenant acceptée")
        except asyncpg.InsufficientPrivilegeError:
            pass
        # Le rôle applicatif ne contourne pas la RLS
        assert await conn.fetchval("SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user") is False
    finally:
        await conn.close()


async def test_every_tenant_table_has_rls(database):
    conn = await asyncpg.connect(database["admin_url"])
    try:
        rows = await conn.fetch(
            "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c"
            " JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id'"
            " WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace"
        )
    finally:
        await conn.close()
    unprotected = [r["relname"] for r in rows if not (r["relrowsecurity"] and r["relforcerowsecurity"])]
    assert sorted(unprotected) == ["job", "user_session"]  # tables plateforme : identifiants uniquement, jamais exposées
