"""Encryption at rest for sensitive fields (transcripts, reports) and temporary audio."""

from __future__ import annotations

import logging
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.types import LargeBinary, TypeDecorator

from .config import Environment, get_settings

log = logging.getLogger(__name__)


@lru_cache
def get_fernet() -> Fernet:
    settings = get_settings()
    key = settings.data_encryption_key.get_secret_value()
    if not key:
        if settings.environment in (Environment.DEV, Environment.TEST):
            log.warning(
                "PCA_DATA_ENCRYPTION_KEY not set: using an ephemeral key. "
                "Encrypted data will be unreadable after a restart."
            )
            key = Fernet.generate_key().decode()
        else:
            raise RuntimeError("PCA_DATA_ENCRYPTION_KEY is required")
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_bytes(data: bytes) -> bytes:
    return get_fernet().encrypt(data)


def decrypt_bytes(token: bytes) -> bytes:
    try:
        return get_fernet().decrypt(token)
    except InvalidToken as exc:  # wrong key or tampered data
        raise ValueError("Encrypted data cannot be decrypted with the current key") from exc


class EncryptedText(TypeDecorator):
    """Text column transparently encrypted with Fernet."""

    impl = LargeBinary
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt_bytes(value.encode("utf-8"))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return decrypt_bytes(bytes(value)).decode("utf-8")
