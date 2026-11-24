"""Sauvegardes du palier 0 : instantané, restauration complète, rotation, isolement vis-à-vis de l'application."""
import asyncpg
import pytest
from conftest import qualified_session, signup


async def _admin(database):
    return await asyncpg.connect(database["admin_url"])


async def _counts(conn) -> dict:
    return {t: await conn.fetchval(f"SELECT count(*) FROM {t}")
            for t in ("tenant", "app_user", "membership", "subscription", "service", "flow", "flow_version", "contact", "case_file", "intake_session")}


async def test_snapshot_then_full_restore(client_factory, database):
    pro, visitor = client_factory(), client_factory()
    t = await signup(pro, company="Sauvegarde Test")
    await qualified_session(visitor, t["slug"])                 # des données de prospect en cours de parcours
    conn = await _admin(database)
    try:
        before = await _counts(conn)
        label = await conn.fetchval("SELECT backup.take_snapshot(7)")
        assert await conn.fetchval("SELECT total_rows FROM backup.snapshot WHERE label = $1", label) > 0

        # Incident simulé : une entreprise supprimée par erreur et une autre modifiée.
        await conn.execute("DELETE FROM tenant WHERE slug = $1", t["slug"])
        await conn.execute("UPDATE tenant SET name = 'abîmé'")
        assert await conn.fetchval("SELECT count(*) FROM tenant WHERE slug = $1", t["slug"]) == 0

        restored = await conn.fetchval("SELECT backup.restore_snapshot($1)", label)
        assert restored == await conn.fetchval("SELECT total_rows FROM backup.snapshot WHERE label = $1", label)
        assert await _counts(conn) == before
        assert await conn.fetchval("SELECT name FROM tenant WHERE slug = $1", t["slug"]) == "Sauvegarde Test"
        assert await conn.fetchval("SELECT count(*) FROM tenant WHERE name = 'abîmé'") == 0
        # Les compteurs automatiques repartent après la plus grande valeur restaurée (pas de collision).
        await conn.execute("INSERT INTO audit_log (tenant_id, actor_kind, action) SELECT id, 'system', 'test' FROM tenant LIMIT 1")
        # Le journal des migrations n'est jamais restauré.
        assert await conn.fetchval("SELECT count(*) FROM schema_migration") >= 8
    finally:
        await conn.close()
    # La restauration ferme les sessions : il faut se reconnecter, puis tout fonctionne.
    assert (await pro.get("/api/auth/me")).status_code == 401
    me = (await pro.post("/api/auth/login", json={"email": (await _owner_email(database, t["slug"])), "password": "motdepasse-solide"}))
    assert me.status_code == 200
    assert (await pro.get("/api/dashboard")).status_code == 200


async def _owner_email(database, slug):
    conn = await _admin(database)
    try:
        return await conn.fetchval("SELECT u.email FROM app_user u JOIN membership m ON m.user_id = u.id"
                                   " JOIN tenant t ON t.id = m.tenant_id WHERE t.slug = $1", slug)
    finally:
        await conn.close()


async def test_rotation_keeps_seven_days(database):
    conn = await _admin(database)
    try:
        old = await conn.fetchval("SELECT backup.take_snapshot(7)")
        await conn.execute("UPDATE backup.snapshot SET taken_at = now() - interval '8 days' WHERE label = $1", old)
        await conn.execute("SELECT pg_sleep(1.1)")
        new = await conn.fetchval("SELECT backup.take_snapshot(7)")
        labels = {r["label"] for r in await conn.fetch("SELECT label FROM backup.snapshot")}
        assert new in labels and old not in labels
        assert await conn.fetchval("SELECT count(*) FROM pg_tables WHERE schemaname = 'backup' AND tablename LIKE $1", old + "%") == 0
    finally:
        await conn.close()


async def test_application_role_cannot_read_or_run_backups(database):
    conn = await _admin(database)
    try:
        await conn.fetchval("SELECT backup.take_snapshot(7)")
    finally:
        await conn.close()
    app = await asyncpg.connect(database["app_url"].replace("postgresql+asyncpg://", "postgresql://"))
    try:
        for sql in ("SELECT count(*) FROM backup.snapshot", "SELECT backup.take_snapshot(7)", "SELECT backup.restore_snapshot('x')"):
            with pytest.raises(asyncpg.InsufficientPrivilegeError):
                await app.fetchval(sql)
    finally:
        await app.close()
