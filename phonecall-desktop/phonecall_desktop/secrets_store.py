"""Secrets in the OS credential vault (Windows Credential Manager via keyring).

- gateway token: revocable credential for the company gateway (gateway mode);
- AI API key: Anthropic key entered in the app (direct mode). Never written to a file, never
  logged, never sent back to the interface.
In dev/test they may come from ``PCD_GATEWAY_TOKEN`` / ``PCD_ANTHROPIC_API_KEY``; in production
only from the vault.
"""

from __future__ import annotations

import os

from .config import APP_NAME, Environment, Settings

TOKEN_ENTRY = "gateway-token"
AI_KEY_ENTRY = "anthropic-api-key"


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


def get_ai_key(settings: Settings) -> str | None:
    if settings.environment != Environment.PRODUCTION and os.environ.get("PCD_ANTHROPIC_API_KEY"):
        return os.environ["PCD_ANTHROPIC_API_KEY"]
    try:
        import keyring

        return keyring.get_password(APP_NAME, AI_KEY_ENTRY)
    except Exception:  # noqa: BLE001 - no backend available
        return None


def set_ai_key(key: str) -> None:
    import keyring

    keyring.set_password(APP_NAME, AI_KEY_ENTRY, key)


def delete_ai_key() -> None:
    import keyring

    try:
        keyring.delete_password(APP_NAME, AI_KEY_ENTRY)
    except keyring.errors.PasswordDeleteError:
        pass
