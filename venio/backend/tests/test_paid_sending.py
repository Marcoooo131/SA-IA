"""Garde-fou des envois facturés : aucun SMS ne part tant que VENIO_PAID_SENDING_ENABLED n'est pas activé."""
import asyncpg
import pytest
from conftest import next_open_day, qualified_session, signup


async def _booking_with_sms(client_factory, admin_url: str) -> tuple[str, str]:
    pro, visitor = client_factory(), client_factory()
    tenant = await signup(pro)
    slug = tenant["slug"]
    sess = await qualified_session(visitor, slug)
    base = f"/api/public/{slug}/sessions/{sess['id']}"
    day = next_open_day()
    slots = (await visitor.get(f"{base}/slots", headers=sess["headers"],
                               params={"from": day.isoformat(), "days": 1})).json()
    start = slots["days"][0]["slots"][0]["start"]
    assert (await visitor.post(f"{base}/hold", json={"start": start}, headers=sess["headers"])).status_code == 200
    done = await visitor.post(f"{base}/confirm", headers=sess["headers"], json={
        "first_name": "Léa", "email": "lea@venio-tests.fr", "phone": "06 12 34 56 78",
        "accept_privacy": True, "consent_sms_reminders": True})
    assert done.status_code == 200, done.text
    conn = await asyncpg.connect(admin_url)
    try:
        row = await conn.fetchrow(
            "INSERT INTO notification (tenant_id, booking_id, contact_id, channel, template_key, to_address, scheduled_for)"
            " SELECT tenant_id, booking_id, contact_id, 'sms', template_key, '+33612345678', now()"
            " FROM notification WHERE booking_id = $1 AND template_key = 'client_confirmation'"
            " RETURNING id, tenant_id", done.json()["booking"]["id"])
    finally:
        await conn.close()
    return str(row["id"]), str(row["tenant_id"])


async def test_sms_never_sent_when_paid_sending_disabled(client_factory, database, monkeypatch):
    from venio.config import get_settings
    from venio.db import fetch_one, tx
    from venio.modules import notifications

    monkeypatch.setenv("VENIO_EMAIL_PROVIDER", "brevo")  # même avec un vrai fournisseur configuré
    monkeypatch.setenv("VENIO_BREVO_API_KEY", "test")
    get_settings.cache_clear()
    assert get_settings().paid_sending_enabled is False

    def no_network(*a, **k):
        raise AssertionError("aucun appel réseau ne doit partir pour un SMS")
    monkeypatch.setattr(notifications.httpx, "post", no_network)

    notif_id, tenant_id = await _booking_with_sms(client_factory, database["admin_url"])
    async with tx(tenant_id=tenant_id) as conn:
        assert await notifications.deliver(conn, notif_id) == "logged"
        row = await fetch_one(conn, "SELECT status, provider FROM notification WHERE id = :n", n=notif_id)
    assert row["status"] == "logged" and row["provider"] == "envoi-payant-desactive"
    get_settings.cache_clear()


async def test_sms_does_not_fall_back_to_email_when_enabled(client_factory, database, monkeypatch):
    from venio.config import get_settings
    from venio.db import tx
    from venio.modules import notifications

    monkeypatch.setenv("VENIO_PAID_SENDING_ENABLED", "true")
    monkeypatch.setenv("VENIO_EMAIL_PROVIDER", "brevo")
    monkeypatch.setenv("VENIO_BREVO_API_KEY", "test")
    get_settings.cache_clear()
    urls = []

    def record(url, **k):
        urls.append(url)
        raise RuntimeError("réseau coupé pour le test")
    monkeypatch.setattr(notifications.httpx, "post", record)

    notif_id, tenant_id = await _booking_with_sms(client_factory, database["admin_url"])
    with pytest.raises(RuntimeError, match="réseau coupé"):
        async with tx(tenant_id=tenant_id) as conn:
            await notifications.deliver(conn, notif_id)
    get_settings.cache_clear()
    # Envois payants autorisés : le SMS part par l'API SMS de Brevo, jamais par le service d'emails.
    assert urls == [notifications.BREVO_SMS_URL]
