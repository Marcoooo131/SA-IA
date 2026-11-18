"""Abonnements Stripe : garde-fous, paiement, webhooks, états d'accès, packs de SMS (Stripe simulé)."""
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl

import asyncpg
import httpx
import pytest

from conftest import signup

WEBHOOK_SECRET = "whsec_test_venio"


class FakeStripe:
    """Reçoit les mêmes appels HTTP que l'API Stripe et garde un état minimal en mémoire."""

    def __init__(self):
        self.calls: list[tuple[str, str, dict]] = []
        self.customers: dict[str, dict] = {}
        self.subscriptions: dict[str, dict] = {}
        self.prices = {f"venio_{p}_{i}": {"id": f"price_{p}_{i}", "lookup_key": f"venio_{p}_{i}", "product": f"prod_{p}",
                                          "recurring": {"interval": i}} for p in ("starter", "pro", "business") for i in ("month", "year")}
        self.prices |= {f"venio_{c}": {"id": f"price_{c}", "lookup_key": f"venio_{c}", "product": f"prod_{c}"} for c in ("sms_100", "sms_500")}

    def _resp(self, url, body, status=200):
        return httpx.Response(status, json=body, request=httpx.Request("POST", url))

    def post(self, url, data=None, headers=None, timeout=None):
        params = dict(data or [])
        path = url.split("/v1")[1]
        self.calls.append(("POST", path, params))
        if path == "/customers":
            cid = f"cus_{uuid.uuid4().hex[:10]}"
            self.customers[cid] = {"id": cid, "metadata": {"tenant_id": params.get("metadata[tenant_id]")}}
            return self._resp(url, self.customers[cid])
        if path == "/checkout/sessions":
            return self._resp(url, {"id": f"cs_{len(self.calls)}", "url": f"https://checkout.stripe.test/{len(self.calls)}"})
        if path == "/billing_portal/sessions":
            return self._resp(url, {"url": "https://billing.stripe.test/portal"})
        return self._resp(url, {"error": {"message": f"inattendu {path}"}}, 400)

    def get(self, url, params=None, headers=None, timeout=None):
        path = url.split("/v1")[1]
        q = list(params or [])
        self.calls.append(("GET", path, dict(q)))
        if path.startswith("/subscriptions/"):
            return self._resp(url, self.subscriptions[path.split("/")[-1]])
        if path == "/prices":
            keys = [v for k, v in q if k.startswith("lookup_keys")]
            return self._resp(url, {"data": [self.prices[k] for k in keys if k in self.prices]})
        if path == "/billing_portal/configurations":
            return self._resp(url, {"data": [{"id": "bpc_venio", "metadata": {"venio": "1"}}]})
        return self._resp(url, {"error": {"message": f"inattendu {path}"}}, 404)

    def subscription(self, sid, tenant_id, status="active", plan="pro", interval="month", **extra):
        now = int(time.time())
        self.subscriptions[sid] = {
            "id": sid, "customer": f"cus_{tenant_id[:8]}", "status": status, "metadata": {"tenant_id": tenant_id},
            "items": {"data": [{"price": self.prices[f"venio_{plan}_{interval}"]}]},
            "current_period_end": now + 30 * 86400, "cancel_at_period_end": False, "trial_end": None, **extra}
        return self.subscriptions[sid]


@pytest.fixture
def stripe(monkeypatch, database):
    from venio.billing import stripe_api
    from venio.config import get_settings
    fake = FakeStripe()
    monkeypatch.setattr(stripe_api.httpx, "post", fake.post)
    monkeypatch.setattr(stripe_api.httpx, "get", fake.get)
    monkeypatch.setenv("VENIO_STRIPE_SECRET_KEY", "sk_test_fake")
    monkeypatch.setenv("VENIO_STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET)
    get_settings.cache_clear()
    yield fake
    get_settings.cache_clear()


@pytest.fixture
async def priced(database):
    """Prix Stripe (test) rattachés aux offres, comme après « python -m venio.billing.catalog »."""
    conn = await asyncpg.connect(database["admin_url"])
    try:
        for p in ("starter", "pro", "business"):
            await conn.execute("UPDATE plan SET stripe_price_monthly = $1, stripe_price_yearly = $2 WHERE code = $3",
                               f"price_{p}_month", f"price_{p}_year", p)
        yield
        await conn.execute("UPDATE plan SET stripe_price_monthly = NULL, stripe_price_yearly = NULL")
    finally:
        await conn.close()


async def _webhook(client, event, secret=WEBHOOK_SECRET, ts=None):
    from venio.billing.stripe_api import sign
    body = json.dumps(event).encode()
    return await client.post("/api/billing/webhook", content=body,
                             headers={"Stripe-Signature": sign(body, secret, ts), "Content-Type": "application/json"})


def _evt(etype, obj, livemode=False):
    return {"id": f"evt_{uuid.uuid4().hex}", "type": etype, "livemode": livemode, "data": {"object": obj}}


async def _admin_sql(database, sql, *args):
    conn = await asyncpg.connect(database["admin_url"])
    try:
        return await conn.execute(sql, *args)
    finally:
        await conn.close()


# ----------------------------------------------------------------------------- garde-fous

def test_live_key_refused_unless_explicitly_enabled():
    from venio.billing.stripe_api import check_key_mode
    with pytest.raises(RuntimeError, match="mode test"):
        check_key_mode("sk_live_abc", live_enabled=False)
    with pytest.raises(RuntimeError):
        check_key_mode("rk_live_abc", live_enabled=False)
    check_key_mode("sk_test_abc", live_enabled=False)
    check_key_mode("sk_live_abc", live_enabled=True)
    check_key_mode("", live_enabled=False)


async def test_api_refuses_to_start_with_a_live_key(monkeypatch):
    from venio.config import get_settings
    from venio.main import create_app
    monkeypatch.setenv("VENIO_STRIPE_SECRET_KEY", "sk_live_nope")
    get_settings.cache_clear()
    try:
        app = create_app()
        with pytest.raises(RuntimeError, match="Clé Stripe réelle refusée"):
            async with app.router.lifespan_context(app):
                pass
    finally:
        get_settings.cache_clear()


def test_signature_and_form_encoding():
    from venio.billing.stripe_api import StripeError, form, sign, verify_signature
    body = b'{"id":"evt_1"}'
    verify_signature(body, sign(body, "s"), "s")
    for bad in (sign(body, "autre"), "t=1,v1=00", None, "nimporte"):
        with pytest.raises(StripeError):
            verify_signature(body, bad, "s")
    with pytest.raises(StripeError, match="expirée"):
        verify_signature(body, sign(body, "s", ts=int(time.time()) - 3600), "s")
    assert form({"a": {"b": 1}, "items": [{"price": "p", "quantity": 1}], "flag": True, "none": None, "keys": ["x", "y"]}) == [
        ("a[b]", "1"), ("items[0][price]", "p"), ("items[0][quantity]", "1"), ("flag", "true"), ("keys[0]", "x"), ("keys[1]", "y")]


def test_access_states():
    from venio.billing.service import access_state
    now = datetime(2026, 11, 18, tzinfo=timezone.utc)
    trial = {"status": "trialing", "trial_ends_at": now + timedelta(days=3, hours=1), "stripe_subscription_id": None}
    assert access_state(trial, now) == {"state": "trial", "public_blocked": False, "days_left": 4, "grace_ends_at": None}
    assert access_state({**trial, "trial_ends_at": now - timedelta(hours=1)}, now)["state"] == "trial_expired"
    assert access_state({**trial, "trial_ends_at": now - timedelta(hours=1)}, now)["public_blocked"] is True
    assert access_state({**trial, "stripe_subscription_id": "sub_1"}, now)["state"] == "trial_paid"
    assert access_state({"status": "active"}, now)["public_blocked"] is False
    pd = {"status": "past_due", "past_due_since": now - timedelta(days=3)}
    assert access_state(pd, now)["state"] == "past_due" and not access_state(pd, now)["public_blocked"]
    assert access_state({**pd, "past_due_since": now - timedelta(days=15)}, now)["public_blocked"] is True
    assert access_state({"status": "canceled"}, now)["public_blocked"] is True
    assert access_state({"status": "unpaid"}, now)["state"] == "restricted"


# ----------------------------------------------------------------------------- parcours d'achat

async def test_billing_without_stripe_configured(client_factory):
    pro = client_factory()
    await signup(pro)
    b = (await pro.get("/api/billing")).json()
    assert b["configured"] is False and b["test_mode"] is True
    assert b["access"]["state"] == "trial" and b["subscription"]["plan_code"] == "pro"
    assert [p["code"] for p in b["plans"]] == ["starter", "pro", "business"]
    assert b["plans"][1]["entitlements"]["limit.sms_credits_per_month"] == 200
    r = await pro.post("/api/billing/checkout", json={"plan": "pro", "interval": "month"})
    assert r.status_code == 503 and r.json()["detail"]["code"] == "billing_not_configured"


async def test_checkout_keeps_trial_and_creates_customer_once(client_factory, stripe, priced):
    pro = client_factory()
    t = await signup(pro)
    r1 = await pro.post("/api/billing/checkout", json={"plan": "business", "interval": "year"})
    assert r1.status_code == 200 and r1.json()["url"].startswith("https://checkout.stripe.test/")
    await pro.post("/api/billing/checkout", json={"plan": "pro", "interval": "month"})
    assert len(stripe.customers) == 1                          # client Stripe créé une seule fois
    sessions = [c[2] for c in stripe.calls if c[1] == "/checkout/sessions"]
    first = sessions[0]
    assert first["mode"] == "subscription" and first["line_items[0][price]"] == "price_business_year"
    assert first["client_reference_id"] == t["tenant_id"] and first["subscription_data[metadata][tenant_id]"] == t["tenant_id"]
    assert "subscription_data[trial_end]" in first             # l'essai en cours est conservé
    assert first["success_url"].endswith("/app/abonnement?retour=succes")
    # Le retour du navigateur n'active rien : seul le webhook le fait.
    assert (await pro.get("/api/billing")).json()["subscription"]["status"] == "trialing"


async def test_webhook_activates_subscription_idempotently(client_factory, stripe, priced):
    pro, hook = client_factory(), client_factory()
    t = await signup(pro)
    stripe.subscription("sub_1", t["tenant_id"], plan="business", interval="year")
    evt = _evt("checkout.session.completed", {"id": "cs_1", "mode": "subscription", "subscription": "sub_1",
                                              "client_reference_id": t["tenant_id"]})
    assert (await _webhook(hook, evt, secret="mauvais")).status_code == 400
    assert (await _webhook(hook, evt)).json() == {"result": "subscription_synced"}
    assert (await _webhook(hook, evt)).json() == {"result": "duplicate"}      # Stripe renvoie l'événement
    b = (await pro.get("/api/billing")).json()
    assert b["subscription"]["status"] == "active" and b["subscription"]["plan_code"] == "business"
    assert b["subscription"]["billing_interval"] == "year" and b["access"]["state"] == "active"
    # L'offre Business donne 600 crédits SMS : les droits suivent l'offre payée.
    assert b["credits"]["monthly_limit"] == 600

    # Événements dans le désordre : un vieil « updated » arrive après la résiliation.
    stripe.subscriptions["sub_1"]["status"] = "canceled"
    await _webhook(hook, _evt("customer.subscription.deleted", {"id": "sub_1"}))
    await _webhook(hook, _evt("customer.subscription.updated", {"id": "sub_1", "status": "active"}))
    b = (await pro.get("/api/billing")).json()
    assert b["subscription"]["status"] == "canceled"           # l'état relu chez Stripe fait foi
    page = (await client_factory().get(f"/api/public/{t['slug']}")).json()
    assert page["accepting_bookings"] is False


async def test_past_due_grace_then_public_bookings_suspended(client_factory, database, stripe, priced):
    pro, hook, visitor = client_factory(), client_factory(), client_factory()
    t = await signup(pro)
    stripe.subscription("sub_pd", t["tenant_id"], status="past_due")
    await _webhook(hook, _evt("invoice.payment_failed", {"id": "in_1", "subscription": "sub_pd"}))
    me = (await pro.get("/api/auth/me")).json()
    assert me["access"]["state"] == "past_due" and me["access"]["grace_ends_at"]
    assert (await visitor.get(f"/api/public/{t['slug']}")).json()["accepting_bookings"] is True   # délai de grâce
    await _admin_sql(database, "UPDATE subscription SET past_due_since = now() - interval '15 days' WHERE tenant_id = $1", uuid.UUID(t["tenant_id"]))
    assert (await visitor.get(f"/api/public/{t['slug']}")).json()["accepting_bookings"] is False
    r = await visitor.post(f"/api/public/{t['slug']}/sessions", json={})
    assert r.status_code == 423
    # Paiement régularisé : tout reprend.
    stripe.subscriptions["sub_pd"]["status"] = "active"
    await _webhook(hook, _evt("invoice.paid", {"id": "in_2", "subscription": "sub_pd"}))
    assert (await visitor.get(f"/api/public/{t['slug']}")).json()["accepting_bookings"] is True
    assert (await pro.get("/api/auth/me")).json()["subscription"]["past_due_since"] is None


async def test_trial_expired_without_subscription(client_factory, database):
    pro, visitor = client_factory(), client_factory()
    t = await signup(pro)
    await _admin_sql(database, "UPDATE subscription SET trial_ends_at = now() - interval '1 hour' WHERE tenant_id = $1", uuid.UUID(t["tenant_id"]))
    assert (await pro.get("/api/auth/me")).json()["access"]["state"] == "trial_expired"
    assert (await visitor.get(f"/api/public/{t['slug']}")).json()["accepting_bookings"] is False
    assert (await pro.get("/api/dashboard")).status_code == 200       # l'espace reste consultable


async def test_live_event_refused_in_test_mode(client_factory, stripe):
    r = await _webhook(client_factory(), _evt("invoice.paid", {"id": "in_x"}, livemode=True))
    assert r.status_code == 400 and r.json()["detail"]["code"] == "live_refused"


async def test_portal(client_factory, stripe, priced):
    pro = client_factory()
    await signup(pro)
    assert (await pro.post("/api/billing/portal")).status_code == 409   # aucun client Stripe encore
    await pro.post("/api/billing/checkout", json={"plan": "pro", "interval": "month"})
    r = await pro.post("/api/billing/portal")
    assert r.status_code == 200 and r.json()["url"] == "https://billing.stripe.test/portal"
    portal_call = next(c for c in stripe.calls if c[1] == "/billing_portal/sessions")
    assert portal_call[2]["configuration"] == "bpc_venio" and portal_call[2]["return_url"].endswith("/app/abonnement")


async def test_member_cannot_pay(client_factory, database, stripe, priced):
    pro = client_factory()
    t = await signup(pro)
    await _admin_sql(database, "UPDATE membership SET role = 'member' WHERE tenant_id = $1", uuid.UUID(t["tenant_id"]))
    assert (await pro.post("/api/billing/checkout", json={"plan": "pro"})).status_code == 403


# ----------------------------------------------------------------------------- packs de SMS

async def test_sms_pack_credited_once_and_used_after_monthly_allowance(client_factory, database, stripe, priced, monkeypatch):
    pro, hook = client_factory(), client_factory()
    t = await signup(pro)
    r = await pro.post("/api/billing/sms-pack", json={"pack": "sms_100"})
    assert r.status_code == 200
    call = next(c for c in stripe.calls if c[1] == "/checkout/sessions")
    assert call[2]["mode"] == "payment" and call[2]["line_items[0][price]"] == "price_sms_100" and call[2]["metadata[credits]"] == "100"

    paid = {"id": "cs_pack", "mode": "payment", "payment_status": "paid", "client_reference_id": t["tenant_id"],
            "amount_total": 1000, "metadata": {"tenant_id": t["tenant_id"], "venio_pack": "sms_100", "credits": "100"}}
    assert (await _webhook(hook, _evt("checkout.session.completed", paid))).json()["result"] == "credits_granted"
    # Même paiement signalé par un autre événement : jamais crédité deux fois.
    await _webhook(hook, _evt("checkout.session.completed", paid))
    unpaid = {**paid, "id": "cs_unpaid", "payment_status": "unpaid"}
    assert (await _webhook(hook, _evt("checkout.session.completed", unpaid))).json()["result"] == "payment_not_paid"
    b = (await pro.get("/api/billing")).json()
    assert b["credits"]["extra_balance"] == 100 and len(b["grants"]) == 1

    # Forfait mensuel épuisé : un appel manqué utilise les crédits achetés, rendus si rien ne part.
    from test_missed_calls import _ingest_real, _real_line, _run_jobs
    from venio.modules import notifications
    from venio.telephony import rules
    monkeypatch.setattr(rules, "in_window", lambda local, cfg, is_holiday: True)
    monkeypatch.setattr(notifications.httpx, "post", lambda *a, **k: (_ for _ in ()).throw(AssertionError("réseau")))
    await pro.put("/api/missed-calls/settings", json={"enabled": True, "config": {}})
    await _admin_sql(database, "INSERT INTO usage_counter (tenant_id, key, period, value) VALUES ($1, 'sms_credits',"
                     " date_trunc('month', now() AT TIME ZONE 'Europe/Paris')::date, 200)", uuid.UUID(t["tenant_id"]))
    await _ingest_real(t["tenant_id"], await _real_line(database, t["tenant_id"]))
    await _run_jobs()
    row = (await pro.get("/api/missed-calls/calls")).json()[0]
    assert row["decision"] == "sent" and row["sms_status"] == "logged"       # envois payants désactivés
    assert (await pro.get("/api/billing")).json()["credits"]["extra_balance"] == 100   # crédit rendu
