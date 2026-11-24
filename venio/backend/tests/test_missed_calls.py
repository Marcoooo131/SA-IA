"""Récupération des appels manqués de bout en bout, sur un vrai PostgreSQL (RLS, verrous, contraintes)."""
import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone

import asyncpg
import pytest
from conftest import GENERIC_ANSWERS, next_open_day, signup


@pytest.fixture(autouse=True)
def _no_delay(monkeypatch):
    from venio.telephony import service
    monkeypatch.setattr(service, "SIMULATOR_DELAY_S", 0)


@pytest.fixture(autouse=True)
def _open_hours(monkeypatch):
    """Les tests ne dépendent pas de l'heure à laquelle ils tournent : fenêtre d'envoi toujours ouverte."""
    from venio.telephony import rules
    monkeypatch.setattr(rules, "in_window", lambda local, cfg, is_holiday: True)


@pytest.fixture
def no_network(monkeypatch):
    from venio.modules import notifications

    def forbidden(*a, **k):
        raise AssertionError("aucun appel réseau ne doit partir")
    monkeypatch.setattr(notifications.httpx, "post", forbidden)


async def _tenant(client_factory, enabled=True, config=None):
    pro = client_factory()
    t = await signup(pro, company=f"Renov {uuid.uuid4().hex[:6]}")
    t["name"] = (await pro.get("/api/auth/me")).json()["tenant"]["name"]
    r = await pro.put("/api/missed-calls/settings", json={"enabled": enabled, "config": config or {}})
    assert r.status_code == 200, r.text
    line = await pro.post("/api/missed-calls/lines", json={"label": "Ligne de test", "business_number": "01 40 00 00 00"})
    assert line.status_code == 201, line.text
    return pro, t, line.json()


async def _run_jobs():
    from venio.modules.notifications import run_due_jobs
    for _ in range(5):
        if not await run_due_jobs():
            break


async def _calls(pro):
    return (await pro.get("/api/missed-calls/calls")).json()


async def test_missed_call_to_booking_full_journey(client_factory, no_network):
    pro, tenant, _ = await _tenant(client_factory)
    r = await pro.post("/api/missed-calls/simulate", json={"from_number": "06 12 34 56 78"})
    assert r.status_code == 201, r.text
    await _run_jobs()

    [row] = await _calls(pro)
    assert row["outcome"] == "missed" and row["decision"] == "sent" and row["is_test"]
    assert row["sms_status"] == "logged" and row["sms_provider"] == "simulateur"   # ligne de test : jamais envoyé
    assert row["number_masked"] == "06 •• •• 56 78" and row["number_tel"] == "+33612345678"
    assert tenant["name"] in row["sms_body"] and "/c/" in row["sms_body"]
    settings = (await pro.get("/api/missed-calls/settings")).json()
    assert settings["credits"]["used"] == 0          # un SMS simulé ne consomme pas de crédit

    # Le prospect ouvre le lien, remplit le parcours et réserve.
    code = row["sms_body"].split("/c/")[1].split()[0]
    visitor = client_factory()
    link = (await visitor.get(f"/api/public/links/{code}")).json()
    assert link == {"slug": tenant["slug"], "ref": code, "name": tenant["name"]}
    slug = link["slug"]
    s = (await visitor.post(f"/api/public/{slug}/sessions", json={"source": {"mc": code}})).json()
    h = {"X-Resume-Token": s["resume_token"]}
    base = f"/api/public/{slug}/sessions/{s['session_id']}"
    for step, value in GENERIC_ANSWERS:
        assert (await visitor.put(f"{base}/answers", json={"step": step, "value": value}, headers=h)).status_code == 200
    day = next_open_day()
    slots = (await visitor.get(f"{base}/slots", headers=h, params={"from": day.isoformat(), "days": 1})).json()
    assert (await visitor.post(f"{base}/hold", json={"start": slots["days"][0]["slots"][0]["start"]}, headers=h)).status_code == 200
    done = await visitor.post(f"{base}/confirm", headers=h, json={
        "first_name": "Léa", "email": "lea@venio-tests.fr", "phone": "06 12 34 56 78", "accept_privacy": True})
    assert done.status_code == 200, done.text

    [row] = await _calls(pro)
    assert row["clicked_at"] and row["form_started_at"] and row["booked_at"] and row["case_file_id"]
    st = (await pro.get("/api/missed-calls/stats")).json()
    assert (st["missed"], st["triggered"], st["sent"], st["not_delivered"], st["clicked"], st["started"], st["booked"]) == (1, 1, 0, 1, 1, 1, 1)
    assert st["recovery_rate"] == 1.0 and st["reliable"] is False

    # Le même numéro rappelle : il a déjà reçu un SMS (et a désormais un rendez-vous) → pas de second SMS.
    await pro.post("/api/missed-calls/simulate", json={"from_number": "+33612345678"})
    await _run_jobs()
    latest = (await _calls(pro))[0]
    # Le prospect a maintenant un rendez-vous à venir : pas de nouveau lien de réservation.
    assert latest["decision"] == "not_sent" and latest["reason"] == "upcoming_booking"
    assert (await pro.post(f"/api/missed-calls/recoveries/{latest['recovery_id']}/handled")).status_code == 200


@pytest.mark.parametrize("payload,reason", [
    ({"scenario": "masked"}, "masked"),
    ({"from_number": "01 23 45 67 89"}, "not_mobile"),
    ({"from_number": "+32 470 12 34 56"}, "not_mobile"),
    ({"from_number": "01 40 00 00 00"}, "not_mobile"),
])
async def test_not_sent_reasons(client_factory, no_network, payload, reason):
    pro, _, _ = await _tenant(client_factory)
    await pro.post("/api/missed-calls/simulate", json=payload)
    await _run_jobs()
    [row] = await _calls(pro)
    assert row["decision"] == "not_sent" and row["reason"] == reason and row["reason_label"]


async def test_answered_call_creates_no_recovery(client_factory, no_network):
    pro, _, _ = await _tenant(client_factory)
    await pro.post("/api/missed-calls/simulate", json={"scenario": "answered"})
    await _run_jobs()
    [row] = await _calls(pro)
    assert row["outcome"] == "answered" and row["recovery_id"] is None


async def test_disabled_module_and_exclusions(client_factory, no_network):
    pro, _, _ = await _tenant(client_factory, enabled=False)
    await pro.post("/api/missed-calls/simulate", json={})
    await _run_jobs()
    assert (await _calls(pro))[0]["reason"] == "disabled"

    pro2, _, _ = await _tenant(client_factory)
    assert (await pro2.post("/api/missed-calls/exclusions", json={"number": "06 11 22 33 44", "label": "Fournisseur"})).status_code == 201
    assert (await pro2.post("/api/missed-calls/exclusions", json={"number": "06 99 88 77 66", "kind": "opt_out"})).status_code == 201
    await pro2.post("/api/missed-calls/simulate", json={"from_number": "0611223344"})
    await pro2.post("/api/missed-calls/simulate", json={"from_number": "0699887766"})
    await _run_jobs()
    assert sorted(r["reason"] for r in await _calls(pro2)) == ["excluded", "opted_out"]
    assert (await pro2.delete("/api/missed-calls/exclusions/0611223344")).status_code == 204
    assert len((await pro2.get("/api/missed-calls/exclusions")).json()) == 1


async def test_settings_validation_and_line_limit(client_factory):
    pro, _, _ = await _tenant(client_factory)
    bad = await pro.put("/api/missed-calls/settings", json={"enabled": True, "config": {"send_start": "06:00"}})
    assert bad.status_code == 422 and "8 h" in bad.json()["detail"]["message"]
    long = await pro.put("/api/missed-calls/settings", json={"enabled": True, "config": {
        "tone": "personnalise", "custom_text": "À bientôt " * 30 + "{lien}"}})
    assert long.status_code == 422 and long.json()["detail"]["code"] == "sms_too_long"
    prev = (await pro.post("/api/missed-calls/preview", json={"tone": "court", "stop_mention": "STOP au 36173"})).json()
    assert prev["segments"] == 1 and prev["text"].endswith("STOP au 36173")
    # Offre Pro (essai) : une seule ligne suivie ; pas de ligne réelle tant qu'aucun fournisseur n'est branché.
    assert (await pro.post("/api/missed-calls/lines", json={"label": "Deuxième"})).status_code == 409
    real = await pro.post("/api/missed-calls/lines", json={"label": "Mobile", "mode": "forward_no_answer"})
    assert real.status_code == 422 and real.json()["detail"]["code"] == "provider_not_available"


def _signed(events, line_id):
    from venio.telephony.adapters import SimulatorAdapter
    from venio.telephony.service import webhook_secret
    body = json.dumps({"events": events}).encode()
    return body, {"X-Venio-Signature": SimulatorAdapter.sign(body, webhook_secret(line_id)), "Content-Type": "application/json"}


async def test_webhook_signature_idempotency_and_out_of_order(client_factory, no_network):
    pro, _, line = await _tenant(client_factory)
    hook = client_factory()
    now = datetime.now(timezone.utc)
    ev = [{"id": "e1", "call_id": "c1", "type": "call.missed", "from": "0612345678", "to": None, "at": now.isoformat()},
          {"id": "e2", "call_id": "c1", "type": "call.completed", "from": "0612345678", "to": None, "at": now.isoformat()}]
    body, headers = _signed(ev, line["id"])
    assert (await hook.post(line["webhook_path"], content=body, headers={**headers, "X-Venio-Signature": "faux"})).status_code == 401
    assert (await hook.post("/api/telephony/simulator/jeton-inconnu", content=body, headers=headers)).status_code == 404
    for _ in range(5):  # le fournisseur rejoue son webhook
        assert (await hook.post(line["webhook_path"], content=body, headers=headers)).status_code == 200
    # Un « décroché » arrive en retard pour le même appel (transfert abouti) : il l'emporte sur le « manqué ».
    late = [{"id": "e3", "call_id": "c1", "type": "call.answered", "from": "0612345678", "to": None, "at": (now - timedelta(seconds=10)).isoformat()}]
    body2, headers2 = _signed(late, line["id"])
    assert (await hook.post(line["webhook_path"], content=body2, headers=headers2)).status_code == 200
    await _run_jobs()
    [row] = await _calls(pro)
    assert row["outcome"] == "answered" and row["decision"] == "not_sent" and row["reason"] == "call_answered"


async def test_simultaneous_calls_same_number_send_one_sms(client_factory, database, no_network):
    pro, tenant, line = await _tenant(client_factory)
    hook = client_factory()
    now = datetime.now(timezone.utc).isoformat()
    for i in range(10):
        body, headers = _signed([{"id": f"m{i}", "call_id": f"call{i}", "type": "call.missed", "from": "0687654321", "to": None, "at": now}], line["id"])
        assert (await hook.post(line["webhook_path"], content=body, headers=headers)).status_code == 200
    from venio.db import fetch_all, tx
    from venio.telephony.service import evaluate
    me = (await pro.get("/api/auth/me")).json()
    tid = me["tenant"]["id"]
    async with tx(tenant_id=tid) as conn:
        ids = [r["id"] for r in await fetch_all(conn, "SELECT id FROM missed_call_recovery")]
    assert len(ids) == 10

    async def one(rid):
        async with tx(tenant_id=tid) as conn:
            return await evaluate(conn, rid)
    results = await asyncio.gather(*(one(r) for r in ids))
    assert sorted(results).count("sent") == 1 and sorted(results).count("not_sent") == 9


async def test_isolation_between_companies(client_factory, database, no_network):
    pro_a, _, _ = await _tenant(client_factory)
    await pro_a.post("/api/missed-calls/simulate", json={})
    await _run_jobs()
    pro_b, _, _ = await _tenant(client_factory)
    assert await _calls(pro_b) == []
    assert (await pro_b.get("/api/missed-calls/stats")).json()["calls"] == 0
    # SQL direct avec le rôle applicatif, contexte de l'entreprise B : aucune ligne de A visible.
    me_b = (await pro_b.get("/api/auth/me")).json()
    conn = await asyncpg.connect(database["app_url"].replace("postgresql+asyncpg://", "postgresql://"))
    try:
        async with conn.transaction():
            await conn.execute("SELECT set_config('app.tenant_id', $1, true)", me_b["tenant"]["id"])
            for table in ("call", "missed_call_recovery", "telephony_line", "telephony_event_raw", "phone_exclusion"):
                n = await conn.fetchval(f"SELECT count(*) FROM {table}")
                assert n == (1 if table == "telephony_line" else 0), table
    finally:
        await conn.close()


async def _real_line(database, tenant_id):
    """Ligne « réelle » insérée directement (aucun fournisseur n'est encore branché dans l'API)."""
    conn = await asyncpg.connect(database["admin_url"])
    try:
        return await conn.fetchval(
            "INSERT INTO telephony_line (tenant_id, label, mode, provider) VALUES ($1, 'Fixe', 'forward_no_answer', 'twilio') RETURNING id",
            uuid.UUID(tenant_id))
    finally:
        await conn.close()


async def _ingest_real(tenant_id, line_id, number="0612121212"):
    from venio.db import fetch_one, tx
    from venio.telephony.adapters import CallEvent, CallEventType
    from venio.telephony.service import ingest
    now = datetime.now(timezone.utc)
    cid = f"real-{uuid.uuid4()}"
    async with tx(tenant_id=tenant_id) as conn:
        line = await fetch_one(conn, "SELECT * FROM telephony_line WHERE id = :l", l=line_id)
        await ingest(conn, tenant_id, line, [
            CallEvent("twilio", f"{cid}-1", cid, CallEventType.INBOUND, number, None, now, {}),
            CallEvent("twilio", f"{cid}-2", cid, CallEventType.COMPLETED, number, None, now, {}),
        ], delay_override_s=0)


async def test_real_line_sms_blocked_by_paid_switch(client_factory, database, no_network):
    pro, _, _ = await _tenant(client_factory)
    tid = (await pro.get("/api/auth/me")).json()["tenant"]["id"]
    line_id = await _real_line(database, tid)
    await _ingest_real(tid, line_id)
    await _run_jobs()
    row = next(r for r in await _calls(pro) if not r["is_test"])
    assert row["outcome"] == "missed"                 # renvoi sur non-réponse : l'appel reçu est manqué
    assert row["decision"] == "sent" and row["sms_status"] == "logged" and row["sms_provider"] == "envoi-payant-desactive"
    assert (await pro.get("/api/missed-calls/settings")).json()["credits"]["used"] == 0


async def test_real_line_uses_brevo_sms_when_explicitly_enabled(client_factory, database, monkeypatch):
    import httpx

    from venio.config import get_settings
    from venio.modules import notifications
    calls = []

    def fake_post(url, json=None, headers=None, timeout=None):
        calls.append((url, json))
        return httpx.Response(201, json={"messageId": 42}, request=httpx.Request("POST", url))
    monkeypatch.setattr(notifications.httpx, "post", fake_post)
    monkeypatch.setenv("VENIO_PAID_SENDING_ENABLED", "true")
    monkeypatch.setenv("VENIO_BREVO_API_KEY", "test")
    get_settings.cache_clear()
    try:
        pro, _, _ = await _tenant(client_factory, config={"sender": "RENOEXEMPLE"})
        tid = (await pro.get("/api/auth/me")).json()["tenant"]["id"]
        await _ingest_real(tid, await _real_line(database, tid))
        await _run_jobs()
    finally:
        get_settings.cache_clear()
    assert len(calls) == 1
    url, payload = calls[0]
    assert url == notifications.BREVO_SMS_URL and payload["recipient"] == "33612121212" and payload["sender"] == "RENOEXEMPLE"
    row = next(r for r in await _calls(pro) if not r["is_test"])
    assert row["sms_status"] == "sent" and row["sms_provider"] == "brevo-sms"
    assert (await pro.get("/api/missed-calls/settings")).json()["credits"]["used"] == 1


async def test_quota_exhausted(client_factory, database, no_network):
    pro, _, _ = await _tenant(client_factory)
    tid = (await pro.get("/api/auth/me")).json()["tenant"]["id"]
    conn = await asyncpg.connect(database["admin_url"])
    try:
        await conn.execute(
            "INSERT INTO usage_counter (tenant_id, key, period, value) VALUES ($1, 'sms_credits', date_trunc('month', now() AT TIME ZONE 'Europe/Paris')::date, 200)",
            uuid.UUID(tid))
    finally:
        await conn.close()
    await pro.post("/api/missed-calls/simulate", json={})
    await _run_jobs()
    assert (await _calls(pro))[0]["reason"] == "quota"


async def test_sms_page_lets_caller_request_a_callback(client_factory, no_network):
    """Filtrage niveau 1 : l'appelant qui ne veut pas de rendez-vous demande un rappel depuis la page du SMS."""
    from venio.modules import account_mail
    account_mail.outbox.clear()
    pro, tenant, _ = await _tenant(client_factory)
    await pro.post("/api/missed-calls/simulate", json={"from_number": "06 44 55 66 77"})
    await _run_jobs()
    [row] = await _calls(pro)
    code = row["sms_body"].split("/c/")[1].split()[0]
    caller = client_factory()
    link = (await caller.get(f"/api/public/links/{code}")).json()
    assert link["name"] == tenant["name"]
    assert (await caller.post(f"/api/public/links/{code}/intent", json={"intent": "other"})).status_code == 422
    assert (await caller.post(f"/api/public/links/{code}/intent", json={"intent": "existing"})).status_code == 200
    r = await caller.post(f"/api/public/links/{code}/callback", json={"name": "Paul", "note": "Question sur une facture"})
    assert r.status_code == 201 and r.json()["company"] == tenant["name"]
    # Une seconde demande ne remplace pas la première.
    await caller.post(f"/api/public/links/{code}/callback", json={"name": "Quelqu'un d'autre"})
    [row] = await _calls(pro)
    assert row["callback_name"] == "Paul" and row["callback_note"] == "Question sur une facture"
    assert row["callback_requested_at"] and row["visitor_intent"] == "callback"
    alerts = [m for m in account_mail.outbox if m["subject"].startswith("Demande de rappel")]
    assert len(alerts) == 1 and "06 44 55 66 77" in alerts[0]["body"]
    assert (await caller.post("/api/public/links/inconnu123/callback", json={"name": "X"})).status_code == 404
