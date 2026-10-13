"""Dependency container: one place to build (or replace, in tests) every external dependency."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from .config import BusinessConfig, Settings, get_settings, load_business_config
from .crm import CRMConnector, build_crm_connector
from .generation import ReportGenerator, build_generator
from .storage import AudioStore
from .transcription import TranscriptionProvider, build_transcription_provider
from .twilio.recordings import TwilioRecordingClient


@dataclass
class Container:
    settings: Settings
    business: BusinessConfig
    audio_store: AudioStore
    transcriber: TranscriptionProvider
    generator: ReportGenerator
    crm: CRMConnector
    recording_client_factory: Callable[[], TwilioRecordingClient]
    queue: object = None  # set by build_queue (avoids an import cycle)


_container: Container | None = None


def build_container(settings: Settings | None = None) -> Container:
    settings = settings or get_settings()
    settings.assert_safe_for_environment()
    c = Container(
        settings=settings,
        business=load_business_config(settings.business_config_path),
        audio_store=AudioStore(settings.audio_temp_dir),
        transcriber=build_transcription_provider(settings),
        generator=build_generator(settings),
        crm=build_crm_connector(settings),
        recording_client_factory=lambda: TwilioRecordingClient(settings),
    )
    from .jobs import build_queue

    c.queue = build_queue(c)
    return c


def get_container() -> Container:
    global _container
    if _container is None:
        _container = build_container()
    return _container


def set_container(container: Container | None) -> None:
    global _container
    _container = container
