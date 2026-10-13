"""Gateway token storage in the OS credential vault (Windows Credential Manager via keyring).

The token is NOT an AI provider key: it is a revocable credential for the company gateway.
In dev/test it may come from ``PCD_GATEWAY_TOKEN``; in production only from the vault.
"""

from __future__ import annotations

import os

from .config import APP_NAME, Environment, Settings

TOKEN_ENTRY = "gateway-token"


def get_gateway_token(settings: Settings) -> str | None:
    if settings.environment != Environment.PRODUCTION and os.environ.get("PCD_GATEWAY_TOKEN"):
        return os.environ["PCD_GATEWAY_TOKEN"]
    try:
        import keyring

        return keyring.get_password(APP_NAME, TOKEN_ENTRY)
    except Exception:  # noqa: BLE001 - no backend available
        return None


def set_gateway_token(token: str) -> None:
    import keyring

    keyring.set_password(APP_NAME, TOKEN_ENTRY, token)


def delete_gateway_token() -> None:
    import keyring

    try:
        keyring.delete_password(APP_NAME, TOKEN_ENTRY)
    except keyring.errors.PasswordDeleteError:
        pass
