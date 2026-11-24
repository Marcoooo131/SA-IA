"""Données personnelles : effacement d'un client, export, journal d'activité, durées de conservation."""
import io
import os
import uuid

import asyncpg
from conftest import GENERIC_ANSWERS, next_open_day, signup
from PIL import Image


async def _book(pro_slug, visitor, phone="06 12 34 56 78", with_photo=True):
    """Un prospect complet : photo, réponses, rendez-vous confirmé."""
    s = (await visitor.post(f"/api/public/{pro_slug}/sessions", json={})).json()
    h = {"X-Resume-Token": s["resume_token"]}
    base = f"/api/public/{pro_slug}/sessions/{s['session_id']}"
    answers = list(GENERIC_ANSWERS)
    if with_photo:
        img = io.BytesIO()
        Image.new("RGB", (20, 20), "blue").save(img, format="JPEG")
        up = await visitor.post(f"{base}/files", files={"file": ("salle.jpg", img.getvalue(), "image/jpeg")}, headers=h)
        answers[3] = ("photos", [up.json()["id"]])
    for step, value in answers:
        assert (await visitor.put(f"{base}/answers", json={"step": step, "value": value}, headers=h)).status_code == 200
    slots = (await visitor.get(f"{base}/slots", params={"from": next_open_day().isoformat(), "days": 7}, headers=h)).json()
    first = next(x for d in slots["days"] for x in d["slots"])
    await visitor.post(f"{base}/hold", json={"start": first["start"]}, headers=h)
    done = await visitor.post(f"{base}/confirm", headers=h, json={
        "first_name": "Léa", "last_name": "Durand", "email": "lea@venio-tests.fr", "phone": phone, "accept_privacy": True})
    assert done.status_code == 200, done.text


async def _count(database, sql, *args):
    conn = await asyncpg.connect(database["admin_url"])
    try:
        return await conn.fetchval(sql, *args)
    finally:
        await conn.close()


async def test_delete_contact_erases_everything(client_factory, database):
    pro, other_pro = client_factory(), client_factory()
    t = await signup(pro, company="Effacement Test")
    t2 = await signup(other_pro, company="Autre Entreprise")
    await _book(t["slug"], client_factory())
    await _book(t2["slug"], client_factory())          # même personne chez une autre entreprise : non concernée
    case = (await pro.get("/api/case-files")).json()[0]
    detail = (await pro.get(f"/api/case-files/{case['id']}")).json()
    contact_id = detail["contact"]["id"]
    storage_key = await _count(database, "SELECT storage_key FROM file_object WHERE tenant_id = $1", uuid.UUID(t["tenant_id"]))
    stored = os.path.join(os.environ["VENIO_STORAGE_DIR"], storage_key)
    assert os.path.exists(stored)

    r = await pro.delete(f"/api/contacts/{contact_id}")
    assert r.status_code == 200 and r.json()["bookings"] == 1 and r.json()["files"] == 1
    tid = uuid.UUID(t["tenant_id"])
    for table in ("contact", "case_file", "booking", "intake_session", "file_object", "consent", "note"):
        assert await _count(database, f"SELECT count(*) FROM {table} WHERE tenant_id = $1", tid) == 0, table
    assert await _count(database, "SELECT count(*) FROM notification WHERE tenant_id = $1 AND contact_id IS NOT NULL", tid) == 0
    assert not os.path.exists(stored)                               # la photo est effacée du stockage
    # L'autre entreprise garde son client ; une autre entreprise ne peut rien effacer chez nous.
    assert await _count(database, "SELECT count(*) FROM contact WHERE tenant_id = $1", uuid.UUID(t2["tenant_id"])) == 1
    other_contact = await _count(database, "SELECT id FROM contact WHERE tenant_id = $1", uuid.UUID(t2["tenant_id"]))
    assert (await pro.delete(f"/api/contacts/{other_contact}")).status_code == 404
    journal = (await pro.get("/api/audit")).json()
    assert journal[0]["action"] == "contact.delete" and journal[0]["label"].startswith("Suppression")
    assert any(e["action"] == "case_file.view" for e in journal)    # la consultation du dossier est tracée


async def test_member_cannot_delete_or_export(client_factory, database):
    pro = client_factory()
    t = await signup(pro)
    conn = await asyncpg.connect(database["admin_url"])
    try:
        await conn.execute("UPDATE membership SET role = 'member' WHERE tenant_id = $1", uuid.UUID(t["tenant_id"]))
    finally:
        await conn.close()
    assert (await pro.get("/api/export")).status_code == 403
    assert (await pro.delete(f"/api/contacts/{uuid.uuid4()}")).status_code == 403
    assert (await pro.get("/api/audit")).status_code == 403


async def test_export_contains_data_without_secrets(client_factory):
    pro = client_factory()
    t = await signup(pro, company="Export Test")
    await _book(t["slug"], client_factory(), with_photo=False)
    r = await pro.get("/api/export")
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    data = r.json()
    assert data["tenant"][0]["name"] == "Export Test" and data["contact"][0]["first_name"] == "Léa"
    assert len(data["booking"]) == 1 and len(data["case_file"]) == 1
    assert "resume_token_hash" not in r.text and "token_hash" not in r.text
    assert (await pro.get("/api/audit")).json()[0]["action"] == "data.export"


async def test_retention_purge(client_factory, database):
    pro = client_factory()
    t = await signup(pro, company="Conservation Test")
    await _book(t["slug"], client_factory(), phone="06 11 11 11 11")
    await _book(t["slug"], client_factory(), phone="06 22 22 22 22", with_photo=False)
    tid = uuid.UUID(t["tenant_id"])
    conn = await asyncpg.connect(database["admin_url"])
    try:
        old = await conn.fetchval("SELECT id FROM contact WHERE tenant_id = $1 AND phone LIKE '06 11%'", tid)
        # Un client sans activité depuis 4 ans, une session expirée.
        await conn.execute("UPDATE contact SET created_at = now() - interval '4 years' WHERE id = $1", old)
        await conn.execute("UPDATE case_file SET created_at = now() - interval '4 years' WHERE contact_id = $1", old)
        await conn.execute("UPDATE booking SET starts_at = now() - interval '4 years', ends_at = now() - interval '4 years' + interval '1 hour'"
                           " WHERE case_file_id IN (SELECT id FROM case_file WHERE contact_id = $1)", old)
        await conn.execute("UPDATE user_session SET expires_at = now() - interval '1 day' WHERE user_id IN"
                           " (SELECT user_id FROM membership WHERE tenant_id = $1)", tid)
    finally:
        await conn.close()
    from venio.db import tx
    from venio.modules.privacy import purge
    async with tx() as c:
        assert await purge(c) == 1                                  # une photo à effacer du stockage
    assert await _count(database, "SELECT count(*) FROM contact WHERE tenant_id = $1", tid) == 1   # le récent reste
    assert await _count(database, "SELECT count(*) FROM contact WHERE id = $1", old) == 0
    assert await _count(database, "SELECT count(*) FROM booking WHERE tenant_id = $1", tid) == 1
    assert (await pro.get("/api/auth/me")).status_code == 401       # session expirée supprimée
