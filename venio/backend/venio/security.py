import base64
import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    if not password_hash:
        return False
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def new_token() -> str:
    """Jeton aléatoire envoyé au client ; seul son hash est stocké."""
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def _sign(secret: str, purpose: str, value: str) -> str:
    mac = hmac.new(secret.encode(), f"{purpose}:{value}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac[:24]).decode().rstrip("=")


def signed_token(secret: str, purpose: str, value: str) -> str:
    """Jeton public non devinable lié à un identifiant (ex. lien de gestion d'un rendez-vous)."""
    return f"{value}.{_sign(secret, purpose, value)}"


def unsign_token(secret: str, purpose: str, token: str) -> str | None:
    value, _, sig = token.rpartition(".")
    if not value or not hmac.compare_digest(sig, _sign(secret, purpose, value)):
        return None
    return value
