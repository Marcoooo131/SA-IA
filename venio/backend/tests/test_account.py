"""Mot de passe oublié et vérification de l'adresse email."""
import asyncpg
import pytest
from conftest import signup


@pytest.fixture(autouse=True)
def outbox():
    from venio.modules import account_mail
    account_mail.outbox.clear()
    yield account_mail.outbox


def _token(mail: dict) -> str:
    return mail["body"].split("jeton=")[1].split()[0]


async def _email(client) -> str:
    return (await client.get("/api/auth/me")).json()["user"]["email"]


async def test_signup_sends_verification_and_link_verifies(client_factory, outbox):
    c = client_factory()
    await signup(c)
    me = (await c.get("/api/auth/me")).json()
    assert me["user"]["email_verified"] is False
    [mail] = outbox
    assert mail["to"] == me["user"]["email"] and "/verifier-email?jeton=" in mail["body"]
    anonymous = client_factory()                                   # le lien marche même sans être connecté
    assert (await anonymous.post("/api/auth/email/verify", json={"token": _token(mail)})).status_code == 200
    assert (await c.get("/api/auth/me")).json()["user"]["email_verified"] is True
    again = await anonymous.post("/api/auth/email/verify", json={"token": _token(mail)})
    assert again.status_code == 400 and again.json()["detail"]["code"] == "invalid_token"   # usage unique
    assert (await c.post("/api/auth/email/resend")).json() == {"ok": True, "already_verified": True}
    assert len(outbox) == 1


async def test_resend_invalidates_previous_link(client_factory, outbox):
    c = client_factory()
    await signup(c)
    first = _token(outbox[-1])
    assert (await c.post("/api/auth/email/resend")).json()["already_verified"] is False
    second = _token(outbox[-1])
    assert first != second
    assert (await c.post("/api/auth/email/verify", json={"token": first})).status_code == 400
    assert (await c.post("/api/auth/email/verify", json={"token": second})).status_code == 200


async def test_forgot_password_does_not_reveal_accounts(client_factory, outbox):
    c = client_factory()
    await signup(c)
    email = await _email(c)
    outbox.clear()
    anon = client_factory()
    known = await anon.post("/api/auth/password/forgot", json={"email": email})
    unknown = await anon.post("/api/auth/password/forgot", json={"email": "personne@exemple.fr"})
    assert known.status_code == unknown.status_code == 202 and known.json() == unknown.json()
    assert [m["to"] for m in outbox] == [email]
    assert "/mot-de-passe/nouveau?jeton=" in outbox[0]["body"] and "30 minutes" in outbox[0]["body"]
    # Formulaire renvoyé aussitôt : pas de deuxième email (anti-harcèlement).
    await anon.post("/api/auth/password/forgot", json={"email": email})
    assert len(outbox) == 1


async def test_reset_password_changes_it_and_closes_sessions(client_factory, outbox):
    c = client_factory()
    await signup(c)
    email = await _email(c)
    other_device = client_factory()
    assert (await other_device.post("/api/auth/login", json={"email": email, "password": "motdepasse-solide"})).status_code == 200
    await client_factory().post("/api/auth/password/forgot", json={"email": email})
    token = _token(outbox[-1])
    anon = client_factory()
    short = await anon.post("/api/auth/password/reset", json={"token": token, "password": "court"})
    assert short.status_code == 422                                # 10 caractères minimum, jeton non consommé
    ok = await anon.post("/api/auth/password/reset", json={"token": token, "password": "nouveau-mot-de-passe"})
    assert ok.status_code == 200
    assert outbox[-1]["subject"] == "Votre mot de passe a été modifié"
    # Toutes les sessions sont fermées, l'ancien mot de passe ne marche plus, le nouveau oui.
    assert (await c.get("/api/auth/me")).status_code == 401
    assert (await other_device.get("/api/auth/me")).status_code == 401
    assert (await anon.post("/api/auth/login", json={"email": email, "password": "motdepasse-solide"})).status_code == 401
    assert (await anon.post("/api/auth/login", json={"email": email, "password": "nouveau-mot-de-passe"})).status_code == 200
    me = (await anon.get("/api/auth/me")).json()
    assert me["user"]["email_verified"] is True                    # recevoir l'email prouve l'adresse
    reuse = await client_factory().post("/api/auth/password/reset", json={"token": token, "password": "encore-un-autre-mdp"})
    assert reuse.status_code == 400


async def test_expired_or_forged_reset_link_refused(client_factory, outbox, database):
    c = client_factory()
    await signup(c)
    email = await _email(c)
    await c.post("/api/auth/password/forgot", json={"email": email})
    token = _token(outbox[-1])
    conn = await asyncpg.connect(database["admin_url"])
    try:
        await conn.execute("UPDATE account_token SET expires_at = now() - interval '1 minute' WHERE kind = 'password_reset'")
        stored = await conn.fetchval("SELECT count(*) FROM account_token WHERE token_hash = convert_to($1, 'UTF8')", token)
    finally:
        await conn.close()
    assert stored == 0                                              # seul le hash du jeton est stocké
    anon = client_factory()
    assert (await anon.post("/api/auth/password/reset", json={"token": token, "password": "nouveau-mot-de-passe"})).status_code == 400
    forged = await anon.post("/api/auth/password/reset", json={"token": "x" * 43, "password": "nouveau-mot-de-passe"})
    assert forged.status_code == 400 and forged.json()["detail"]["message"].startswith("Ce lien n'est plus valable")


async def test_demo_accounts_get_no_account_email(client_factory, outbox):
    visitor = client_factory()
    await visitor.post("/api/demo/start")
    email = await _email(visitor)
    await client_factory().post("/api/auth/password/forgot", json={"email": email})
    await visitor.post("/api/auth/email/resend")
    assert list(outbox) == []


async def test_terms_acceptance_is_recorded(client_factory, database):
    c = client_factory()
    await signup(c)
    email = await _email(c)
    conn = await asyncpg.connect(database["admin_url"])
    try:
        row = await conn.fetchrow("SELECT terms_accepted_at, terms_version FROM app_user WHERE email = $1", email)
    finally:
        await conn.close()
    from venio.modules.identity import TERMS_VERSION
    assert row["terms_accepted_at"] is not None and row["terms_version"] == TERMS_VERSION
