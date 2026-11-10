"""Configuration centralisée, lue depuis les variables d'environnement (et un fichier .env optionnel).

Aucune clé API n'est écrite dans le code : tout passe par l'environnement.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    env_file = Path(os.environ.get("ASC_ENV_FILE", PROJECT_ROOT / ".env"))
    if not env_file.exists():
        return
    try:
        from dotenv import load_dotenv  # type: ignore

        load_dotenv(env_file, override=False)
        return
    except ImportError:
        pass
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "oui", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


@dataclass
class Settings:
    data_dir: Path
    database_url: str
    # IA
    llm_provider: str  # none | ollama | openai_compatible | anthropic
    llm_model: str
    llm_base_url: str
    llm_api_key: str
    llm_timeout: int
    allow_external_api: bool
    # Transcription
    transcription_backend: str  # auto | faster_whisper | openai_whisper | none
    whisper_model: str
    whisper_device: str
    # Base de connaissances
    embedding_backend: str  # auto | sentence_transformers | hashing
    embedding_model: str
    vector_store: str  # sqlite | chroma
    # Sécurité
    encryption_key: str
    anonymize_by_default: bool
    retention_days: int
    require_login: bool
    api_token: str
    # Sources publiques
    openalex_mailto: str
    http_user_agent: str
    extra: dict = field(default_factory=dict)

    @property
    def audio_dir(self) -> Path:
        return self.data_dir / "audio"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def external_llm(self) -> bool:
        """Vrai si le fournisseur IA configuré envoie des données hors de la machine."""
        from sales_coach.llm.factory import provider_is_external

        return provider_is_external(self.llm_provider, self.llm_base_url)


def load_settings() -> Settings:
    _load_dotenv()
    data_dir = Path(os.environ.get("ASC_DATA_DIR", PROJECT_ROOT / "data" / "runtime")).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    default_db = f"sqlite:///{(data_dir / 'sales_coach.db').as_posix()}"
    return Settings(
        data_dir=data_dir,
        database_url=os.environ.get("ASC_DATABASE_URL", default_db),
        llm_provider=os.environ.get("ASC_LLM_PROVIDER", "none").strip().lower(),
        llm_model=os.environ.get("ASC_LLM_MODEL", ""),
        llm_base_url=os.environ.get("ASC_LLM_BASE_URL", ""),
        llm_api_key=os.environ.get("ASC_LLM_API_KEY", ""),
        llm_timeout=_int("ASC_LLM_TIMEOUT", 120),
        allow_external_api=_bool("ASC_ALLOW_EXTERNAL_API", False),
        transcription_backend=os.environ.get("ASC_TRANSCRIPTION_BACKEND", "auto").strip().lower(),
        whisper_model=os.environ.get("ASC_WHISPER_MODEL", "small"),
        whisper_device=os.environ.get("ASC_WHISPER_DEVICE", "cpu"),
        embedding_backend=os.environ.get("ASC_EMBEDDING_BACKEND", "auto").strip().lower(),
        embedding_model=os.environ.get(
            "ASC_EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        ),
        vector_store=os.environ.get("ASC_VECTOR_STORE", "sqlite").strip().lower(),
        encryption_key=os.environ.get("ASC_ENCRYPTION_KEY", ""),
        anonymize_by_default=_bool("ASC_ANONYMIZE_BY_DEFAULT", True),
        retention_days=_int("ASC_RETENTION_DAYS", 90),
        require_login=_bool("ASC_REQUIRE_LOGIN", True),
        api_token=os.environ.get("ASC_API_TOKEN", ""),
        openalex_mailto=os.environ.get("ASC_OPENALEX_MAILTO", ""),
        http_user_agent=os.environ.get("ASC_HTTP_USER_AGENT", "AI-Sales-Coach/1.0 (knowledge importer)"),
    )


_settings: Settings | None = None


def get_settings(reload: bool = False) -> Settings:
    global _settings
    if _settings is None or reload:
        _settings = load_settings()
    return _settings
