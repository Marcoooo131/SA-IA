"""Builds the application components from the settings."""

from __future__ import annotations

from pathlib import Path

from .audio.devices import build_backend
from .config import Settings, app_dir, bundled_model_dir
from .history import History, keyring_key
from .notes.client import GatewayNoteClient, NoteClient, SimulatedNoteClient
from .secrets_store import get_ai_key, get_gateway_token
from .session import SessionController
from .stt.base import Recognizer
from .synthetic import ensure_test_audio


def whisper_model_source(settings: Settings) -> tuple[str, bool]:
    """(model name or folder, local files only). Order: folder deployed by IT, model delivered in the
    package, then download from Hugging Face (first launch only)."""
    if settings.whisper_model_dir:
        return str(settings.whisper_model_dir / settings.whisper_model), True
    if (bundled := bundled_model_dir(settings.whisper_model)) is not None:
        return str(bundled), True
    return settings.whisper_model, False


def build_recognizer(settings: Settings, test_audio_dir: Path | None = None) -> Recognizer:
    if settings.recognizer == "whisper":
        from .stt.whisper_local import WhisperRecognizer

        model, local = whisper_model_source(settings)
        return WhisperRecognizer(
            model=model, device=settings.whisper_device, compute_type=settings.whisper_compute_type,
            cpu_threads=settings.whisper_cpu_threads, hotwords=settings.vocabulary, local_files_only=local,
        )
    if settings.recognizer == "scripted":
        from .stt.scripted import ScriptedRecognizer

        # TEST MODE: the recogniser "knows" the script of the synthetic scenario being played
        scenario = settings.test_scenario
        return ScriptedRecognizer.from_file((test_audio_dir or Path(".")) / f"{scenario}.script.json")
    raise ValueError(f"unknown recognizer {settings.recognizer!r}")


def build_note_client(settings: Settings) -> NoteClient:
    if settings.notes_client == "simulated":
        return SimulatedNoteClient()
    if settings.notes_client == "local":
        from .notes.business import load_categories
        from .notes.local_summary import LocalSummaryNoteClient

        return LocalSummaryNoteClient(load_categories(settings), settings.agent_name)
    if settings.notes_client == "anthropic":
        from .notes.direct import DirectAINoteClient

        return DirectAINoteClient(settings, lambda: get_ai_key(settings))
    if not settings.gateway_url:
        from .errors import AppError, ErrorCode

        raise AppError(ErrorCode.CONFIG, "PCD_GATEWAY_URL n'est pas configurée")
    verify: bool | str = str(settings.gateway_ca_bundle) if settings.gateway_ca_bundle else True
    return GatewayNoteClient(settings.gateway_url, lambda: get_gateway_token(settings),
                             timeout_s=settings.gateway_timeout_s, verify=verify)


def build_history(settings: Settings) -> History | None:
    if not settings.history_enabled:
        return None
    return History(app_dir("data") / "history.db", keyring_key(), settings.history_retention_days,
                   settings.history_store_transcript)


def build_controller(settings: Settings, emit) -> SessionController:
    settings.assert_safe()
    test_dir = None
    if settings.audio_backend == "test-files":
        test_dir = ensure_test_audio(settings.test_audio_dir or app_dir("data") / "test_audio")
    backend = build_backend(settings.audio_backend, test_dir, speed=settings.test_audio_speed)
    return SessionController(settings, backend, build_recognizer(settings, test_dir), build_note_client(settings),
                             build_history(settings), emit=emit)
