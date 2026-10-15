from __future__ import annotations

from ..config import Settings
from .base import DeliveryUpdate, DisabledProvider, OutboundSms, SendResult, SmsProvider
from .simulation import SimulationProvider

__all__ = ["DeliveryUpdate", "OutboundSms", "SendResult", "SmsProvider", "build_provider"]


def build_provider(settings: Settings) -> SmsProvider:
    if settings.sms_provider == "simulation":
        return SimulationProvider()
    if settings.sms_provider == "telephone":
        from .phone_gateway import PhoneGatewayProvider

        return PhoneGatewayProvider(settings)
    if settings.sms_provider == "twilio":
        from .twilio import TwilioProvider

        return TwilioProvider(settings)
    return DisabledProvider()
