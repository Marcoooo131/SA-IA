"""Configuration of the desktop app.

Sources (highest priority first): environment variables ``PCD_*``, then the file
``%APPDATA%\\PhoneCallDesktop\\config.env`` (Windows) / ``~/.config/phonecall-desktop/config.env``.
No secret is stored here: the gateway token and the AI API key live in the Windows Credential
Manager (keyring).
"""

from __future__ import annotations

import os
import sys
from enum import Enum
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from .errors import AppError, ErrorCode

APP_NAME = "PhoneCallDesktop"


def app_dir(kind: str = "config") -> Path:
    if sys.platform == "win32":
        base = os.environ.get("APPDATA" if kind == "config" else "LOCALAPPDATA") or str(Path.home())
        return Path(base) / APP_NAME
    return Path.home() / (".config" if kind == "config" else ".local/share") / "phonecall-desktop"


def install_dir() -> Path | None:
    """Folder of the packaged executable (None when running from the sources)."""
    return Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else None


def config_files() -> tuple[str, ...]:
    """Packaged defaults next to the .exe first, then the user's own file (which wins)."""
    files = []
    if (d := install_dir()) is not None:
        files.append(str(d / "config.env"))
    files.append(str(app_dir() / "config.env"))
    return tuple(files)


def bundled_model_dir(model: str) -> Path | None:
    """Transcription model delivered in the package (``models/<name>`` next to the .exe): no download."""
    if (d := install_dir()) is not None and (d / "models" / model / "model.bin").is_file():
        return d / "models" / model
    return None


class Environment(str, Enum):
    DEV = "dev"
    TEST = "test"
    PRODUCTION = "production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PCD_", env_file=config_files(), env_file_encoding="utf-8",
                                      extra="ignore")

    environment: Environment = Environment.PRODUCTION

    # --- Audio
    audio_backend: str = "wasapi"  # wasapi | test-files (synthetic / anonymised files only)
    test_audio_dir: Path | None = None
    test_audio_speed: float = 1.0
    test_scenario: str = "demenagement"  # scripted recogniser only
    no_signal_warn_s: float = 10.0

    # --- Recognition
    recognizer: str = "whisper"  # whisper | scripted (tests)
    whisper_model: str = "small"
    whisper_model_dir: Path | None = None  # pre-deployed models (no download in production)
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    whisper_cpu_threads: int = 0
    vocabulary: str = "Sector Alarm, télésurveillance, alarme, centrale, détecteur, badge, déménagement, résiliation"
    transcription_finish_timeout_s: float = 120.0

    # --- Notes
    # local (no AI, extractive summary) | anthropic (direct, key in the Windows vault) | gateway | simulated (tests)
    notes_client: str = "gateway"
    agent_name: str = ""  # "Agent" field of the Phone Call (authorised metadata of the PC)
    # Microsoft 365 Copilot Chat (work account) by copy and paste: no API, no cost
    copilot_enabled: bool = True
    copilot_url: str = "https://m365.cloud.microsoft/chat"
    copilot_max_chars: int = 16000  # prompt length warning (official limit not published: to check on the PC)
    note_template: Path | None = None  # Phone Call template; default: phone_call_template.yaml next to the .exe
    gateway_url: str = ""
    gateway_timeout_s: float = 90.0
    gateway_ca_bundle: Path | None = None  # company CA if TLS inspection is used
    # Direct mode: the transcript is sent to Anthropic (approval of the data-protection team required)
    anthropic_model: str = "claude-opus-5-5"
    anthropic_effort: str = "medium"
    anthropic_timeout_s: float = 120.0
    business_config: Path | None = None  # categories / report format; default: business.yaml next to the .exe

    # --- Session & privacy
    require_consent_confirmation: bool = True
    consent_label: str = "L'interlocuteur a été informé de la prise de notes assistée, conformément aux consignes de l'entreprise."
    max_session_minutes: float = 120
    ui_disconnect_stop_s: float = 20.0
    history_enabled: bool = False
    history_retention_days: int = 7
    history_store_transcript: bool = False

    log_level: str = "INFO"

    def assert_safe(self) -> None:
        if self.environment != Environment.PRODUCTION:
            return
        problems = []
        if self.audio_backend != "wasapi":
            problems.append("audio_backend must be wasapi")
        if self.recognizer == "scripted":
            problems.append("scripted recognizer is for tests only")
        if self.notes_client not in ("gateway", "anthropic", "local"):
            problems.append("notes_client must be gateway, anthropic or local")
        if self.notes_client == "gateway" and not self.gateway_url.startswith("https://"):
            problems.append("gateway_url must be https://")
        if problems:
            raise AppError(ErrorCode.CONFIG, "; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    return Settings()
