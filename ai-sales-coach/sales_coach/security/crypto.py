"""Chiffrement des données sensibles (transcriptions, audio) au repos — Fernet (AES-128-CBC + HMAC-SHA256).

La clé vient de ``ASC_ENCRYPTION_KEY``. À défaut, une clé est générée au premier lancement dans
``<data_dir>/.encryption.key`` (droits 600) avec un avertissement : en production, fournissez la clé
par l'environnement ou un coffre-fort et sauvegardez-la (sans elle, les données sont illisibles).
"""
from __future__ import annotations

import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

_cipher: Fernet | None = None
_key_source = ""


def _load_key(settings) -> bytes:
    global _key_source
    if settings.encryption_key:
        _key_source = "variable d'environnement ASC_ENCRYPTION_KEY"
        return settings.encryption_key.encode()
    key_file = Path(settings.data_dir) / ".encryption.key"
    if key_file.exists():
        _key_source = f"fichier local {key_file} (à sauvegarder)"
        return key_file.read_bytes().strip()
    key = Fernet.generate_key()
    key_file.write_bytes(key)
    try:
        os.chmod(key_file, 0o600)
    except OSError:
        pass
    _key_source = f"fichier local {key_file} généré automatiquement (à sauvegarder)"
    return key


def get_cipher(settings=None) -> Fernet:
    global _cipher
    if _cipher is None:
        if settings is None:
            from sales_coach.config import get_settings

            settings = get_settings()
        _cipher = Fernet(_load_key(settings))
    return _cipher


def reset_cipher() -> None:
    global _cipher
    _cipher = None


def key_source() -> str:
    return _key_source


def encrypt_bytes(data: bytes) -> bytes:
    return get_cipher().encrypt(data)


def decrypt_bytes(token: bytes) -> bytes:
    try:
        return get_cipher().decrypt(token)
    except InvalidToken as exc:
        raise ValueError("Déchiffrement impossible : clé incorrecte ou donnée corrompue.") from exc


def encrypt_text(text: str) -> str:
    return encrypt_bytes(text.encode("utf-8")).decode("ascii")


def decrypt_text(token: str) -> str:
    return decrypt_bytes(token.encode("ascii")).decode("utf-8")


def generate_key() -> str:
    return Fernet.generate_key().decode()
