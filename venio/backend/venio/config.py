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

    # Notifications : "log" (enregistrées et visibles, non envoyées), "smtp" ou "brevo" (API web, HTTPS).
    email_provider: str = "log"
    email_from: str = "Venio <no-reply@venio.local>"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True
    brevo_api_key: str = ""
    # Interrupteur général des envois facturés à l'unité (SMS, et plus tard appels). Désactivé par défaut :
    # tant qu'il vaut False, aucun SMS ne part, quel que soit le fournisseur configuré. Les emails ne sont
    # pas concernés (offre gratuite Brevo : 300 par jour, sans facturation au-delà, les envois sont refusés).
    paid_sending_enabled: bool = False
    # Fournisseur des SMS réels (utilisé seulement si paid_sending_enabled) et expéditeur par défaut
    # (nom alphanumérique de 11 caractères maximum, à enregistrer chez Brevo).
    sms_provider: str = "brevo"
    sms_default_sender: str = "Venio"

    # Stripe (abonnements, packs de SMS). Mode test uniquement tant que stripe_live_enabled vaut False :
    # une clé réelle (sk_live_…) est alors refusée au démarrage et à chaque appel.
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_live_enabled: bool = False
    billing_grace_days: int = 14   # impayé : accès maintenu ce nombre de jours, puis nouvelles réservations suspendues

    # Envoi des notifications dans le processus de l'API (une seule instance, ex. offre gratuite).
    run_worker: bool = False

    hold_minutes: int = 10
    trial_days: int = 14


@lru_cache
def get_settings() -> Settings:
    return Settings()
