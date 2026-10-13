"""Configuration.

Two sources:
- environment variables (``PCA_*``) for infrastructure and secrets, never committed;
- a YAML business file (``config/business.example.yaml``) for categories, report format,
  quality thresholds and retention — content that must be validated by the business.
"""

from __future__ import annotations

from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(str, Enum):
    DEV = "dev"
    TEST = "test"
    STAGING = "staging"
    PRODUCTION = "production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PCA_", env_file=".env", extra="ignore")

    environment: Environment = Environment.DEV

    # --- Infrastructure
    database_url: str = "sqlite:///./phonecall_agent.db"
    redis_url: str = "redis://localhost:6379/0"
    # "inline" runs jobs synchronously in-process (tests, demo); "rq" uses Redis workers.
    queue_backend: str = "inline"
    business_config_path: Path = Path("config/business.example.yaml")

    # --- Public URL used by Twilio to call the webhook (needed to verify signatures behind a proxy)
    public_base_url: str = "http://localhost:8000"

    # --- Twilio (server side only, never sent to the browser)
    twilio_account_sid: str = ""
    # Prefer an API key (SK...) + secret for REST calls; the Auth Token is still needed
    # to verify webhook signatures.
    twilio_api_key_sid: str = ""
    twilio_api_key_secret: SecretStr = SecretStr("")
    twilio_auth_token: SecretStr = SecretStr("")
    twilio_api_base: str = "https://api.twilio.com"
    twilio_validate_signature: bool = True
    # Allow-list of account SIDs accepted by the webhook (comma separated). Empty = only twilio_account_sid.
    twilio_allowed_account_sids: str = ""
    twilio_media_format: str = "mp3"  # "mp3" or "wav"
    twilio_delete_recording_after_processing: bool = False  # requires a validated retention decision

    # --- Audio handling
    audio_max_bytes: int = 60 * 1024 * 1024
    audio_max_duration_seconds: int = 2 * 60 * 60
    audio_min_duration_seconds: int = 3
    audio_temp_dir: Path = Path("./var/audio")
    # Fernet key (urlsafe base64, 32 bytes) used to encrypt temporary audio and transcripts at rest.
    data_encryption_key: SecretStr = SecretStr("")
    http_timeout_seconds: float = 30.0
    download_max_attempts: int = 4

    # --- Providers
    transcription_provider: str = "simulated"  # simulated | faster_whisper
    whisper_model: str = "medium"
    whisper_device: str = "cpu"
    generation_provider: str = "simulated"  # simulated | anthropic
    anthropic_api_key: SecretStr = SecretStr("")
    anthropic_model: str = "claude-opus-5-5"
    anthropic_effort: str = "medium"
    anthropic_server_fallback: bool = True

    # --- CRM
    crm_connector: str = "disabled"  # disabled | simulated (tests/demo only)

    # --- Web UI
    session_secret: SecretStr = SecretStr("")
    # Users: "login:role:scrypt_hash" separated by ";" (see `python -m phonecall_agent.cli hash-password`).
    # Production should replace this with the company SSO (OIDC) — see ARCHITECTURE.md.
    ui_users: str = ""
    cookie_secure: bool = True

    # --- Jobs
    job_max_attempts: int = 5
    ai_max_attempts: int = 2  # immediate retries when the model returns an invalid structure
    # Push READY reports (no human validation) to the CRM. Must stay false during the pilot.
    crm_auto_push_ready: bool = False
    metrics_token: SecretStr = SecretStr("")

    # --- Notes API (desktop clients). SHA-256 of the accepted bearer tokens, comma separated.
    note_api_tokens_sha256: str = ""
    note_api_rate_per_minute: int = 20
    note_api_max_chars: int = 200_000

    @field_validator("twilio_media_format")
    @classmethod
    def _media_format(cls, v: str) -> str:
        if v not in {"mp3", "wav"}:
            raise ValueError("twilio_media_format must be mp3 or wav")
        return v

    @property
    def allowed_account_sids(self) -> set[str]:
        sids = {s.strip() for s in self.twilio_allowed_account_sids.split(",") if s.strip()}
        if self.twilio_account_sid:
            sids.add(self.twilio_account_sid)
        return sids

    def assert_safe_for_environment(self) -> None:
        """Refuse dangerous configurations outside of dev/test."""
        if self.environment in (Environment.STAGING, Environment.PRODUCTION):
            problems = []
            if not self.twilio_validate_signature:
                problems.append("twilio_validate_signature must be true")
            if self.crm_connector == "simulated":
                problems.append("crm_connector=simulated is forbidden outside dev/test")
            if self.transcription_provider == "simulated" or self.generation_provider == "simulated":
                problems.append("simulated providers are forbidden outside dev/test")
            if not self.data_encryption_key.get_secret_value():
                problems.append("data_encryption_key is required")
            if not self.session_secret.get_secret_value():
                problems.append("session_secret is required")
            if self.queue_backend == "inline":
                problems.append("queue_backend=inline is not suitable outside dev/test")
            if problems:
                raise RuntimeError("Unsafe configuration: " + "; ".join(problems))


# ---------------------------------------------------------------- business configuration


class CategoryConfig(BaseModel):
    key: str
    label: str
    description: str = ""
    # Indicative keywords used as an independent cross-check of the AI classification.
    keywords: list[str] = Field(default_factory=list)


class ReportFormatConfig(BaseModel):
    max_chars: int = 2000
    min_chars: int = 40
    # Free text appended to the prompt. Must come from validated, anonymised company examples.
    style_instructions: str = ""
    # Anonymised, validated examples of good Phone Calls (few-shot). Empty until provided.
    examples: list[str] = Field(default_factory=list)
    # Optional Jinja2 template rendering the structured report. Empty = use the AI's free text.
    template: str = ""
    # Versioned system prompt file. Empty = phonecall_agent/prompts/phone_call_v2.md
    prompt_file: str = ""


class QualityConfig(BaseModel):
    auto_ready_min_score: int = 80
    always_human_review: bool = True  # pilot default: every report is reviewed
    critical_kinds: list[str] = Field(default_factory=lambda: ["amount", "date", "commitment", "termination"])
    min_transcript_words: int = 15
    max_uncertain_ratio: float = 0.25


class RetentionConfig(BaseModel):
    # Values are placeholders and MUST be validated by the DPO / legal team.
    delete_audio_after_transcription: bool = True
    audio_hours: int = 24  # upper bound if the transcription never succeeds
    transcript_days: int = 30
    report_days: int = 365
    purge_interval_minutes: int = 60


class BusinessConfig(BaseModel):
    version: str = "unvalidated"
    validated: bool = False
    language: str = "fr"
    categories: list[CategoryConfig] = Field(default_factory=list)
    report: ReportFormatConfig = Field(default_factory=ReportFormatConfig)
    quality: QualityConfig = Field(default_factory=QualityConfig)
    retention: RetentionConfig = Field(default_factory=RetentionConfig)

    def category_keys(self) -> set[str]:
        return {c.key for c in self.categories}


def load_business_config(path: Path) -> BusinessConfig:
    data: dict[str, Any] = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    return BusinessConfig.model_validate(data)


@lru_cache
def get_settings() -> Settings:
    return Settings()
