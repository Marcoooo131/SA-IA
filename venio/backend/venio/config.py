from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration lue dans l'environnement (préfixe VENIO_) ou un fichier .env."""

    model_config = SettingsConfigDict(env_prefix="VENIO_", env_file=".env", extra="ignore")

    # Rôle applicatif (membre de venio_app, sans BYPASSRLS).
    database_url: str = "postgresql+asyncpg://venio:venio@localhost:5432/venio"
    # Rôle propriétaire, utilisé uniquement pour les migrations.
    database_admin_url: str = "postgresql+asyncpg://postgres@localhost:5432/venio"

    environment: str = "development"  # development | test | production
    # Clé de signature des liens de gestion de rendez-vous. OBLIGATOIRE en production.
    secret_key: str = "dev-only-change-me"

    public_base_url: str = "http://localhost:3000"
    cookie_secure: bool = False
    session_days: int = 30
    cors_origins: list[str] = ["http://localhost:3000"]

    # Notifications : "log" (enregistrées et visibles, non envoyées) ou "smtp".
    email_provider: str = "log"
    email_from: str = "Venio <no-reply@venio.local>"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True

    hold_minutes: int = 10
    trial_days: int = 14


@lru_cache
def get_settings() -> Settings:
    return Settings()
