"""Authentication and role-based access control.

Local accounts (scrypt hashes) from ``SMR_UI_USERS`` and a signed session cookie.
Production target: company SSO (OIDC) with roles mapped from groups (see docs).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass
from enum import IntEnum

from fastapi import HTTPException, Request

from ..config import Settings


class Role(IntEnum):
    ADVISOR = 1  # conseiller: view, confirm, suspend / resume, edit data, record opt-outs
    SUPERVISOR = 2  # responsable: + import, create, cancel, manual reminders
    ADMIN = 3  # + templates, sender numbers, policy, erasure, audit, purge


ROLE_LABELS = {1: "Conseiller", 2: "Responsable", 3: "Administrateur"}


ROLE_NAMES = {"advisor": Role.ADVISOR, "supervisor": Role.SUPERVISOR, "admin": Role.ADMIN}


@dataclass(frozen=True)
class User:
    login: str
    role: Role


def hash_password(password: str, *, n: int = 2**14, r: int = 8, p: int = 1) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, dklen=32)
    b64 = lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")  # noqa: E731
    return f"scrypt${n}${r}${p}${b64(salt)}${b64(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algo, n, r, p, salt, digest = encoded.split("$")
        if algo != "scrypt":
            return False
        pad = lambda s: s + "=" * (-len(s) % 4)  # noqa: E731
        expected = base64.urlsafe_b64decode(pad(digest))
        actual = hashlib.scrypt(
            password.encode(), salt=base64.urlsafe_b64decode(pad(salt)), n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def parse_users(raw: str) -> dict[str, tuple[Role, str]]:
    users: dict[str, tuple[Role, str]] = {}
    for entry in filter(None, (e.strip() for e in raw.split(";"))):
        login, role, pw_hash = entry.split(":", 2)
        users[login] = (ROLE_NAMES[role], pw_hash)
    return users


class LoginThrottle:
    """Locks a login for 15 minutes after 5 consecutive failures (per process)."""

    def __init__(self, max_failures: int = 5, lock_seconds: int = 900):
        self.max_failures, self.lock_seconds = max_failures, lock_seconds
        self._failures: dict[str, tuple[int, float]] = {}

    def locked(self, login: str) -> bool:
        count, since = self._failures.get(login, (0, 0.0))
        if count >= self.max_failures and time.time() - since < self.lock_seconds:
            return True
        if count >= self.max_failures:
            self._failures.pop(login, None)
        return False

    def fail(self, login: str) -> None:
        count, _ = self._failures.get(login, (0, 0.0))
        self._failures[login] = (count + 1, time.time())

    def success(self, login: str) -> None:
        self._failures.pop(login, None)


class Authenticator:
    def __init__(self, settings: Settings):
        self.users = parse_users(settings.ui_users)
        self.throttle = LoginThrottle()

    def authenticate(self, login: str, password: str) -> User | None:
        if self.throttle.locked(login):
            return None
        entry = self.users.get(login)
        # Constant-ish time: verify against a dummy hash when the login is unknown.
        ok = verify_password(password, entry[1] if entry else _DUMMY_HASH)
        if entry and ok:
            self.throttle.success(login)
            return User(login, entry[0])
        self.throttle.fail(login)
        return None


_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def current_user(request: Request) -> User | None:
    data = request.session.get("user")
    if not data:
        return None
    try:
        return User(data["login"], Role(data["role"]))
    except (KeyError, ValueError):
        return None


def require(role: Role):
    def dependency(request: Request) -> User:
        user = current_user(request)
        if user is None:
            raise HTTPException(status_code=401, detail="authentication required")
        if user.role < role:
            raise HTTPException(status_code=403, detail="insufficient role")
        return user

    return dependency


def csrf_token(request: Request) -> str:
    token = request.session.get("csrf")
    if not token:
        token = secrets.token_urlsafe(32)
        request.session["csrf"] = token
    return token


def check_csrf(request: Request, submitted: str | None) -> None:
    expected = request.session.get("csrf")
    if not expected or not submitted or not hmac.compare_digest(expected, submitted):
        raise HTTPException(status_code=403, detail="invalid CSRF token")
