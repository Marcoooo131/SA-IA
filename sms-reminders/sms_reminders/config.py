"""Infrastructure configuration (environment variables ``SMR_*``).

Secrets and infrastructure live here and are never committed. Business settings that an
administrator changes from the UI (sender numbers, templates, scheduling policy) live in the
database — see ``policy.py`` and ``models.ServiceConfig`` / ``models.TemplateSlot``.
"""

from __future__ import annotations

from enum import Enum
from functools import lru_cache

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    DEV = "dev"
    TEST = "test"
    # Single-workstation Windows application (sms-reminders-desktop): local SQLite database,
    # server bound to 127.0.0.1, login by a one-time token generated at each launch.
    DESKTOP = "desktop"
    STAGING = "staging"
    PRODUCTION = "production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SMR_", env_file=".env", extra="ignore")

    environment: Environment = Environment.DEV

    # --- Infrastructure
    database_url: str = "sqlite:///./sms_reminders.db"
    # Base URL at which the provider reaches the delivery-status webhook (empty = no callback).
    public_base_url: str = ""

    # --- SMS provider: "simulation" (default, nothing leaves the server), "twilio", "disabled".
    sms_provider: str = "simulation"
    twilio_account_sid: str = ""
    twilio_auth_token: SecretStr = SecretStr("")
    twilio_api_base: str = "https://api.twilio.com"
    twilio_validate_signature: bool = True
    http_timeout_seconds: float = 15.0

    # --- Worker
    worker_poll_seconds: int = 30
    # A job stuck in "sending" longer than this is considered interrupted (crash / restart).
    worker_lease_seconds: int = 300

    # --- Web UI
    session_secret: SecretStr = SecretStr("")
    # Users: "login:role:scrypt_hash" separated by ";" (see `python -m sms_reminders.cli hash-password`).
    # Roles: advisor (conseiller), supervisor (responsable), admin. Target: company SSO (OIDC).
    ui_users: str = ""
    cookie_secure: bool = True
    # Desktop application only: token given by the launcher in the URL it opens; it logs in the
    # Windows user (SMR_LOCAL_USER) as administrator. Empty = disabled (server deployments).
    local_login_token: SecretStr = SecretStr("")
    local_user: str = ""

    # --- Import
    import_max_bytes: int = 5 * 1024 * 1024
    import_max_rows: int = 5000

    @field_validator("sms_provider")
    @classmethod
    def _provider(cls, v: str) -> str:
        if v not in {"simulation", "twilio", "disabled"}:
            raise ValueError("sms_provider must be simulation, twilio or disabled")
        return v

    @property
    def is_simulation(self) -> bool:
        return self.sms_provider == "simulation"

    def assert_safe_for_environment(self) -> None:
        """Refuse dangerous configurations outside of dev/test."""
        if self.local_login_token.get_secret_value() and self.environment != Environment.DESKTOP:
            raise RuntimeError("Unsafe configuration: SMR_LOCAL_LOGIN_TOKEN is reserved to the desktop application")
        if self.environment not in (Environment.STAGING, Environment.PRODUCTION):
            return
        problems = []
        if not self.session_secret.get_secret_value():
            problems.append("SMR_SESSION_SECRET is required")
        if not self.cookie_secure:
            problems.append("SMR_COOKIE_SECURE must be true")
        if self.database_url.startswith("sqlite"):
            problems.append("SQLite is not suitable outside dev/test (use PostgreSQL)")
        if self.sms_provider == "twilio":
            if not (self.twilio_account_sid and self.twilio_auth_token.get_secret_value()):
                problems.append("Twilio credentials are missing")
            if not self.twilio_validate_signature:
                problems.append("SMR_TWILIO_VALIDATE_SIGNATURE must be true")
        if problems:
            raise RuntimeError("Unsafe configuration: " + "; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    return Settings()
