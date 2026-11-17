from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, EmailStr, Field

from ..config import get_settings
from ..db import execute, fetch_all, fetch_one, tx
from ..deps import COOKIE, Auth, current_auth
from ..errors import api_error
from ..flows.templates import TEMPLATES
from ..ratelimit import limit
from ..security import hash_password, new_token, token_hash, verify_password
from .provisioning import create_tenant

router = APIRouter(prefix="/api/auth", tags=["auth"])

Vertical = Literal["renovation", "demenagement", "generique"]


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)
    full_name: str = Field(min_length=2, max_length=120)
    company_name: str = Field(min_length=2, max_length=120)
    vertical: Vertical


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)


class SwitchIn(BaseModel):
    tenant_id: UUID


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
async def signup(body: SignupIn, response: Response) -> dict:
    async with tx() as conn:
        if await fetch_one(conn, "SELECT 1 FROM app_user WHERE email = :e", e=body.email):
            raise api_error(409, "email_taken", "Un compte existe déjà avec cet email.")
        user = await fetch_one(
            conn,
            "INSERT INTO app_user (email, full_name, password_hash) VALUES (:e, :n, :p) RETURNING id",
            e=body.email, n=body.full_name.strip(), p=hash_password(body.password),
        )
        tenant_id, slug = await create_tenant(
            conn, name=body.company_name.strip(), vertical=body.vertical, owner_id=user["id"],
            owner_name=body.full_name.strip(), owner_email=body.email,
        )
    await _open_session(response, user["id"], tenant_id)
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


@router.post("/logout")
async def logout(response: Response, auth: Auth = Depends(current_auth)) -> dict:
    async with tx() as conn:
        await execute(conn, "DELETE FROM user_session WHERE token_hash = :h", h=auth.token_hash)
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
async def me(auth: Auth = Depends(current_auth)) -> dict:
    async with tx(tenant_id=auth.tenant_id, user_id=auth.user_id) as conn:
        tenant = await fetch_one(conn, "SELECT id, slug, name, vertical, timezone FROM tenant WHERE id = :t", t=auth.tenant_id)
        sub = await fetch_one(
            conn,
            "SELECT s.status, s.trial_ends_at, s.current_period_end, p.code AS plan_code, p.name AS plan_name"
            " FROM subscription s JOIN plan p ON p.id = s.plan_id WHERE s.tenant_id = :t",
            t=auth.tenant_id,
        )
        workspaces = await fetch_all(
            conn,
            "SELECT t.id, t.name, t.slug, m.role FROM membership m JOIN tenant t ON t.id = m.tenant_id"
            " WHERE m.user_id = :u ORDER BY t.name",
            u=auth.user_id,
        )
    return {
        "user": {"id": str(auth.user_id), "email": auth.email, "full_name": auth.full_name},
        "role": auth.role,
        "tenant": {**tenant, "id": str(tenant["id"])},
        "subscription": sub,
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
