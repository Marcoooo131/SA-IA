"""Authentification des utilisateurs entreprise (cookie de session HttpOnly)."""
from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, Request

from .db import fetch_one, tx
from .errors import api_error
from .security import token_hash

COOKIE = "venio_session"
ROLE_LEVEL = {"member": 1, "admin": 2, "owner": 3}


@dataclass(frozen=True)
class Auth:
    user_id: UUID
    tenant_id: UUID
    role: str
    email: str
    full_name: str
    token_hash: bytes


async def current_auth(request: Request) -> Auth:
    token = request.cookies.get(COOKIE)
    if not token:
        raise api_error(401, "unauthenticated", "Connexion requise.")
    th = token_hash(token)
    async with tx() as conn:
        sess = await fetch_one(
            conn,
            "SELECT s.user_id, s.tenant_id, u.email, u.full_name FROM user_session s"
            " JOIN app_user u ON u.id = s.user_id WHERE s.token_hash = :h AND s.expires_at > now()",
            h=th,
        )
    if not sess or not sess["tenant_id"]:
        raise api_error(401, "unauthenticated", "Session expirée, reconnectez-vous.")
    async with tx(tenant_id=sess["tenant_id"], user_id=sess["user_id"]) as conn:
        member = await fetch_one(
            conn, "SELECT role FROM membership WHERE tenant_id = :t AND user_id = :u",
            t=sess["tenant_id"], u=sess["user_id"],
        )
    if not member:
        raise api_error(403, "forbidden", "Vous n'avez plus accès à cet espace.")
    return Auth(sess["user_id"], sess["tenant_id"], member["role"], sess["email"], sess["full_name"], th)


def require_role(minimum: str):
    async def dependency(auth: Auth = Depends(current_auth)) -> Auth:
        if ROLE_LEVEL[auth.role] < ROLE_LEVEL[minimum]:
            raise api_error(403, "forbidden", "Action réservée aux administrateurs de l'espace.")
        return auth

    return dependency
