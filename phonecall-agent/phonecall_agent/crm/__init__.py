from ..config import Environment, Settings
from .base import CRMConnector, CRMHealth, CRMLookup, CRMRecordRef, CRMWriteReceipt


def build_crm_connector(settings: Settings) -> CRMConnector:
    if settings.crm_connector == "disabled":
        from .disabled import DisabledCRMConnector

        return DisabledCRMConnector()
    if settings.crm_connector == "simulated":
        if settings.environment not in (Environment.DEV, Environment.TEST):
            raise RuntimeError("The simulated CRM connector is forbidden outside dev/test")
        from .simulated import SimulatedCRMConnector

        return SimulatedCRMConnector()
    raise ValueError(
        f"unknown CRM connector {settings.crm_connector!r} — a real connector requires the CRM's official, "
        "authorised interface (see AUDIT.md)"
    )


__all__ = ["CRMConnector", "CRMHealth", "CRMLookup", "CRMRecordRef", "CRMWriteReceipt", "build_crm_connector"]
