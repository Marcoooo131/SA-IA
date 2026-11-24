from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Response
from pydantic import BaseModel, EmailStr, Field

from ..billing.service import access_state
from ..config import get_settings
from ..db import execute, fetch_all, fetch_one, tx
from ..deps import COOKIE, Auth, current_auth
from ..errors import api_error
from ..flows.templates import TEMPLATES
from ..ratelimit import limit
from ..security import hash_password, new_token, token_hash, verify_password
from . import account_mail
from .provisioning import create_tenant

router = APIRouter(prefix="/api/auth", tags=["auth"])

Vertical = Literal["renovation", "demenagement", "garage", "immobilier", "generique"]


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)
    full_name: str = Field(min_length=2, max_length=120)
    company_name: str = Field(min_length=2, max_length=120)
    vertical: Vertical
    # Acceptation des CGV, CGU et du contrat de sous-traitance (case à cocher obligatoire à l'inscription).
    accept_terms: bool = False


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)


class SwitchIn(BaseModel):
    tenant_id: UUID


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=10, max_length=200)


class TokenIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class PasswordChangeIn(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(min_length=10, max_length=200)


TERMS_VERSION = "2026-11-24"   # à changer à chaque nouvelle version des conditions
RESET_TTL = timedelta(minutes=30)
VERIFY_TTL = timedelta(hours=48)
INVALID_LINK = "Ce lien n'est plus valable (déjà utilisé ou expiré). Demandez-en un nouveau."


async def _new_account_token(conn, user_id: UUID, kind: str, ttl: timedelta) -> str:
    """Crée un jeton à usage unique ; les jetons précédents du même type deviennent inutilisables."""
    await execute(conn, "UPDATE account_token SET used_at = now() WHERE user_id = :u AND kind = :k AND used_at IS NULL",
                  u=user_id, k=kind)
    token = new_token()
    await execute(conn, "INSERT INTO account_token (user_id, kind, token_hash, expires_at) VALUES (:u, :k, :h, :e)",
                  u=user_id, k=kind, h=token_hash(token), e=datetime.now(timezone.utc) + ttl)
    return token


async def _consume_token(conn, token: str, kind: str) -> dict | None:
    return await fetch_one(
        conn,
        "UPDATE account_token SET used_at = now() WHERE token_hash = :h AND kind = :k AND used_at IS NULL"
        " AND expires_at > now() RETURNING user_id",
        h=token_hash(token), k=kind,
    )


def _verify_link(token: str) -> str:
    return f"{get_settings().public_base_url}/verifier-email?jeton={token}"


async def _open_session(response: Response, user_id: UUID, tenant_id: UUID | None) -> None:
    settings = get_settings()
    token = new_token()
    expires = datetime.now(timezone.utc) + timedelta(days=settings.session_days)
    async with tx() as conn:
        await execute(
            conn,
            "INSERT INTO user_session (token_hash, user_id, tenant_id, expires_at) VALUES (:h, :u, :t, :e)",
            h=token_hash(token), u=user_id, t=tenant_id, e=expires,
        )
        await execute(conn, "UPDATE app_user SET last_login_at = now() WHERE id = :u", u=user_id)
    response.set_cookie(
        COOKIE, token, max_age=settings.session_days * 86400, httponly=True,
        secure=settings.cookie_secure, samesite="lax", path="/",
    )


@router.get("/templates")
async def templates() -> list[dict]:
    return [{"code": t["code"], "label": t["label"]} for t in TEMPLATES.values()]


@router.post("/signup", status_code=201, dependencies=[Depends(limit("signup", 10, 3600))])
async def signup(body: SignupIn, response: Response, background: BackgroundTasks) -> dict:
    if not body.accept_terms:
        raise api_error(422, "terms_required", "Vous devez accepter les conditions générales pour créer votre espace.")
    async with tx() as conn:
        if await fetch_one(conn, "SELECT 1 FROM app_user WHERE email = :e", e=body.email):
            raise api_error(409, "email_taken", "Un compte existe déjà avec cet email.")
        user = await fetch_one(
            conn,
            "INSERT INTO app_user (email, full_name, password_hash, terms_accepted_at, terms_version)"
            " VALUES (:e, :n, :p, now(), :v) RETURNING id",
            e=body.email, n=body.full_name.strip(), p=hash_password(body.password), v=TERMS_VERSION,
        )
        tenant_id, slug = await create_tenant(
            conn, name=body.company_name.strip(), vertical=body.vertical, owner_id=user["id"],
            owner_name=body.full_name.strip(), owner_email=body.email,
        )
        token = await _new_account_token(conn, user["id"], "email_verify", VERIFY_TTL)
    await _open_session(response, user["id"], tenant_id)
    background.add_task(account_mail.send, body.email, *account_mail.verify_message(body.full_name.strip(), _verify_link(token)))
    return {"user_id": str(user["id"]), "tenant_id": str(tenant_id), "slug": slug}


@router.post("/login", dependencies=[Depends(limit("login", 10, 300))])
async def login(body: LoginIn, response: Response) -> dict:
    async with tx() as conn:
        user = await fetch_one(conn, "SELECT id, password_hash FROM app_user WHERE email = :e", e=body.email)
    # Vérification systématique (même sans compte) pour ne pas révéler l'existence d'un email par le temps de réponse.
    ok = verify_password(user["password_hash"] if user else hash_password("x" * 12), body.password)
    if not user or not ok:
        raise api_error(401, "invalid_credentials", "Email ou mot de passe incorrect.")
    async with tx(user_id=user["id"]) as conn:
        first = await fetch_one(
            conn, "SELECT tenant_id FROM membership WHERE user_id = :u ORDER BY created_at LIMIT 1", u=user["id"]
        )
    if not first:
        raise api_error(403, "no_workspace", "Ce compte n'est rattaché à aucun espace.")
    await _open_session(response, user["id"], first["tenant_id"])
    return {"ok": True}


@router.post("/password/forgot", status_code=202, dependencies=[Depends(limit("pwd_forgot", 5, 3600))])
async def password_forgot(body: ForgotIn, background: BackgroundTasks) -> dict:
    """Toujours la même réponse, que le compte existe ou non : on ne révèle pas quels emails sont inscrits."""
    async with tx() as conn:
        user = await fetch_one(conn, "SELECT id, email, full_name FROM app_user WHERE email = :e", e=body.email)
        if user and not user["email"].endswith("@demo.venio.invalid"):
            recent = await fetch_one(
                conn, "SELECT 1 FROM account_token WHERE user_id = :u AND kind = 'password_reset'"
                " AND created_at > now() - interval '2 minutes'", u=user["id"])
            if not recent:   # un seul email toutes les 2 minutes, même si le formulaire est renvoyé
                token = await _new_account_token(conn, user["id"], "password_reset", RESET_TTL)
                link = f"{get_settings().public_base_url}/mot-de-passe/nouveau?jeton={token}"
                background.add_task(account_mail.send, user["email"], *account_mail.reset_message(user["full_name"], link))
    return {"ok": True}


@router.post("/password/reset", dependencies=[Depends(limit("pwd_reset", 10, 600))])
async def password_reset(body: ResetIn, background: BackgroundTasks) -> dict:
    async with tx() as conn:
        row = await _consume_token(conn, body.token, "password_reset")
        if not row:
            raise api_error(400, "invalid_token", INVALID_LINK)
        user = await fetch_one(
            conn,
            "UPDATE app_user SET password_hash = :p, email_verified_at = COALESCE(email_verified_at, now())"
            " WHERE id = :u RETURNING email, full_name",
            p=hash_password(body.password), u=row["user_id"],
        )
        # Un mot de passe changé ferme toutes les sessions ouvertes, y compris celle d'un éventuel intrus.
        await execute(conn, "DELETE FROM user_session WHERE user_id = :u", u=row["user_id"])
    background.add_task(account_mail.send, user["email"], *account_mail.password_changed_message(user["full_name"]))
    return {"ok": True}


@router.post("/email/verify", dependencies=[Depends(limit("email_verify", 20, 600))])
async def email_verify(body: TokenIn) -> dict:
    async with tx() as conn:
        row = await _consume_token(conn, body.token, "email_verify")
        if not row:
            raise api_error(400, "invalid_token", INVALID_LINK)
        await execute(conn, "UPDATE app_user SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = :u",
                      u=row["user_id"])
    return {"ok": True}


@router.post("/email/resend", dependencies=[Depends(limit("email_resend", 3, 3600))])
async def email_resend(background: BackgroundTasks, auth: Auth = Depends(current_auth)) -> dict:
    async with tx() as conn:
        user = await fetch_one(conn, "SELECT email, full_name, email_verified_at FROM app_user WHERE id = :u", u=auth.user_id)
        if user["email_verified_at"] or user["email"].endswith("@demo.venio.invalid"):
            return {"ok": True, "already_verified": bool(user["email_verified_at"])}
        token = await _new_account_token(conn, auth.user_id, "email_verify", VERIFY_TTL)
    background.add_task(account_mail.send, user["email"], *account_mail.verify_message(user["full_name"], _verify_link(token)))
    return {"ok": True, "already_verified": False}


@router.post("/password/change", dependencies=[Depends(limit("pwd_change", 10, 600))])
async def password_change(body: PasswordChangeIn, background: BackgroundTasks, auth: Auth = Depends(current_auth)) -> dict:
    async with tx() as conn:
        user = await fetch_one(conn, "SELECT email, full_name, password_hash FROM app_user WHERE id = :u", u=auth.user_id)
        if not verify_password(user["password_hash"], body.current_password):
            raise api_error(400, "wrong_password", "Le mot de passe actuel est incorrect.")
        await execute(conn, "UPDATE app_user SET password_hash = :p WHERE id = :u", p=hash_password(body.new_password), u=auth.user_id)
        # Les autres appareils sont déconnectés ; la session en cours reste ouverte.
        await execute(conn, "DELETE FROM user_session WHERE user_id = :u AND token_hash <> :h", u=auth.user_id, h=auth.token_hash)
        await execute(conn, "UPDATE account_token SET used_at = now() WHERE user_id = :u AND kind = 'password_reset' AND used_at IS NULL",
                      u=auth.user_id)
    background.add_task(account_mail.send, user["email"], *account_mail.password_changed_message(user["full_name"]))
    return {"ok": True}


@router.get("/sessions")
async def sessions(auth: Auth = Depends(current_auth)) -> dict:
    async with tx() as conn:
        rows = await fetch_all(
            conn, "SELECT created_at, token_hash = :h AS current FROM user_session WHERE user_id = :u AND expires_at > now()"
            " ORDER BY created_at DESC", u=auth.user_id, h=auth.token_hash)
    return {"sessions": [{"created_at": r["created_at"].isoformat(), "current": r["current"]} for r in rows]}


@router.post("/sessions/revoke-others")
async def revoke_other_sessions(auth: Auth = Depends(current_auth)) -> dict:
    async with tx() as conn:
        n = await fetch_one(
            conn, "WITH d AS (DELETE FROM user_session WHERE user_id = :u AND token_hash <> :h RETURNING 1) SELECT count(*) AS n FROM d",
            u=auth.user_id, h=auth.token_hash)
    return {"revoked": n["n"]}


@router.post("/logout")
async def logout(response: Response, auth: Auth = Depends(current_auth)) -> dict:
    async with tx() as conn:
        await execute(conn, "DELETE FROM user_session WHERE token_hash = :h", h=auth.token_hash)
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
async def me(auth: Auth = Depends(current_auth)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        tenant = await fetch_one(conn, "SELECT id, slug, name, vertical, timezone, is_demo FROM tenant WHERE id = :t", t=auth.tenant_id)
        sub = await fetch_one(
            conn,
            "SELECT s.status, s.trial_ends_at, s.current_period_end, s.past_due_since, s.stripe_subscription_id,"
            " s.cancel_at_period_end, p.code AS plan_code, p.name AS plan_name"
            " FROM subscription s JOIN plan p ON p.id = s.plan_id WHERE s.tenant_id = :t",
            t=auth.tenant_id,
        )
        verified = await fetch_one(conn, "SELECT email_verified_at FROM app_user WHERE id = :u", u=auth.user_id)
        workspaces = await fetch_all(
            conn,
            "SELECT t.id, t.name, t.slug, m.role FROM membership m JOIN tenant t ON t.id = m.tenant_id"
            " WHERE m.user_id = :u ORDER BY t.name",
            u=auth.user_id,
        )
    return {
        "user": {"id": str(auth.user_id), "email": auth.email, "full_name": auth.full_name,
                 "email_verified": bool(verified and verified["email_verified_at"])},
        "role": auth.role,
        "tenant": {**tenant, "id": str(tenant["id"])},
        "subscription": {k: v for k, v in sub.items() if k != "stripe_subscription_id"} if sub else None,
        "access": access_state(sub),
        "workspaces": [{**w, "id": str(w["id"])} for w in workspaces],
        "public_url": f"{get_settings().public_base_url}/r/{tenant['slug']}",
    }


@router.post("/switch")
async def switch(body: SwitchIn, auth: Auth = Depends(current_auth)) -> dict:
    async with tx(tenant_id=body.tenant_id, user_id=auth.user_id) as conn:
        member = await fetch_one(
            conn, "SELECT 1 FROM membership WHERE tenant_id = :t AND user_id = :u", t=body.tenant_id, u=auth.user_id
        )
        if not member:
            raise api_error(404, "not_found", "Espace introuvable.")
        await execute(conn, "UPDATE user_session SET tenant_id = :t WHERE token_hash = :h", t=body.tenant_id, h=auth.token_hash)
    return {"ok": True}
