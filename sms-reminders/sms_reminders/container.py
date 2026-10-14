"""Dependency container: one place to build (or replace, in tests) external dependencies."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime

from .config import Settings, get_settings
from .crm import CrmConnector, DisabledCrm
from .models import utcnow
from .providers import SmsProvider, build_provider


@dataclass
class Container:
    settings: Settings
    provider: SmsProvider
    crm: CrmConnector = field(default_factory=DisabledCrm)
    clock: Callable[[], datetime] = utcnow
    # Desktop application only: lets an administrator configure the SMS provider from the UI
    # (sms_desktop.provider_store). None on servers: the provider comes from environment variables.
    provider_store: object | None = None

    def now(self) -> datetime:
        return self.clock()


_container: Container | None = None


def build_container(settings: Settings | None = None) -> Container:
    settings = settings or get_settings()
    settings.assert_safe_for_environment()
    return Container(settings=settings, provider=build_provider(settings))


def get_container() -> Container:
    global _container
    if _container is None:
        _container = build_container()
    return _container


def set_container(container: Container | None) -> None:
    global _container
    _container = container
