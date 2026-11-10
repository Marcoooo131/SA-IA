"""Comptes, rôles et journalisation des accès."""
from __future__ import annotations

import hashlib
import hmac
import secrets

from sqlalchemy import select

from sales_coach.storage.db import AuditLog, User, session_scope

ROLES = {
    "admin": {"analyze", "view_all", "manage_kb", "manage_users", "settings", "purge", "training", "record_outcome", "view_audit"},
    "manager": {"analyze", "view_all", "manage_kb", "training", "record_outcome", "view_audit"},
    "agent": {"analyze_own", "training"},
}
ROLE_LABELS = {"admin": "Administrateur", "manager": "Manager", "agent": "Commercial"}
_ITER = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITER).hex()
    return f"pbkdf2_sha256${_ITER}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iters, salt, digest = stored.split("$")
    except ValueError:
        return False
    test = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iters)).hex()
    return hmac.compare_digest(test, digest)


def can(role: str, permission: str) -> bool:
    perms = ROLES.get(role, set())
    if permission == "analyze_own":
        return "analyze" in perms or "analyze_own" in perms
    return permission in perms


def has_users() -> bool:
    with session_scope() as s:
        return s.scalar(select(User.id).limit(1)) is not None


def create_user(username: str, password: str, role: str, agent_id: int | None = None) -> User:
    if role not in ROLES:
        raise ValueError(f"Rôle inconnu : {role}")
    if len(password) < 10:
        raise ValueError("Le mot de passe doit contenir au moins 10 caractères.")
    with session_scope() as s:
        if s.scalar(select(User).where(User.username == username)):
            raise ValueError("Ce nom d'utilisateur existe déjà.")
        u = User(username=username.strip(), password_hash=hash_password(password), role=role, agent_id=agent_id)
        s.add(u)
        s.commit()
        return u


def authenticate(username: str, password: str) -> User | None:
    with session_scope() as s:
        u = s.scalar(select(User).where(User.username == username.strip(), User.active.is_(True)))
        ok = bool(u and verify_password(password, u.password_hash))
    audit(username or "?", "connexion" if ok else "échec de connexion")
    return u if ok else None


def list_users() -> list[User]:
    with session_scope() as s:
        return list(s.scalars(select(User).order_by(User.username)))


def set_user_active(user_id: int, active: bool) -> None:
    with session_scope() as s:
        u = s.get(User, user_id)
        if u:
            u.active = active
            s.commit()


def audit(username: str, action: str, target: str = "", detail: str = "") -> None:
    with session_scope() as s:
        s.add(AuditLog(username=username, action=action, target=target[:200], detail=detail[:2000]))
        s.commit()


def read_audit(limit: int = 500) -> list[AuditLog]:
    with session_scope() as s:
        return list(s.scalars(select(AuditLog).order_by(AuditLog.ts.desc()).limit(limit)))
